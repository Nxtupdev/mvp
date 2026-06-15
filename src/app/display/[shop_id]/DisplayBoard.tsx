'use client'

import { useEffect, useMemo, useState } from 'react'
import { Phone } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import Logo from '@/components/Logo'
import ShopLogo from '@/components/ShopLogo'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
import { buildHeldPositions } from '@/lib/queue-order'
import { MESSAGES } from '@/lib/i18n-messages'

type Entry = {
  id: string
  position: number
  client_name: string
  status: 'waiting' | 'called' | 'in_progress'
  barber_id: string | null
  created_at: string
  // Tiempo en que se llamó al cliente. Null para 'waiting'. Usado
  // por ActiveCalledCard para mostrar el timer de 2 min hacia abajo
  // (cascada del 018/035/041).
  called_at: string | null
  // Mamacita (agente de voz): si mamacita_entry_id != null el cliente
  // reservó por teléfono. Si además arrived_at == null, todavía no hace
  // check-in físico → viene en camino (badge "En camino" en la cola).
  mamacita_entry_id: string | null
  arrived_at: string | null
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
  // Migración 019 (legacy) — counter del sistema viejo de peaje. La
  // migración 047 lo deja en 0 — no leerlo más.
  late_toll_remaining?: number | null
  // Migración 047 — timestamp de fin de sanción por llegada tarde. Si
  // está en el futuro, el card del barbero se pinta naranja en la TV
  // para que todos vean que está sancionado.
  sanctioned_until?: string | null
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
  // Migración 051 — mensaje del cintillo de abajo del TV. NULL/'' =
  // sin cintillo (las columnas usan todo el alto).
  display_message: string | null
  // Migración 052 — idioma del TV elegido por el dueño. El TV es
  // público (nadie toca un toggle), así que NO depende de la cookie.
  display_language: 'es' | 'en'
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
  shop: initialShop,
  initialEntries,
  initialBarbers,
}: {
  shop: Shop
  initialEntries: Entry[]
  initialBarbers: Barber[]
}) {
  // shop es estado (no prop directo) para que el cintillo del mensaje
  // (display_message), el idioma (display_language), is_open y el logo
  // se actualicen en vivo en la TV cuando el dueño los cambia desde
  // Configuración (rediseño 051/052).
  const [shop, setShop] = useState<Shop>(initialShop)
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [barbers, setBarbers] = useState<Barber[]>(initialBarbers)
  const [connected, setConnected] = useState(true)
  const now = useClock()

  // Migración 052 — el TV traduce con el idioma del shop, NO con la
  // cookie del dispositivo (useLocale). El TV es público; el dueño
  // elige el idioma desde Configuración. tt() resuelve los títulos de
  // columna con ese locale. Cambia en vivo (shop es estado + realtime).
  const tvLocale: 'es' | 'en' = shop.display_language === 'en' ? 'en' : 'es'
  const tt = (key: string) => MESSAGES[tvLocale][key] ?? key

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
        .select(
          'id, position, client_name, status, barber_id, created_at, called_at, mamacita_entry_id, arrived_at',
        )
        .eq('shop_id', shop.id)
        .in('status', ['waiting', 'called', 'in_progress'])
        .order('position', { ascending: true })
      if (data) setEntries(data)
    }

    const fetchBarbers = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated, late_toll_remaining, sanctioned_until',
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

    // Rediseño 051: refetch del shop cuando cambia (mensaje del cintillo,
    // is_open, logo, nombre). Mantiene la TV sincronizada sin recargar.
    const fetchShop = async () => {
      const { data } = await supabase
        .from('shops')
        .select(
          'id, name, is_open, logo_url, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, display_message, display_language',
        )
        .eq('id', shop.id)
        .single()
      if (data) setShop(data as Shop)
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
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${shop.id}` },
        fetchShop,
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
          {tt('display.shopClosed')}
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
  // Rediseño (051): 3 columnas = Disponibles | Ocupados (busy+break) |
  // En cola (clientes esperando). La densidad se calcula sobre la
  // columna más larga de las tres.
  const occupiedCount = busyBarbers.length + breakBarbers.length
  const maxColumnCount = Math.max(
    activeFifo.length + activeCalledBarbers.length,
    occupiedCount,
    waitingEntries.length,
  )
  const density: Density =
    maxColumnCount <= 4 ? 'lg' : maxColumnCount <= 8 ? 'md' : 'sm'

  return (
    <main className="h-screen flex flex-col cursor-none select-none overflow-hidden">
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

      {/* 3 columnas (rediseño 051): Disponibles | Ocupados | En cola.
          `min-h-0` es crítico: por default los items de flex/grid tienen
          min-height auto, lo que les permite crecer más allá del
          contenedor. Con min-h-0 podemos encogerlas y dejar que la
          columna individual scrollee. */}
      <section className="flex-1 grid grid-cols-3 gap-px bg-nxtup-line min-h-0">
        {/* ── Columna 1: Disponibles ── (sin cambios) */}
        <Column
          title={tt('display.col.available')}
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
                calledAt={call?.called_at ?? null}
                density={density}
              />
            )
          })}
        </Column>

        {/* ── Columna 2: Ocupados (busy + break mergeados) ──
            Cada barbero conserva su color individual: BusyCard rojo
            "con cliente", BreakCard ámbar con countdown. El header de
            la columna es rojo (busy domina) y comunica "no disponible
            ahora" — la dualidad Disponibles/Ocupados que el cliente
            entiende de un vistazo. */}
        <Column
          title={tt('display.col.occupied')}
          tone="busy"
          count={occupiedCount}
          density={density}
        >
          {occupiedCount === 0 ? (
            <Empty />
          ) : (
            <>
              {busyBarbers.map(b => {
                const c = inProgressEntries.find(e => e.barber_id === b.id)
                return (
                  <BusyCard
                    key={b.id}
                    barber={b}
                    clientName={c?.client_name ?? null}
                    density={density}
                  />
                )
              })}
              {breakBarbers.map(b => (
                <BreakCard
                  key={b.id}
                  barber={b}
                  shop={shop}
                  heldPosition={heldPositions.get(b.id)}
                  density={density}
                />
              ))}
            </>
          )}
        </Column>

        {/* ── Columna 3: En cola (clientes esperando) ──
            Los clientes que antes rotaban en el cintillo de abajo ahora
            viven aquí en una columna fija y legible: #posición + nombre,
            en orden FIFO. */}
        <Column
          title={tt('display.col.queue')}
          tone="queue"
          count={waitingEntries.length}
          density={density}
        >
          {waitingEntries.length === 0 ? (
            <Empty />
          ) : (
            waitingEntries
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((e, idx) => (
                <QueueClientCard
                  key={e.id}
                  position={idx + 1}
                  clientName={e.client_name}
                  enCamino={e.mamacita_entry_id !== null && e.arrived_at === null}
                  density={density}
                />
              ))
          )}
        </Column>
      </section>

      {/* Cintillo de abajo (rediseño 051) — ahora rota el mensaje que
          el dueño escribe desde Configuración (promos/avisos) en vez de
          los clientes. Si no hay mensaje, no se renderiza y las columnas
          usan todo el alto del TV. */}
      <DisplayMessageTicker message={shop.display_message} />
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
  // 'queue' (rediseño 051) = columna de clientes en cola; color neutro
  // blanco para diferenciarla de los estados de barbero (verde/rojo/ámbar).
  tone: 'active' | 'busy' | 'break' | 'queue'
  count: number
  density: Density
  children: React.ReactNode
}) {
  const dot: Record<typeof tone, string> = {
    active: 'bg-nxtup-active',
    busy: 'bg-nxtup-busy',
    break: 'bg-nxtup-break',
    queue: 'bg-white',
  }
  const text: Record<typeof tone, string> = {
    active: 'text-nxtup-active',
    busy: 'text-nxtup-busy',
    break: 'text-nxtup-break',
    queue: 'text-white',
  }
  const s = SIZE[density]
  return (
    // min-h-0 + overflow-hidden permite que la columna sea más
    // chica que su contenido (necesario para que el ul interno
    // scrollee). El header de columna queda fijo arriba, el ul
    // hace overflow-y-auto si la lista no cabe.
    <div className="bg-nxtup-bg flex flex-col min-h-0 overflow-hidden">
      <div className={`flex items-center justify-between px-8 ${s.colHeaderPad} flex-shrink-0`}>
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
      <ul className={`flex flex-col flex-1 overflow-y-auto min-h-0 ${s.listGap} ${s.colPad}`}>
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
// QueueClientCard (rediseño 051) — un cliente esperando en la cola.
// #posición + nombre. La posición es 1-based del orden FIFO de los
// que esperan (no el entry.position del DB, que es un counter
// histórico). A la derecha, badge "En camino" para clientes que
// reservaron por teléfono con Mamacita y aún no llegan (enCamino).
// ──────────────────────────────────────────────────────────────
function QueueClientCard({
  position,
  clientName,
  enCamino,
  density,
}: {
  position: number
  clientName: string
  // Mamacita: el cliente llamó por teléfono y viene en camino (aún no
  // hizo check-in físico). El barbero NO debe llamarlo hasta que llegue.
  enCamino: boolean
  density: Density
}) {
  const s = SIZE[density]
  return (
    <li
      className={`flex items-center bg-nxtup-line rounded-2xl ${s.cardPad} ${s.cardGap}`}
    >
      <span
        className={`text-white font-black tabular-nums text-center flex-shrink-0 ${s.posText} ${s.posWidth} mr-4`}
        aria-label={`Lugar ${position} en la cola`}
      >
        #{position}
      </span>
      <span className={`text-white font-bold block truncate flex-1 min-w-0 ${s.nameSingle}`}>
        {clientName}
      </span>
      {/* Badge de origen Mamacita: reservó por teléfono, viene en camino.
          Ámbar (nxtup-break) para distinguirlo de los presentes — le dice
          al barbero "llamó, viene en camino, no lo llames todavía".
          Tamaño legible a distancia (es el TV de la barbería). */}
      {enCamino && (
        <span
          className={`flex items-center flex-shrink-0 text-nxtup-break font-black uppercase tracking-wider ${
            density === 'lg' ? 'gap-2 text-xl' : density === 'md' ? 'gap-2 text-lg' : 'gap-1.5 text-base'
          }`}
          aria-label="Llamó por teléfono, viene en camino"
        >
          <Phone size={density === 'lg' ? 24 : density === 'md' ? 20 : 17} aria-hidden />
          En camino
        </span>
      )}
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
  // Sanción por llegada tarde (migración 047): pinta el card naranja
  // para que todos viendo la TV vean que este barbero está sancionado
  // y no recibirá walk-ins hasta que pase la hora. Sigue listado en
  // su posición FIFO, solo visualmente distinto.
  // useClock() existe ya en este file para el countdown del break —
  // lo reusamos en vez de leer Date.now() en render (react-hooks/purity).
  const clockNow = useClock()
  const sanctionedUntil = barber.sanctioned_until
    ? new Date(barber.sanctioned_until)
    : null
  const isLate =
    sanctionedUntil !== null &&
    clockNow !== null &&
    sanctionedUntil.getTime() > clockNow.getTime()
  const sanctionEndTime =
    isLate && sanctionedUntil
      ? sanctionedUntil.toLocaleTimeString(undefined, {
          hour: 'numeric',
          minute: '2-digit',
        })
      : null
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
        {isLate && sanctionEndTime && (
          <span className={`block text-orange-400 font-semibold ${s.subtitle}`}>
            Sancionado · hasta {sanctionEndTime}
          </span>
        )}
      </div>
    </li>
  )
}

function ActiveCalledCard({
  barber,
  clientName,
  calledAt,
  density,
}: {
  barber: Barber
  clientName: string
  calledAt: string | null
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
      {calledAt && <CalledCountdown calledAt={calledAt} />}
    </li>
  )
}

// ──────────────────────────────────────────────────────────────
// CalledCountdown — timer mm:ss hacia abajo desde 2:00 que indica
// cuánto le queda al barbero para tocar BUSY antes de que el cron
// del 018/041 lo mande a un break de 15 min.
//
// Para el TV display lo mostramos visible a distancia: tabular-nums
// grandes, padding generoso, badge naranja. En los últimos 30s
// pasa a rojo + animate-pulse.
//
// Self-contained — usa su propio interval de 1s para que los
// segundos se vean fluidos, en lugar del fetchEntries/fetchBarbers
// que solo corre on realtime events (puede tardar varios segundos
// entre triggers).
// ──────────────────────────────────────────────────────────────
function CalledCountdown({ calledAt }: { calledAt: string }) {
  const TOTAL_MS = 120_000
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
      <div className="flex-shrink-0 px-3 py-1.5 rounded-md bg-nxtup-busy/15 border border-nxtup-busy/60 animate-pulse">
        <span className="text-nxtup-busy font-black tabular-nums text-2xl uppercase tracking-widest">
          ⚠
        </span>
      </div>
    )
  }

  const totalSec = Math.ceil(remaining / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const isUrgent = remaining <= 30_000

  return (
    <div
      className={`
        flex-shrink-0 px-3 py-1.5 rounded-md border
        ${
          isUrgent
            ? 'bg-nxtup-busy/15 border-nxtup-busy/60 animate-pulse'
            : 'bg-orange-500/10 border-orange-400/40'
        }
      `}
    >
      <span
        className={`
          font-black tabular-nums text-2xl
          ${isUrgent ? 'text-nxtup-busy' : 'text-orange-400'}
        `}
      >
        {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
      </span>
    </div>
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
 * DisplayMessageTicker (rediseño 051) — cintillo de abajo del TV que
 * rota el mensaje del dueño (shop.display_message). Reemplaza al viejo
 * QueueTicker que rotaba los clientes (esos ahora viven en la columna
 * fija "En cola"). El dueño escribe este mensaje desde Configuración:
 * promos, avisos, horarios especiales ("2x1 mañana por el 4 de julio").
 *
 * Si no hay mensaje (null o vacío), el componente NO renderiza nada y
 * las columnas de arriba usan todo el alto del TV (la decisión de
 * Francisco: limpio, sin texto de relleno).
 *
 * Loop seamless: mismo mecanismo que el ticker viejo — el contenido se
 * renderiza dos veces lado a lado y la animación CSS `queue-ticker`
 * traslada de translateX(0) a translateX(-50%); al reiniciar, la
 * segunda copia está donde estaba la primera = sin salto. El mensaje
 * se repite varias veces dentro de cada copia para cubrir el ancho del
 * viewport (un mensaje corto no llenaría la pantalla y dejaría un gap).
 *
 * Respeta `prefers-reduced-motion` vía la regla en globals.css —
 * animación off y la segunda copia oculta.
 */
function DisplayMessageTicker({ message }: { message: string | null }) {
  const text = (message ?? '').trim()
  if (!text) return null

  // Velocidad cómoda proporcional al largo del mensaje, mínimo 20s para
  // que un mensaje corto no pase volando.
  const durationSec = Math.max(20, Math.round(text.length * 0.4))

  // Repetir el mensaje para cubrir el ancho del TV. 6 copias × mensaje
  // (hasta 120 chars) llena cualquier pantalla típica. Luego se
  // duplica todo para el loop seamless.
  const REPEAT = 6
  const segments = Array.from({ length: REPEAT * 2 }, (_, i) => i)

  return (
    <footer className="border-t border-nxtup-line bg-nxtup-bg overflow-hidden">
      <div
        className="queue-ticker-track flex whitespace-nowrap py-5"
        style={{ animation: `queue-ticker ${durationSec}s linear infinite` }}
      >
        {segments.map(idx => (
          <span key={idx} className="inline-flex items-center px-10">
            <span className="text-3xl font-black tracking-tight text-white">
              {text}
            </span>
            {/* Separador ámbar después de cada copia — le da un acento
                "promoción" sin saturar, y mantiene el espaciado uniforme
                al reiniciar el loop. */}
            <span className="text-nxtup-break text-3xl pl-10" aria-hidden>
              ✦
            </span>
          </span>
        ))}
      </div>
    </footer>
  )
}
