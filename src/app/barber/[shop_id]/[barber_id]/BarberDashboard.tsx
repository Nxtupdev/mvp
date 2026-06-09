'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ShopLogo from '@/components/ShopLogo'
import {
  Avatar,
  AvatarPicker,
  isRenderableAvatar,
  type ShopAvatar,
} from '@/components/avatars'
import { InstallButton } from '@/components/InstallButton'
import {
  buildBarberOrder,
  buildHeldPositions,
  sortByQueueOrder,
} from '@/lib/queue-order'

// ──────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────

type Status = 'available' | 'busy' | 'break' | 'offline'

type Shop = {
  id: string
  name: string
  logo_url: string | null
  first_break_minutes: number
  next_break_minutes: number
  keep_position_on_break: boolean
  break_position_grace_minutes: number
  // 'guaranteed' (default) or 'not_guaranteed' — see migration 014.
  // Drives whether BreakStatus shows a "puede perderse si te brincan"
  // warning + whether a forfeited reservation surfaces visibly.
  break_mode: 'guaranteed' | 'not_guaranteed'
}

type Barber = {
  id: string
  name: string
  status: Status
  // Widened from AvatarId so URL-style shop avatars round-trip.
  avatar: string | null
  available_since: string | null
  break_started_at: string | null
  break_held_since: string | null
  break_minutes_at_start: number | null
  breaks_taken_today: number | null
  // True once any barber below us (snapshot at break start) completed
  // a walk-in. Only set when shop.break_mode = 'not_guaranteed'.
  break_invalidated?: boolean | null
  // Migración 019 (legacy) — counter de cortes pendientes en el sistema
  // viejo de peaje. La migración 047 lo deja siempre en 0 — no leerlo más.
  late_toll_remaining?: number | null
  // Migración 047 — sanción por tiempo. Si sanctioned_until > now(), el
  // barbero no recibe walk-ins (pero sí clientes que lo pidan por nombre).
  sanctioned_until?: string | null
}

type Peer = Barber

type DeviceClient = {
  id: string
  client_name: string
  position: number
  // Tiempo en que el sistema llamó al cliente (le asignó el barbero).
  // Necesario para mostrar el timer de 2 min al barbero en el PWA y
  // que sepa cuánto tiempo le queda antes de la cascada del 018/041.
  called_at: string | null
} | null

type ActionTone = 'active' | 'busy' | 'break' | 'offline'

// ──────────────────────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────────────────────

