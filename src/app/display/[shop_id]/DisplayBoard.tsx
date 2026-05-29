'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/Logo'
import ShopLogo from '@/components/ShopLogo'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
import { buildHeldPositions } from '@/lib/queue-order'

type Entry = {
  id: string
  position: number
  client_name: string
  status: 'waiting' | 'called' | 'in_progress'
  barber_id: string | null
  created_at: string
}

type Barber = {
  id: string
  name: string
  status: 'available' | 'busy' | 'break' | 'offline'
  avatar: string | null
  available_since: string | null
  break_started_at: string | null
  break_held_since: string | null
  break_minutes_at_start: number | null
  breaks_taken_today: number | null
  // Migration 019 — >0 means "paying late-arrival toll". On the TV
  // these barbers still appear in the ACTIVE column with their FIFO
  // position, but with an orange tint + counter so everyone watching
  // sees they're waiting their turn before getting clients.
  late_toll_remaining?: number | null
}

type Shop = {
  id: string
  name: string
  is_open: boolean
  logo_url: string | null
  first_break_minutes: number
  next_break_minutes: number
  keep_position_on_break: boolean
  break_position_grace_minutes: number
}

// ── Density tiers ─────────────────────────────────────────────────
// The TV display has to scale: a barbershop with 2 barbers should look
// premium and spacious; one with 12 should still fit everyone without
// scrolling. We pick a tier based on the largest column count, then
// every card on the screen uses the same tier so the grid stays even.
type Density = 'lg' | 'md' | 'sm'

const SIZE: Record<
  Density,
  {
    avatar: number
    posText: string
    arrowText: string
    nameSingle: string
    nameDouble: string
    subtitle: string
    cardPad: string
    cardGap: string
    listGap: string
    colPad: string
    colHeaderPad: string
    breakTimer: string
    posWidth: string
  }
> = {
  lg: {
    avatar: 32,
    posText: 'text-4xl',
    arrowText: 'text-3xl',
    nameSingle: 'text-3xl',
    nameDouble: 'text-2xl',
    subtitle: 'text-sm',
    cardPad: 'px-3 py-3',
    cardGap: 'gap-2',
    listGap: 'gap-3',
    colPad: 'px-4 pb-8',
    colHeaderPad: 'pt-8 pb-4',
    breakTimer: 'text-3xl',
    posWidth: 'w-9',
  },
  md: {
    avatar: 36,
    posText: 'text-3xl',
    arrowText: 'text-2xl',
    nameSingle: 'text-2xl',
    nameDouble: 'text-xl',
    subtitle: 'text-xs',
    cardPad: 'px-3 py-2.5',
    cardGap: 'gap-2.5',
    listGap: 'gap-2',
    colPad: 'px-4 pb-6',
    colHeaderPad: 'pt-6 pb-3',
    breakTimer: 'text-2xl',
    posWidth: 'w-9',
  },
  sm: {
    avatar: 28,
    posText: 'text-2xl',
    arrowText: 'text-xl',
    nameSingle: 'text-lg',
    nameDouble: 'text-base',
    subtitle: 'text-[10px]',
    cardPad: 'px-2.5 py-2',
    cardGap: 'gap-2',
    listGap: 'gap-1.5',
    colPad: 'px-3 pb-5',
    colHeaderPad: 'pt-5 pb-2',
    breakTimer: 'text-xl',
    posWidth: 'w-8',
  },
}

