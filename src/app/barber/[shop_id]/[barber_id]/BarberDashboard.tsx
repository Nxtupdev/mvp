'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ShopLogo from '@/components/ShopLogo'
import {
  Avatar,
  AvatarPicker,
  isAvatarId,
  type AvatarId,
} from '@/components/avatars'
import { InstallButton } from '@/components/InstallButton'
import { buildBarberOrder, buildHeldPositions } from '@/lib/queue-order'

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
  avatar: AvatarId | null
  available_since: string | null
  break_started_at: string | null
  break_held_since: string | null
  break_minutes_at_start: number | null
  breaks_taken_today: number | null
  // True once any barber below us (snapshot at break start) completed
  // a walk-in. Only set when shop.break_mode = 'not_guaranteed'.
  break_invalidated?: boolean | null
}

type Peer = Barber

type DeviceClient = {
  id: string
  client_name: string
  position: number
} | null

type ActionTone = 'active' | 'busy' | 'break'

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
}) {
  const [barber, setBarber] = useState<Barber>({
    ...initialBarber,
    avatar: isAvatarId(initialBarber.avatar) ? initialBarber.avatar : null,
  })
  const [peers, setPeers] = useState<Peer[]>(
    initialPeers.map(p => ({
      ...p,
      avatar: isAvatarId(p.avatar) ? p.avatar : null,
    })),
  )
  const [calledClient, setCalledClient] =
    useState<DeviceClient>(initialCalledClient)
  const [currentClient, setCurrentClient] =
    useState<DeviceClient>(initialCurrentClient)
  const [pending, setPending] = useState<ActionTone | null>(null)
  const [error, setError] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)

  // ── Live updates ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()

    const fetchBarber = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
        )
        .eq('id', barber.id)
        .single()
      if (data) {
        const row = data as { avatar?: unknown } & Omit<Barber, 'avatar'>
        setBarber({ ...row, avatar: isAvatarId(row.avatar) ? row.avatar : null })
      }
    }

    // We still fetch peers to compute FIFO position locally — we just don't
    // render the peer list anymore.
    const fetchPeers = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
        )
        .eq('shop_id', shopId)
        .neq('status', 'offline')
        .order('name')
      if (data) {
        setPeers(
          (data as unknown[]).map(r => {
            const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
            return { ...row, avatar: isAvatarId(row.avatar) ? row.avatar : null }
          }),
        )
      }
    }

    const fetchClients = async () => {
      const [{ data: called }, { data: current }] = await Promise.all([
        supabase
          .from('queue_entries')
          .select('id, client_name, position')
          .eq('barber_id', barber.id)
          .eq('status', 'called')
          .maybeSingle(),
        supabase
          .from('queue_entries')
          .select('id, client_name, position')
          .eq('barber_id', barber.id)
          .eq('status', 'in_progress')
          .maybeSingle(),
      ])
      setCalledClient(called)
      setCurrentClient(current)
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

  // ── Action handler ──────────────────────────────────────────────
  async function press(target: ActionTone) {
    if (pending) return
    const apiTarget =
      target === 'active' ? 'available' : target === 'busy' ? 'busy' : 'break'
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
  async function saveAvatar(next: AvatarId | null) {
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

      {/* Action buttons */}
      <section className="grid grid-cols-3 gap-2 mb-2">
        <ActionButton
          label="ACTIVE"
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
      <p className="text-nxtup-active text-sm font-medium">
        → Llamado: {calledClient.client_name}
      </p>
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
  return <p className="text-nxtup-muted text-sm">Active</p>
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
    return <p className="text-nxtup-break text-sm font-medium">Break</p>
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

  // ── Reservation status, surfaced to the barber in real time ────
  //
  // Three possible states while on break:
  //   1. Reservation forfeited (mode='not_guaranteed' AND someone
  //      below already completed a walk-in) — red, unambiguous.
  //   2. Within break+grace AND not forfeited — green "Vuelve a #X"
  //      (with an extra warning hint for 'not_guaranteed' mode so
  //      the barber knows it could still flip to forfeited).
  //   3. Past grace OR no held position — quiet, no return badge.
  const withinTime =
    heldPosition !== undefined &&
    remaining > -shop.break_position_grace_minutes * 60

  const forfeited =
    shop.break_mode === 'not_guaranteed' && barber.break_invalidated === true

  return (
    <p className="text-nxtup-break text-sm font-medium tabular-nums">
      Break · {formatted}
      {forfeited ? (
        // Past-tense, in red. "You already lost it" — no ambiguity.
        <span className="text-nxtup-busy ml-2 font-bold">Perdiste el turno</span>
      ) : withinTime ? (
        <span className="text-nxtup-active ml-2">
          Vuelve a #{heldPosition}
          {shop.break_mode === 'not_guaranteed' && (
            // Subtle reminder of the "use it or lose it" rule. Only
            // shown when the rule is active so guaranteed-mode shops
            // stay clean.
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
}: {
  value: AvatarId | null
  onChange: (next: AvatarId | null) => void
  onClose: () => void
  saving: boolean
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
            Elegí tu icono
          </p>
          <button
            type="button"
            onClick={onClose}
            className="text-nxtup-muted hover:text-white text-sm"
          >
            Cerrar
          </button>
        </div>
        <AvatarPicker value={value} onChange={onChange} size={48} />
        {saving && (
          <p className="text-nxtup-muted text-xs mt-4 text-center">
            Guardando...
          </p>
        )}
      </div>
    </div>
  )
}