export default function BarberDashboard({
  shopId,
  shop,
  initialBarber,
  initialPeers,
  initialCalledClient,
  initialCurrentClient,
  shopAvatars = [],
}: {
  shopId: string
  shop: Shop
  initialBarber: Barber
  initialPeers: Peer[]
  initialCalledClient: DeviceClient
  initialCurrentClient: DeviceClient
  // initialCutsToday kept in the page-level fetch for forward compat;
  // we just don't surface it on screen right now.
  initialCutsToday?: number
  // Shop-specific custom icons (migration 015). Passed through to
  // the avatar picker so the barber sees their shop's bespoke set
  // ahead of the generic stroke pool.
  shopAvatars?: ShopAvatar[]
}) {
  const [barber, setBarber] = useState<Barber>({
    ...initialBarber,
    avatar: isRenderableAvatar(initialBarber.avatar) ? initialBarber.avatar : null,
  })
  // Tick de 30s para que el banner de sanción desaparezca solo cuando
  // expire (sin esperar realtime). react-hooks/purity prohíbe leer
  // Date.now() en render — el state hace la lectura inmutable a nivel
  // de cada render frame.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])
  const [peers, setPeers] = useState<Peer[]>(
    initialPeers.map(p => ({
      ...p,
      avatar: isRenderableAvatar(p.avatar) ? p.avatar : null,
    })),
  )
  const [calledClient, setCalledClient] =
    useState<DeviceClient>(initialCalledClient)
  const [currentClient, setCurrentClient] =
    useState<DeviceClient>(initialCurrentClient)
  // Called entries belonging to OTHER barbers in the shop. We watch
  // them so the "next available" barber can pre-empt a no-show by
  // tapping "Tomar yo" after the original has stalled for 60s.
  type PeerCalled = {
    id: string
    barber_id: string
    client_name: string
    called_at: string
  }
  const [peerCalled, setPeerCalled] = useState<PeerCalled[]>([])
  // Reactive clock so the "x seconds since called" computation
  // recomputes the claim eligibility window without realtime pings.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 3000)
    return () => clearInterval(id)
  }, [])
  const [pending, setPending] = useState<ActionTone | null>(null)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)
  const [claiming, setClaiming] = useState(false)

  // ── Remember this barber URL for PWA mis-install recovery ──
  //
  // Why: if the barber accidentally installed the PWA from the public
  // landing instead of from their own dashboard, the home-screen icon
  // ends up pointing at `/?source=pwa` and dumps them on the landing.
  // We stamp a cookie here so that landing render (src/app/page.tsx)
  // can detect "this device knows about a barber URL" and redirect
  // them back here server-side — no flash, no extra action from the
  // barber.
  //
  // Cookie (not localStorage) so the redirect runs on the server
  // before any HTML hits the wire. 30-day TTL so stale URLs from old
  // shops eventually drop out.
  useEffect(() => {
    if (typeof document === 'undefined') return
    const url = `/barber/${shopId}/${barber.id}`
    document.cookie = `nxtup_last_barber_url=${encodeURIComponent(url)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
  }, [shopId, barber.id])

  // ── Live updates ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    const fetchBarber = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated, late_toll_remaining, sanctioned_until',
        )
        .eq('id', barber.id)
        .single()
      if (data) {
        const row = data as { avatar?: unknown } & Omit<Barber, 'avatar'>
        setBarber({ ...row, avatar: isRenderableAvatar(row.avatar) ? row.avatar : null })
      }
    }

    // Fetch peers (incluye offline). El roster visual los muestra
    // al final de la lista; los cálculos de FIFO (buildBarberOrder)
    // ya filtran por status='available' internamente.
    const fetchPeers = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated, late_toll_remaining, sanctioned_until',
        )
        .eq('shop_id', shopId)
        .order('name')
      if (data) {
        setPeers(
          (data as unknown[]).map(r => {
            const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
            return { ...row, avatar: isRenderableAvatar(row.avatar) ? row.avatar : null }
          }),
        )
      }
    }

    const fetchClients = async () => {
      const [{ data: called }, { data: current }, { data: allCalled }] =
        await Promise.all([
          supabase
            .from('queue_entries')
            .select('id, client_name, position, called_at')
            .eq('barber_id', barber.id)
            .eq('status', 'called')
            .maybeSingle(),
          supabase
            .from('queue_entries')
            .select('id, client_name, position, called_at')
            .eq('barber_id', barber.id)
            .eq('status', 'in_progress')
            .maybeSingle(),
          // All called entries in this shop — needed so the
          // next-available barber can spot a stuck call from a peer
          // and offer to take it over.
          supabase
            .from('queue_entries')
            .select('id, barber_id, client_name, called_at')
            .eq('shop_id', shopId)
            .eq('status', 'called'),
        ])
      setCalledClient(called)
      setCurrentClient(current)
      setPeerCalled(
        ((allCalled ?? []) as PeerCalled[]).filter(
          e => e.barber_id !== barber.id && !!e.called_at,
        ),
      )
    }

    const channel = supabase
      .channel(`barber-dashboard-${barber.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'barbers',
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          fetchBarber()
          fetchPeers()
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `shop_id=eq.${shopId}`,
        },
        () => {
          fetchClients()
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [barber.id, shopId])

  // ── Derived state ───────────────────────────────────────────────
  const fifoPosition = useMemo(() => {
    return buildBarberOrder(peers).get(barber.id)
  }, [peers, barber.id])

  const heldPosition = useMemo(() => {
    return buildHeldPositions(peers).get(barber.id)
  }, [peers, barber.id])

  // ── No-show takeover detection ──────────────────────────────────
  //
  // If any peer barber has had a client in 'called' status for >60s
  // AND I'm the next-available barber in the FIFO (excluding the
  // stalled one), surface a "Tomar yo" banner so I can pre-empt the
  // 5-min auto-release and keep the queue moving.
  //
  // Re-evaluated whenever peerCalled or peers changes, AND on every
  // `nowTick` so the banner appears on time without a realtime ping.
  const stuckCallFor: PeerCalled | null = useMemo(() => {
    if (barber.status !== 'available' || !barber.available_since) return null
    if (peerCalled.length === 0) return null

    // For each stalled call, check if I am the rightful next claimer.
    for (const entry of peerCalled) {
      const ageSec = (nowTick - new Date(entry.called_at).getTime()) / 1000
      if (ageSec < 60) continue

      // FIFO-by-availability among ACTIVE barbers, excluding the
      // stalled one. We have to include `barber` itself in the list
      // since `peers` may or may not include self depending on the
      // fetcher.
      const candidatePool = [
        ...peers.filter(p => p.id !== barber.id),
        { ...barber },
      ]
      const fifo = candidatePool
        .filter(
          p =>
            p.status === 'available' &&
            p.available_since &&
            p.id !== entry.barber_id,
        )
        .sort(
          (a, b) =>
            new Date(a.available_since!).getTime() -
            new Date(b.available_since!).getTime(),
        )
      if (fifo[0]?.id === barber.id) return entry
    }
    return null
  }, [peerCalled, peers, barber, nowTick])

  // Name of the stalled barber, for the banner copy.
  const stuckBarberName: string | null = useMemo(() => {
    if (!stuckCallFor) return null
    return peers.find(p => p.id === stuckCallFor.barber_id)?.name ?? 'el barbero'
  }, [stuckCallFor, peers])

  // ── Claim handler ──────────────────────────────────────────────
  async function claimStuckEntry() {
    if (claiming || !stuckCallFor) return
    setClaiming(true)
    setError('')
    try {
      const res = await fetch(`/api/queue/${stuckCallFor.id}/claim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barber_id: barber.id }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'No se pudo tomar el cliente')
      }
      // On success the realtime subscription will rehydrate state;
      // no manual setCalledClient needed.
    } catch {
      setError('Error de red')
    } finally {
      setClaiming(false)
    }
  }

  // ── Action handler ──────────────────────────────────────────────
  async function press(target: ActionTone) {
    if (pending) return
    const apiTarget =
      target === 'active'
        ? 'available'
        : target === 'busy'
          ? 'busy'
          : target === 'break'
            ? 'break'
            : 'offline'
    setPending(target)
    setError('')
    try {
      const res = await fetch(`/api/barbers/${barber.id}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: apiTarget }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error')
      }
    } catch {
      setError('Error de red')
    } finally {
      setPending(null)
    }
  }

  // ── Avatar picker save ──────────────────────────────────────────
  async function saveAvatar(next: string | null) {
    if (savingAvatar) return
    setSavingAvatar(true)
    setError('')
    try {
      const res = await fetch(`/api/barbers/${barber.id}/avatar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatar: next }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'No se pudo guardar el icono')
      } else {
        // Optimistic local update — realtime will confirm.
        setBarber(b => ({ ...b, avatar: next }))
        setPickerOpen(false)
      }
    } catch {
      setError('Error de red')
    } finally {
      setSavingAvatar(false)
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <main className="min-h-[100dvh] flex flex-col max-w-md mx-auto w-full">
      {/* PWA install banner — high-visibility so barbers who never
          scroll to the footer still get a chance to install. The
          original prominent button in the footer stays too, as a
          backstop. Banner auto-hides once installed or when the
          browser doesn't support PWA install (e.g. WhatsApp's
          in-app webview can't install). */}
      <InstallButton variant="banner" />

      {/* App bar — edge-to-edge "chrome" at the top of the standalone
          PWA so it feels like a real installed app rather than a
          floating web page. Sticky so it stays put if the viewport is
          short and the barber has to scroll for the kiosk link. */}
      <header className="sticky top-0 z-10 flex items-center gap-3 px-5 py-4 border-b border-nxtup-line bg-nxtup-bg/95 backdrop-blur-md">
        {shop.logo_url ? (
          <ShopLogo url={shop.logo_url} name={shop.name} size={32} />
        ) : (
          // Letter-mark fallback so the bar has a consistent left
          // anchor even for shops that never uploaded a logo.
          <div className="w-8 h-8 rounded-md bg-nxtup-line flex items-center justify-center text-white font-black text-sm">
            {shop.name.charAt(0).toUpperCase()}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.25em] font-bold leading-none mb-1">
            Mi panel
          </p>
          <h2 className="text-white text-sm font-bold tracking-tight truncate leading-none">
            {shop.name}
          </h2>
        </div>
      </header>

      {/* Body — the original content padding moved here so the app
          bar above can extend to the screen edges. */}
      <div className="flex-1 flex flex-col px-5 pt-8 pb-10">

      {/* Late-arrival sanction banner (migración 047) — naranja, se
          muestra mientras sanctioned_until está en el futuro. El barbero
          ve hasta qué hora dura la sanción. Renderizado ANTES del banner
          de no-show porque la sanción es estado más importante que un
          peer atascado (un barbero sancionado no debería poder usar
          "Tomar yo" de todas formas — el route lo bloquea). */}
      {(() => {
        const sanctionedUntil = barber.sanctioned_until
          ? new Date(barber.sanctioned_until)
          : null
        const isSanctioned =
          sanctionedUntil !== null && sanctionedUntil.getTime() > nowMs
        if (!isSanctioned) return null
        const endTime = sanctionedUntil!.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })
        return (
          <div className="border border-orange-500/60 bg-orange-500/10 rounded-xl p-4 mb-6 flex items-start gap-3">
            <span className="text-orange-400 text-xl leading-none mt-0.5">⏳</span>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold leading-snug">
                Sancionado por llegada tarde
              </p>
              <p className="text-nxtup-muted text-xs mt-1 leading-relaxed">
                Hasta las <span className="text-white font-semibold">{endTime}</span>{' '}
                no recibes walk-ins. Sí puedes atender clientes que te pidan
                por nombre. Vuelve a la rotación cuando termine la sanción.
              </p>
            </div>
          </div>
        )
      })()}

      {/* No-show takeover banner — only renders when this barber is
          the next-available AND a peer's called client has been
          waiting >60s. Lets them pre-empt the 5-min auto-release. */}
      {stuckCallFor && (
        <div className="border border-nxtup-break bg-nxtup-break/10 rounded-xl p-4 mb-6 flex items-start gap-3">
          <span className="text-nxtup-break text-xl leading-none mt-0.5">⚠</span>
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-semibold leading-snug">
              {stuckCallFor.client_name} lleva esperando a {stuckBarberName}
            </p>
            <p className="text-nxtup-muted text-xs mt-0.5">
              Eres el siguiente disponible. Si {stuckBarberName} no aparece,
              puedes atender al cliente.
            </p>
            <button
              type="button"
              onClick={claimStuckEntry}
              disabled={claiming}
              className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white text-black text-xs font-bold tracking-tight active:scale-[0.98] disabled:opacity-50 transition-all"
            >
              {claiming ? 'Tomando...' : 'Tomar yo →'}
            </button>
          </div>
        </div>
      )}

      {/* Hero — clickable avatar opens picker, name, status */}
      <section className="flex flex-col items-center text-center gap-3 mb-10">
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label="Cambiar mi icono"
          className="relative rounded-full transition-transform active:scale-95 hover:opacity-90"
        >
          <Avatar avatar={barber.avatar} name={barber.name} size={96} />
          <span className="absolute bottom-0 right-0 bg-nxtup-line border border-nxtup-dim rounded-full w-7 h-7 flex items-center justify-center text-nxtup-muted text-xs">
            ✎
          </span>
        </button>
        <h1 className="text-3xl font-black tracking-tight">{barber.name}</h1>
        <StatusLine
          barber={barber}
          shop={shop}
          fifoPosition={fifoPosition}
          heldPosition={heldPosition}
          calledClient={calledClient}
          currentClient={currentClient}
        />
      </section>

      {/* Action buttons — solo los 3 principales: AVAILABLE, BUSY,
          BREAK. OFFLINE se movió al final de la pantalla (debajo del
          PeerRoster) por feedback del dueño: los barberos lo tocaban
          por accidente mid-shift y perdían su turno al volver. Ahora
          tienen que scrollear intencionalmente al fondo para llegar
          a él — no hay excusa de tap accidental. */}

      {/* ── Aviso pre-break: próximo break #3+ pierde protección ───────
          Solo se renderiza cuando el barbero está en AVAILABLE (estado
          desde donde tendría sentido tapear break a continuación) Y el
          shop está en modo 'guaranteed' Y ya gastó sus 2 breaks
          protegidos. Anti-fraude para el patrón del shop nuevo: barberos
          que tapeaban break para "saltarse" un walk-in difícil.
          breaks_taken_today aún no se incrementó (no estamos en break),
          así que >= 2 significa "el próximo será #3 = sin protección". */}
      {barber.status === 'available' &&
        shop.break_mode === 'guaranteed' &&
        (barber.breaks_taken_today ?? 0) >= 2 && (
          <div className="rounded-xl border border-nxtup-break/40 bg-nxtup-break/10 px-4 py-3 mb-3">
            <p className="text-nxtup-break text-xs font-bold uppercase tracking-wider mb-1">
              ⚠ Tu próximo break ya no estará protegido
            </p>
            <p className="text-nxtup-muted text-xs leading-relaxed">
              Tomaste {barber.breaks_taken_today} breaks hoy. El siguiente
              break (#{(barber.breaks_taken_today ?? 0) + 1}) pierde tu
              posición si alguien debajo de ti atiende un walk-in.
            </p>
          </div>
        )}

      <section className="grid grid-cols-3 gap-2 mb-2">
        <ActionButton
          label="AVAILABLE"
          tone="active"
          current={barber.status === 'available'}
          loading={pending === 'active'}
          disabled={!!pending && pending !== 'active'}
          onClick={() => press('active')}
        />
        <ActionButton
          label="BUSY"
          tone="busy"
          current={barber.status === 'busy'}
          loading={pending === 'busy'}
          disabled={!!pending && pending !== 'busy'}
          onClick={() => press('busy')}
        />
        <ActionButton
          label="BREAK"
          tone="break"
          current={barber.status === 'break'}
          loading={pending === 'break'}
          disabled={!!pending && pending !== 'break'}
          onClick={() => press('break')}
        />
      </section>

      {error && (
        <p className="text-nxtup-busy text-sm mt-4 text-center" role="alert">
          {error}
        </p>
      )}

      {/* Roster — turnos de todos los barberos del shop. Lo que el
          barbero quiere ver desde fuera del shop (típicamente en
          break) para saber cómo se mueven los turnos sin tener que
          volver al TV físicamente. Realtime — actualiza solo cuando
          alguien cambia de estado. */}
      <PeerRoster
        currentBarberId={barber.id}
        peers={peers}
        shop={shop}
        nowTick={nowTick}
      />

      {/* OFFLINE — movido aquí intencionalmente debajo del PeerRoster
          para que requiera scroll intencional. El barbero tiene que
          pasar visualmente por TODA la cola y la lista de compañeros
          antes de llegar al botón. Eso prácticamente elimina los
          taps accidentales mid-shift que reportó el dueño. */}
      <section className="grid grid-cols-1 mt-8 mb-2">
        <ActionButton
          label="OFFLINE"
          tone="offline"
          current={barber.status === 'offline'}
          loading={pending === 'offline'}
          disabled={!!pending && pending !== 'offline'}
          onClick={() => press('offline')}
        />
      </section>

      {/* Footer — install + kiosk shortcut */}
      <footer className="mt-auto pt-10 flex flex-col items-center gap-4">
        {/* InstallButton hides itself when already installed or unsupported,
            so it won't take up footer space once the barber has installed. */}
        <InstallButton variant="prominent" />
        <Link
          href={`/barber/${shopId}/${barber.id}/kiosk`}
          className="text-nxtup-dim text-xs underline underline-offset-4 hover:text-nxtup-muted"
        >
          Abrir modo pantalla completa →
        </Link>
      </footer>

      </div>

      {/* Avatar picker modal — kept outside the body wrapper so the
          fixed overlay doesn't inherit the px-5 padding. */}
      {pickerOpen && (
        <AvatarPickerModal
          value={barber.avatar}
          onChange={saveAvatar}
          onClose={() => setPickerOpen(false)}
          saving={savingAvatar}
          shopAvatars={shopAvatars}
        />
      )}
    </main>
  )
}

// ──────────────────────────────────────────────────────────────
// Bits
// ──────────────────────────────────────────────────────────────

function StatusLine({
  barber,
  shop,
  fifoPosition,
  heldPosition,
  calledClient,
  currentClient,
}: {
  barber: Barber
  shop: Shop
  fifoPosition: number | undefined
  heldPosition: number | undefined
  calledClient: DeviceClient
  currentClient: DeviceClient
}) {
  if (barber.status === 'offline') {
    return <p className="text-nxtup-dim text-sm">Off · sin turno</p>
  }
  if (barber.status === 'busy' && currentClient) {
    return (
      <p className="text-nxtup-busy text-sm font-medium">
        Con {currentClient.client_name}
      </p>
    )
  }
  if (barber.status === 'break') {
    return (
      <BreakStatus
        barber={barber}
        shop={shop}
        heldPosition={heldPosition}
      />
    )
  }
  if (barber.status === 'available' && calledClient) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-nxtup-active text-sm font-medium">
          → Llamado: {calledClient.client_name}
        </p>
        {calledClient.called_at && (
          <CalledCountdown calledAt={calledClient.called_at} />
        )}
      </div>
    )
  }
  if (barber.status === 'available' && fifoPosition !== undefined) {
    return (
      <p className="text-nxtup-active text-sm font-medium">
        En fila #{fifoPosition}
        {fifoPosition === 1 ? ' · Eres el siguiente' : ''}
      </p>
    )
  }
  return <p className="text-nxtup-muted text-sm">Disponible</p>
}

function BreakStatus({
  barber,
  shop,
  heldPosition,
}: {
  barber: Barber
  shop: Shop
  heldPosition: number | undefined
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!barber.break_started_at) {
    return <p className="text-nxtup-break text-sm font-medium">Descanso</p>
  }
  const startedMs = new Date(barber.break_started_at).getTime()
  const elapsedSec = Math.max(0, Math.floor((now - startedMs) / 1000))
  const breakMin =
    barber.break_minutes_at_start ??
    ((barber.breaks_taken_today ?? 1) <= 1
      ? shop.first_break_minutes
      : shop.next_break_minutes)
  const remaining = breakMin * 60 - elapsedSec
  const mm = Math.floor(Math.abs(remaining) / 60)
  const ss = Math.abs(remaining) % 60
  const sign = remaining < 0 ? '+' : ''
  const formatted = `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  // ── Modo efectivo de este break (anti-fraude) ──────────────────
  // Replica la lógica del state route: shop='guaranteed' protege
  // solo los primeros 2 breaks; el 3er break en adelante se comporta
  // como 'not_guaranteed' (puede perder posición). Shops en
  // 'not_guaranteed' real siempre operan sin protección.
  // breaks_taken_today YA fue incrementado al entrar al break, así
  // que <= 2 = este es break #1 o #2 → protegido.
  const breakCount = barber.breaks_taken_today ?? 0
  const effectiveBreakMode: 'guaranteed' | 'not_guaranteed' =
    shop.break_mode === 'guaranteed' && breakCount <= 2
      ? 'guaranteed'
      : 'not_guaranteed'

  // ── Reservation status, surfaced to the barber in real time ────
  //
  // Tres estados posibles durante el break:
  //   1. Reserva perdida (effectiveMode='not_guaranteed' AND alguien
  //      abajo ya completó un walk-in) — rojo, sin ambigüedad.
  //   2. Dentro de tiempo + no perdida — verde "Vuelve a #X"
  //      (con hint de advertencia para modo 'not_guaranteed' efectivo).
  //   3. Pasado grace OR sin posición retenida — silencioso.
  const withinTime =
    heldPosition !== undefined &&
    remaining > -shop.break_position_grace_minutes * 60

  const forfeited =
    effectiveBreakMode === 'not_guaranteed' && barber.break_invalidated === true

  return (
    <p className="text-nxtup-break text-sm font-medium tabular-nums">
      Break · {formatted}
      {forfeited ? (
        // Pasado, en rojo. "Ya lo perdiste" — sin ambigüedad.
        <span className="text-nxtup-busy ml-2 font-bold">Perdiste el turno</span>
      ) : withinTime ? (
        <span className="text-nxtup-active ml-2">
          Vuelve a #{heldPosition}
          {effectiveBreakMode === 'not_guaranteed' && (
            // Hint salient cuando NO está protegido — incluye el caso
            // de break #3+ aunque el shop sea 'guaranteed'.
            <span className="text-nxtup-muted text-xs ml-1 font-normal">
              (si nadie te brinca)
            </span>
          )}
        </span>
      ) : null}
    </p>
  )
}

function ActionButton({
  label,
  tone,
  current,
  loading,
  disabled,
  onClick,
}: {
  label: string
  tone: ActionTone
  current: boolean
  loading: boolean
  disabled: boolean
  onClick: () => void
}) {
  const palette: Record<
    ActionTone,
    { bg: string; border: string; text: string }
  > = {
    active: {
      bg: 'bg-emerald-500',
      border: 'border-emerald-400',
      text: 'text-emerald-300',
    },
    busy: {
      bg: 'bg-rose-500',
      border: 'border-rose-400',
      text: 'text-rose-300',
    },
    break: {
      bg: 'bg-amber-500',
      border: 'border-amber-400',
      text: 'text-amber-300',
    },
    offline: {
      bg: 'bg-zinc-500',
      border: 'border-zinc-600',
      text: 'text-zinc-400',
    },
  }
  const p = palette[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center justify-center
        rounded-lg py-5 text-base font-black tracking-widest
        transition-all active:scale-[0.97]
        ${
          current
            ? `${p.bg} text-black border-2 ${p.border}`
            : `bg-transparent border-2 ${p.border} ${p.text} hover:bg-nxtup-line`
        }
        ${loading ? 'opacity-60' : ''}
        disabled:opacity-40 disabled:cursor-not-allowed
      `}
    >
      {loading ? '...' : label}
    </button>
  )
}

function AvatarPickerModal({
  value,
  onChange,
  onClose,
  saving,
  shopAvatars,
}: {
  value: string | null
  onChange: (next: string | null) => void
  onClose: () => void
  saving: boolean
  shopAvatars: ShopAvatar[]
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Elegir icono"
      className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-nxtup-bg border border-nxtup-line rounded-t-2xl sm:rounded-2xl p-5 w-full max-w-md max-h-[80vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold">
            Elige tu ícono
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-nxtup-muted hover:text-white text-sm"
          >
            Cerrar
          </button>
        </div>
        <AvatarPicker
          value={value}
          onChange={onChange}
          size={48}
          shopAvatars={shopAvatars}
        />
        {saving && (
          <p className="text-nxtup-muted text-xs mt-4 text-center">
            Guardando...
          </p>
        )}
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// CalledCountdown — timer de 2 min entre que se le llama al cliente
// y el cron de no-show. Da feedback claro al barbero de cuánto le
// queda para tocar BUSY antes de que el cliente se cascadee y él
// pase a un break de 15 min (migración 041).
//
// Refresca cada 1s con su propio interval — no usamos el nowTick
// global de 3s porque para un timer mm:ss un step de 3s se ve
// raro (saltos de segundos).
// ──────────────────────────────────────────────────────────────

function CalledCountdown({ calledAt }: { calledAt: string }) {
  const TOTAL_MS = 120_000 // 2 min
  const calledAtMs = new Date(calledAt).getTime()
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const elapsed = now - calledAtMs
  const remaining = TOTAL_MS - elapsed

  if (remaining <= 0) {
    return (
      <p className="text-nxtup-busy text-xs font-bold uppercase tracking-widest">
        ⚠ vencido
      </p>
    )
  }

  const totalSec = Math.ceil(remaining / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const isUrgent = remaining <= 30_000 // últimos 30s

  return (
    <p
      className={`
        text-xs font-bold tabular-nums uppercase tracking-widest
        inline-flex items-center gap-1.5
        ${isUrgent ? 'text-nxtup-busy animate-pulse' : 'text-orange-400'}
      `}
    >
      <span aria-hidden>⏱</span>
      {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
      <span className="text-nxtup-muted font-medium">
        para tocar BUSY
      </span>
    </p>
  )
}

// ──────────────────────────────────────────────────────────────
// PeerRoster — lista de todos los barberos del shop con su estado.
//
// El barbero que está fuera del shop (típico en break) quiere ver
// cómo se mueven los turnos sin tener que volver al TV físico:
//   * Quién está disponible y en qué posición FIFO está
//   * Quién está atendiendo
//   * Quién está en break y cuánto tiempo le queda + si mantiene
//     su posición o no
//   * Quién está offline (al final)
//
// Realtime — el subscriber al canal de barbers (en el useEffect
// principal del componente) ya refresca el array `peers`. Este
// componente solo lo renderiza.
// ──────────────────────────────────────────────────────────────

function PeerRoster({
  currentBarberId,
  peers,
  shop,
  nowTick,
}: {
  currentBarberId: string
  peers: Peer[]
  shop: Shop
  nowTick: number
}) {
  // `peers` ya incluye al barbero actual (el initial fetch trae
  // todos los del shop). Si por alguna razón no estuviera, lo
  // saltamos — el componente principal renderea su propio status
  // arriba de los botones.
  const order = useMemo(() => buildBarberOrder(peers), [peers])
  const held = useMemo(() => buildHeldPositions(peers), [peers])
  const sorted = useMemo(
    () => sortByQueueOrder(peers, order),
    [peers, order],
  )

  const availableCount = peers.filter(p => p.status === 'available').length

  // Sin barberos = layout en setup. Skipeamos render.
  if (sorted.length === 0) return null

  return (
    <section className="mt-8 pt-6 border-t border-nxtup-line">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-nxtup-muted text-xs uppercase tracking-[0.25em] font-bold">
          Turnos de barberos
        </h2>
        <span className="text-nxtup-muted text-xs tabular-nums">
          {availableCount} {availableCount === 1 ? 'disponible' : 'disponibles'}
        </span>
      </header>

      <ul className="flex flex-col gap-2">
        {sorted.map(peer => (
          <PeerRosterRow
            key={peer.id}
            peer={peer}
            isSelf={peer.id === currentBarberId}
            fifoPosition={order.get(peer.id)}
            heldPosition={held.get(peer.id)}
            shop={shop}
            nowTick={nowTick}
          />
        ))}
      </ul>
    </section>
  )
}

function PeerRosterRow({
  peer,
  isSelf,
  fifoPosition,
  heldPosition,
  shop,
  nowTick,
}: {
  peer: Peer
  isSelf: boolean
  fifoPosition: number | undefined
  heldPosition: number | undefined
  shop: Shop
  nowTick: number
}) {
  // Color del dot en función del status real.
  const dotColor: Record<Status, string> = {
    available: 'bg-nxtup-active',
    busy: 'bg-nxtup-busy',
    break: 'bg-nxtup-break',
    offline: 'bg-nxtup-dim',
  }

  // Right-side context: depende del status.
  let detail: React.ReactNode = null
  if (peer.status === 'available') {
    if (fifoPosition !== undefined) {
      detail = (
        <span className="text-nxtup-active font-bold tabular-nums">
          #{fifoPosition}
        </span>
      )
    } else {
      // available sin available_since = le acaban de asignar cliente
      // (status='called' implícito). Se considera "atendiendo".
      detail = (
        <span className="text-nxtup-muted text-xs uppercase tracking-wider">
          Llamando
        </span>
      )
    }
  } else if (peer.status === 'busy') {
    detail = (
      <span className="text-nxtup-busy text-xs uppercase tracking-wider">
        Atendiendo
      </span>
    )
  } else if (peer.status === 'break') {
    detail = (
      <BreakRemainingLine
        peer={peer}
        shop={shop}
        heldPosition={heldPosition}
        nowTick={nowTick}
      />
    )
  } else {
    detail = (
      <span className="text-nxtup-dim text-xs uppercase tracking-wider">
        Fuera
      </span>
    )
  }

  return (
    <li
      className={`
        flex items-center gap-3 rounded-lg px-3 py-2
        ${
          isSelf
            ? 'bg-nxtup-line border border-nxtup-muted/40'
            : 'border border-transparent'
        }
      `}
    >
      <span
        className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor[peer.status]}`}
        aria-hidden
      />
      <Avatar avatar={peer.avatar} name={peer.name} size={28} />
      <p
        className={`
          flex-1 min-w-0 truncate text-sm font-bold tracking-tight
          ${peer.status === 'offline' ? 'text-nxtup-muted' : 'text-white'}
        `}
      >
        {peer.name}
        {isSelf && (
          <span className="ml-2 text-[10px] uppercase tracking-widest text-nxtup-muted">
            tú
          </span>
        )}
      </p>
      <div className="flex-shrink-0 text-right">{detail}</div>
    </li>
  )
}

// Sub-componente para el detalle de barberos en break — calcula
// minutos restantes basado en nowTick (1 vez por segundo via el
// reactive clock que ya existe). Si la cola es 'guaranteed' y
// no está invalidated, también muestra la posición que mantendrá.
function BreakRemainingLine({
  peer,
  shop,
  heldPosition,
  nowTick,
}: {
  peer: Peer
  shop: Shop
  heldPosition: number | undefined
  nowTick: number
}) {
  if (!peer.break_started_at) {
    return (
      <span className="text-nxtup-break text-xs uppercase tracking-wider">
        Break
      </span>
    )
  }

  const breakMinutes =
    peer.break_minutes_at_start ??
    ((peer.breaks_taken_today ?? 1) <= 1
      ? shop.first_break_minutes
      : shop.next_break_minutes)

  const startedAt = new Date(peer.break_started_at).getTime()
  const totalMs = breakMinutes * 60 * 1000
  const elapsedMs = nowTick - startedAt
  const remainingMs = totalMs - elapsedMs
  const remainingMin = Math.ceil(remainingMs / 60000)

  const isOverdue = remainingMin <= 0
  const positionLost = peer.break_invalidated === true

  return (
    <div className="flex flex-col items-end leading-tight">
      <span
        className={`text-xs font-bold tabular-nums ${
          isOverdue ? 'text-nxtup-busy' : 'text-nxtup-break'
        }`}
      >
        {isOverdue ? 'vencido' : `${remainingMin} min`}
      </span>
      {heldPosition !== undefined && !positionLost && (
        <span className="text-[10px] text-nxtup-muted uppercase tracking-wider">
          vuelve a #{heldPosition}
        </span>
      )}
      {positionLost && (
        <span className="text-[10px] text-nxtup-busy uppercase tracking-wider">
          perdió turno
        </span>
      )}
    </div>
  )
}