function useClock() {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    setNow(new Date())
    const id = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useTickingNow() {
  // For the BREAK countdown — re-render every second so the timer ticks.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

/**
 * Screen Wake Lock — asks the browser to keep the display awake while
 * this page is loaded. Vital for the TV: barbershops mount the
 * /display page on a Fire TV / Smart TV and the device's built-in
 * screensaver kicks in after 15-20 min of "no input", blacking out
 * the queue. Wake Lock bypasses that.
 *
 * Behavior:
 *   - Requests the lock on mount.
 *   - If the system releases it (e.g., the tab gets backgrounded
 *     because the TV switched inputs), we re-request when the page
 *     becomes visible again.
 *   - Releases on unmount.
 *
 * Support: Chromium-based browsers (Chrome Android/Desktop, Edge,
 * Silk Browser on newer Fire TV, WebView). NOT supported on iOS
 * Safari or very old browsers — we silently no-op there. The Fire
 * TV's built-in "Screen Saver → Start Time → Never" setting is the
 * belt; this is the suspenders.
 */
function useWakeLock() {
  useEffect(() => {
    // The DOM lib doesn't ship full WakeLockSentinel types in every
    // TS version we target, so we keep the cast narrow and local.
    type WakeLockLike = {
      release: () => Promise<void>
      addEventListener: (type: 'release', cb: () => void) => void
    }
    type NavigatorWithLock = Navigator & {
      wakeLock?: { request: (kind: 'screen') => Promise<WakeLockLike> }
    }

    let sentinel: WakeLockLike | null = null
    let cancelled = false

    const requestLock = async () => {
      if (cancelled) return
      const nav = navigator as NavigatorWithLock
      if (!nav.wakeLock) return // Safari iOS, ancient Fire TV, etc.
      try {
        sentinel = await nav.wakeLock.request('screen')
        sentinel.addEventListener('release', () => {
          // System dropped the lock (page hidden, low power, etc.).
          // We'll re-request on the next visibilitychange.
          sentinel = null
        })
      } catch {
        // NotAllowedError when page isn't visible, etc. Swallow —
        // we'll retry on visibility change.
      }
    }

    requestLock()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && !sentinel) {
        requestLock()
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisibility)
      if (sentinel) {
        sentinel.release().catch(() => {})
        sentinel = null
      }
    }
  }, [])
}

function formatClock(d: Date) {
  return d
    .toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    .toLowerCase()
}

export default function DisplayBoard({
  shop,
  initialEntries,
  initialBarbers,
}: {
  shop: Shop
  initialEntries: Entry[]
  initialBarbers: Barber[]
}) {
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [barbers, setBarbers] = useState<Barber[]>(initialBarbers)
  const [connected, setConnected] = useState(true)
  const now = useClock()

  // Prevent the TV / monitor running this page from sleeping. Backstop
  // for shops where the Fire TV screensaver setting can't be set to
  // Never (older sticks max out at 20 min).
  useWakeLock()

  // Kiosk auto-refresh: blow the page away every 6h. Some smart-TV browsers
  // accumulate memory / lose realtime quietly after long sessions; a clean
  // reload during slow hours guarantees the day starts fresh.
  useEffect(() => {
    const id = window.setTimeout(
      () => window.location.reload(),
      6 * 60 * 60 * 1000,
    )
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const fetchEntries = async () => {
      const { data } = await supabase
        .from('queue_entries')
        .select('id, position, client_name, status, barber_id, created_at')
        .eq('shop_id', shop.id)
        .in('status', ['waiting', 'called', 'in_progress'])
        .order('position', { ascending: true })
      if (data) setEntries(data)
    }

    const fetchBarbers = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated, late_toll_remaining',
        )
        .eq('shop_id', shop.id)
        .neq('status', 'offline')
        .order('name')
      if (data) {
        setBarbers(
          (data as unknown[]).map(r => {
            const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
            return { ...row, avatar: isRenderableAvatar(row.avatar) ? row.avatar : null }
          }),
        )
      }
    }

    const channel = supabase
      .channel(`display-${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries', filter: `shop_id=eq.${shop.id}` },
        fetchEntries,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barbers', filter: `shop_id=eq.${shop.id}` },
        fetchBarbers,
      )
      .subscribe(status => {
        // 'SUBSCRIBED' is the healthy state. Anything else means we lost
        // the connection (network blip, server restart) and the data on
        // screen may be stale until reconnect.
        setConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [shop.id])

  const heldPositions = useMemo(() => buildHeldPositions(barbers), [barbers])

  if (!shop.is_open) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-12 cursor-none select-none">
        {shop.logo_url ? (
          <ShopLogo
            url={shop.logo_url}
            name={shop.name}
            size={160}
            className="mb-12 opacity-90"
          />
        ) : (
          <Logo className="h-16 w-auto mb-12 opacity-60" tone="dark" />
        )}
        <p className="text-nxtup-muted text-3xl uppercase tracking-[0.4em] mb-6">
          Closed
        </p>
        <h1 className="text-7xl font-black tracking-tight">{shop.name}</h1>
      </main>
    )
  }

  // ── Bucketing ─────────────────────────────────────────────────
  const calledEntries = entries.filter(e => e.status === 'called')
  const inProgressEntries = entries.filter(e => e.status === 'in_progress')
  const waitingEntries = entries.filter(e => e.status === 'waiting')

  // ACTIVE = available barbers in FIFO + available barbers about to receive
  // a called client (transition state). FIFO members come first, sorted
  // by available_since.
  const activeFifo = barbers
    .filter(b => b.status === 'available' && b.available_since !== null)
    .sort(
      (a, b) =>
        new Date(a.available_since!).getTime() -
        new Date(b.available_since!).getTime(),
    )
  const activeCalledBarbers = barbers.filter(
    b =>
      b.status === 'available' &&
      b.available_since === null &&
      calledEntries.some(e => e.barber_id === b.id),
  )

  // BUSY = currently cutting (status='busy')
  const busyBarbers = barbers
    .filter(b => b.status === 'busy')
    .sort((a, b) => a.name.localeCompare(b.name))

  // BREAK = on break (status='break'), oldest first
  const breakBarbers = barbers
    .filter(b => b.status === 'break')
    .sort((a, b) => {
      const ta = a.break_started_at ? new Date(a.break_started_at).getTime() : 0
      const tb = b.break_started_at ? new Date(b.break_started_at).getTime() : 0
      return ta - tb
    })

  // ── Density tier ──────────────────────────────────────────────
  // The TV is shown across a barbershop floor — text must stay readable
  // from across the room. With few barbers we render big premium cards;
  // when a column starts filling up, we drop to denser layouts so 10-12
  // barbers still fit without scroll.
  const maxColumnCount = Math.max(
    activeFifo.length + activeCalledBarbers.length,
    busyBarbers.length,
    breakBarbers.length,
  )
  const density: Density =
    maxColumnCount <= 4 ? 'lg' : maxColumnCount <= 8 ? 'md' : 'sm'

  return (
    <main className="min-h-screen flex flex-col cursor-none select-none">
      {/* Header */}
      <header className="flex items-center justify-between px-12 py-5 border-b border-nxtup-line gap-8">
        <div className="flex items-center gap-5 min-w-0">
          {shop.logo_url ? (
            <ShopLogo url={shop.logo_url} name={shop.name} size={48} />
          ) : (
            <Logo className="h-9 w-auto" tone="dark" />
          )}
          <span className="text-white text-2xl font-bold truncate">{shop.name}</span>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          {/* Connection status — subtle. Green when realtime is healthy,
              amber pulse when we lost the channel and are reconnecting. */}
          <span
            className={`w-2 h-2 rounded-full transition-colors ${
              connected ? 'bg-nxtup-active' : 'bg-nxtup-break animate-pulse'
            }`}
            aria-label={connected ? 'En línea' : 'Reconectando'}
            title={connected ? 'En línea' : 'Reconectando…'}
          />
          <span className="text-nxtup-muted text-xl font-medium tabular-nums">
            {now ? formatClock(now) : ''}
          </span>
        </div>
      </header>

      {/* 3 columns */}
      <section className="flex-1 grid grid-cols-3 gap-px bg-nxtup-line">
        <Column
          title="Available"
          tone="active"
          count={activeFifo.length + activeCalledBarbers.length}
          density={density}
        >
          {activeFifo.length === 0 && activeCalledBarbers.length === 0 && (
            <Empty />
          )}
          {activeFifo.map((b, idx) => (
            <ActiveCard
              key={b.id}
              barber={b}
              position={idx + 1}
              density={density}
            />
          ))}
          {activeCalledBarbers.map(b => {
            const call = calledEntries.find(e => e.barber_id === b.id)
            return (
              <ActiveCalledCard
                key={b.id}
                barber={b}
                clientName={call?.client_name ?? '—'}
                density={density}
              />
            )
          })}
        </Column>

        <Column
          title="Busy"
          tone="busy"
          count={busyBarbers.length}
          density={density}
        >
          {busyBarbers.length === 0 ? (
            <Empty />
          ) : (
            busyBarbers.map(b => {
              const c = inProgressEntries.find(e => e.barber_id === b.id)
              return (
                <BusyCard
                  key={b.id}
                  barber={b}
                  clientName={c?.client_name ?? null}
                  density={density}
                />
              )
            })
          )}
        </Column>

        <Column
          title="Break"
          tone="break"
          count={breakBarbers.length}
          density={density}
        >
          {breakBarbers.length === 0 ? (
            <Empty />
          ) : (
            breakBarbers.map(b => (
              <BreakCard
                key={b.id}
                barber={b}
                shop={shop}
                heldPosition={heldPositions.get(b.id)}
                density={density}
              />
            ))
          )}
        </Column>
      </section>

      {/* Bottom strip — ticker rotando todos los clientes en cola.
          Reemplaza al viejo NextStrip que solo mostraba el próximo
          cliente. El cintillo se queda fijo aunque la pantalla scrolee
          con muchos barberos. */}
      <QueueTicker
        calledFirst={calledEntries[0] ?? null}
        waitingEntries={waitingEntries}
      />
    </main>
  )
}

// ──────────────────────────────────────────────────────────────
// Column wrapper
// ──────────────────────────────────────────────────────────────

function Column({
  title,
  tone,
  count,
  density,
  children,
}: {
  title: string
  tone: 'active' | 'busy' | 'break'
  count: number
  density: Density
  children: React.ReactNode
}) {
  const dot: Record<typeof tone, string> = {
    active: 'bg-nxtup-active',
    busy: 'bg-nxtup-busy',
    break: 'bg-nxtup-break',
  }
  const text: Record<typeof tone, string> = {
    active: 'text-nxtup-active',
    busy: 'text-nxtup-busy',
    break: 'text-nxtup-break',
  }
  const s = SIZE[density]
  return (
    <div className="bg-nxtup-bg flex flex-col">
      <div className={`flex items-center justify-between px-8 ${s.colHeaderPad}`}>
        <div className="flex items-center gap-3">
          <span
            className={`w-3 h-3 rounded-full ${dot[tone]}`}
            aria-hidden
          />
          <h2
            className={`uppercase tracking-[0.3em] text-xl font-black ${text[tone]}`}
          >
            {title}
          </h2>
        </div>
        <span className="text-nxtup-muted text-2xl font-black tabular-nums">
          {count}
        </span>
      </div>
      <ul className={`flex flex-col flex-1 ${s.listGap} ${s.colPad}`}>
        {children}
      </ul>
    </div>
  )
}

function Empty() {
  return (
    <li className="flex items-center justify-center px-4 py-8 rounded-2xl border border-dashed border-nxtup-line">
      <p className="text-nxtup-dim text-xl">—</p>
    </li>
  )
}

// ──────────────────────────────────────────────────────────────
// Cards — one per state
// ──────────────────────────────────────────────────────────────

function ActiveCard({
  barber,
  position,
  density,
}: {
  barber: Barber
  position: number
  density: Density
}) {
  const s = SIZE[density]
  // Late-arrival toll (migration 019): paint the card in warm orange
  // so everyone watching the TV knows this barber is waiting their
  // turn before getting auto-assigned clients. Still listed at their
  // FIFO position, just visually distinct.
  const lateToll = barber.late_toll_remaining ?? 0
  const isLate = lateToll > 0
  return (
    <li
      className={`flex items-center bg-nxtup-line rounded-2xl ${s.cardPad} ${s.cardGap} ${
        isLate ? 'ring-2 ring-orange-500/60' : ''
      }`}
    >
      <span
        className={`font-black tabular-nums text-center ${s.posText} ${s.posWidth} ${
          isLate ? 'text-orange-400' : 'text-nxtup-active'
        }`}
        aria-label={`Posición ${position}`}
      >
        #{position}
      </span>
      <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
      <div className="flex-1 min-w-0">
        <span
          className={`text-white font-bold block truncate ${s.nameSingle}`}
        >
          {barber.name}
        </span>
        {isLate && (
          <span className={`block text-orange-400 font-semibold ${s.subtitle}`}>
            Esperando turno · {lateToll} por pasar
          </span>
        )}
      </div>
    </li>
  )
}

function ActiveCalledCard({
  barber,
  clientName,
  density,
}: {
  barber: Barber
  clientName: string
  density: Density
}) {
  const s = SIZE[density]
  return (
    <li
      className={`flex items-center bg-nxtup-line rounded-2xl ring-2 ring-nxtup-active/40 ${s.cardPad} ${s.cardGap}`}
    >
      <span
        className={`text-nxtup-active font-black text-center ${s.arrowText} ${s.posWidth}`}
        aria-hidden
      >
        →
      </span>
      <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
      <div className="flex-1 min-w-0">
        <p className={`text-white font-bold truncate ${s.nameDouble}`}>
          {barber.name}
        </p>
        <p
          className={`text-nxtup-active uppercase tracking-widest font-bold truncate ${s.subtitle}`}
        >
          → {clientName}
        </p>
      </div>
    </li>
  )
}

function BusyCard({
  barber,
  clientName,
  density,
}: {
  barber: Barber
  clientName: string | null
  density: Density
}) {
  const s = SIZE[density]
  return (
    <li
      className={`flex items-center bg-nxtup-line rounded-2xl ${s.cardPad} ${s.cardGap}`}
    >
      <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
      <div className="flex-1 min-w-0">
        <p
          className={`text-white font-bold truncate ${clientName ? s.nameDouble : s.nameSingle}`}
        >
          {barber.name}
        </p>
        {clientName && (
          <p className={`text-nxtup-muted truncate ${s.subtitle}`}>
            con {clientName}
          </p>
        )}
      </div>
    </li>
  )
}

function BreakCard({
  barber,
  shop,
  heldPosition,
  density,
}: {
  barber: Barber
  shop: Shop
  heldPosition: number | undefined
  density: Density
}) {
  const s = SIZE[density]
  const now = useTickingNow()

  const startedMs = barber.break_started_at
    ? new Date(barber.break_started_at).getTime()
    : null
  const elapsedSec = startedMs ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0

  const breakMin =
    barber.break_minutes_at_start ??
    ((barber.breaks_taken_today ?? 1) <= 1
      ? shop.first_break_minutes
      : shop.next_break_minutes)
  const totalSec = breakMin * 60
  const remainingSec = totalSec - elapsedSec
  const allowedSec = totalSec + (shop.break_position_grace_minutes ?? 5) * 60
  const overGrace = elapsedSec > allowedSec

  const mm = Math.floor(Math.abs(remainingSec) / 60)
  const ss = Math.abs(remainingSec) % 60
  const formatted = `${remainingSec < 0 ? '+' : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  const timerColor =
    remainingSec < 0
      ? overGrace
        ? 'text-nxtup-busy'
        : 'text-nxtup-break'
      : 'text-white'

  const showHeld =
    shop.keep_position_on_break && heldPosition !== undefined && !overGrace

  return (
    <li
      className={`flex items-center bg-nxtup-line rounded-2xl ${s.cardPad} ${s.cardGap}`}
    >
      <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
      <div className="flex-1 min-w-0">
        <p className={`text-white font-bold truncate ${s.nameDouble}`}>
          {barber.name}
        </p>
        {showHeld ? (
          <p
            className={`text-nxtup-active uppercase tracking-widest font-bold ${s.subtitle}`}
          >
            Vuelve a #{heldPosition}
          </p>
        ) : overGrace && shop.keep_position_on_break ? (
          <p
            className={`text-nxtup-busy uppercase tracking-widest font-bold ${s.subtitle}`}
          >
            Posición perdida
          </p>
        ) : null}
      </div>
      <span
        className={`font-black tabular-nums ${s.breakTimer} ${timerColor}`}
        aria-label={`Tiempo restante de break: ${formatted}`}
      >
        {formatted}
      </span>
    </li>
  )
}

// ──────────────────────────────────────────────────────────────
// Bottom strip
// ──────────────────────────────────────────────────────────────

/**
 * QueueTicker — bottom strip que rota TODOS los clientes en cola.
 *
 * Por qué reemplaza al viejo NextStrip: la TV puede tener muchos
 * barberos y eso obliga a scroll vertical. El NextStrip (footer normal
 * en el DOM flow) terminaba debajo del scroll y los clientes no se
 * veían. Este componente queda fijo en el bottom (es el último child
 * del main flex-col, así que respeta el viewport) y muestra todos los
 * nombres pasando en horizontal para que se lean sin scrollear.
 *
 * Loop seamless: el contenido se renderiza dos veces lado a lado y la
 * animación CSS traslada de translateX(0) a translateX(-50%). Cuando
 * la animación se reinicia, la posición 0 muestra otra vez la primera
 * copia — sin salto visible.
 *
 * Velocidad proporcional al número de items para mantener cómoda la
 * lectura: ~5s por cliente, mínimo 20s. Con 4 clientes = 20s; con 12
 * clientes = 60s. Cada cliente ocupa ~igual tiempo en pantalla
 * independientemente del tamaño de la cola.
 *
 * El primer entry recibe tratamiento visual destacado si está
 * actualmente en `called` (el barbero ya lo llamó) — emerald + label
 * "Llamando" en vez del número de posición.
 *
 * Respeta `prefers-reduced-motion` vía la regla en globals.css —
 * animación off y la segunda copia oculta para no duplicar visualmente.
 */
function QueueTicker({
  calledFirst,
  waitingEntries,
}: {
  calledFirst: Entry | null
  waitingEntries: Entry[]
}) {
  const items: Array<{ entry: Entry; isCalled: boolean }> = []
  if (calledFirst) items.push({ entry: calledFirst, isCalled: true })
  for (const e of waitingEntries) items.push({ entry: e, isCalled: false })

  if (items.length === 0) {
    return (
      <footer className="border-t border-nxtup-line px-12 py-5 flex items-center justify-center">
        <p className="text-nxtup-dim text-xl uppercase tracking-[0.3em]">
          Sin clientes en cola
        </p>
      </footer>
    )
  }

  // 5s por entry, mínimo 20s. Si hay 1 solo cliente la animación
  // sigue corriendo pero a velocidad cómoda — el loop seamless evita
  // sensación de "robotic".
  const durationSec = Math.max(20, items.length * 5)

  // Position en la cola actual (no el `entry.position` del DB, que es
  // un counter histórico que nunca decrementa). El primer cliente
  // esperando es #1 sin importar cuántos hayan pasado por la cola
  // antes en el día.
  const itemsWithQueuePosition = items.map((item, idx) => ({
    ...item,
    queuePosition: idx + 1,
  }))

  // Render twice for seamless infinite loop (see comment in globals.css).
  const tickerCells = [...itemsWithQueuePosition, ...itemsWithQueuePosition]

  return (
    <footer className="border-t border-nxtup-line bg-nxtup-bg overflow-hidden">
      <div
        className="queue-ticker-track flex whitespace-nowrap py-5"
        style={{
          animation: `queue-ticker ${durationSec}s linear infinite`,
        }}
      >
        {tickerCells.map(({ entry, isCalled, queuePosition }, idx) => (
          <span
            key={`${entry.id}-${idx}`}
            className="inline-flex items-center gap-4 px-10"
          >
            {isCalled ? (
              <span className="text-xs uppercase tracking-[0.4em] font-black text-nxtup-active">
                Llamando
              </span>
            ) : (
              <span className="text-nxtup-active text-3xl font-black tabular-nums">
                #{queuePosition}
              </span>
            )}
            <span
              className={`text-3xl font-black tracking-tight ${
                isCalled ? 'text-nxtup-active' : 'text-white'
              }`}
            >
              {entry.client_name}
            </span>
            {/* Bullet separator después de CADA item, incluido el
                último de cada copia. Eso mantiene el espaciado
                uniforme entre el final de un loop y el inicio del
                siguiente — sin gap visible al reiniciar la
                animación. El último separator del DOM queda
                offscreen detrás del overflow-hidden. */}
            <span className="text-nxtup-dim text-3xl pl-10" aria-hidden>
              ·
            </span>
          </span>
        ))}
      </div>
    </footer>
  )
}
