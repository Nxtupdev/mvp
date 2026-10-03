'use client'

/**
 * DisplayBoard — el TV del shop, formato TABLA (port del dealer, oct-2026).
 *
 * Tres columnas, cada una una <table> con encabezados y conteo:
 * Disponibles | Ocupados (corte + descanso) | En cola. Sin columna
 * "Estado" — el título de la columna ya lo dice; lo distinto (llamando,
 * sancionado, descanso, cita, en camino) va DEBAJO del nombre.
 *
 * Resuelve el pendiente viejo del overflow: densidad en tres niveles
 * (lg/md/sm) según la columna más larga, salto directo a sm en
 * viewports <1500px (TV 720p / sticks que renderizan a 1280), y margen
 * de seguridad contra el overscan de los televisores.
 *
 * Qué NO cambió: buckets (FIFO por available_since, called/in_progress,
 * descanso por inicio), wake lock, recarga cada 6h, refetch por
 * broadcast (070) y la pantalla de cerrado con la próxima apertura.
 */

import { useEffect, useMemo, useState } from 'react'
import { useNow, useNowDate, useViewportWidth } from '@/lib/client-hooks'
import { Coffee, Phone, UserCheck, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { debounce } from '@/lib/debounce'
import Logo from '@/components/Logo'
import ShopLogo from '@/components/ShopLogo'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
import { buildHeldPositions } from '@/lib/queue-order'
import { MESSAGES } from '@/lib/i18n-messages'
import { interpolate } from '@/lib/i18n-types'
import {
  scheduleFromDb,
  nextOpening,
  formatHourLabel,
} from '@/lib/business-hours'
import { subscribeShopChanges } from '@/lib/realtime'

type Entry = {
  id: string
  position: number
  client_name: string
  status: 'waiting' | 'called' | 'in_progress'
  barber_id: string | null
  created_at: string
  // Tiempo en que se llamó al cliente. Null para 'waiting'. Usado por
  // la fila de llamada para el timer de 2 min hacia abajo y por la de
  // ocupado para el "Tiempo".
  called_at: string | null
  // Migración 063 — in_progress puesto por el sistema (el barbero nunca
  // tocó BUSY). Si lleva >40 min sin cerrar, el TV lo marca en rojo.
  auto_busy: boolean | null
  // Migración 066 — cita: barbero que el cliente eligió en el kiosko.
  // El TV lo muestra bajo el nombre ("📅 Cita · {barbero}").
  appointment_barber_id: string | null
  // Mamacita (agente de voz): si mamacita_entry_id != null el cliente
  // reservó por teléfono. Si además arrived_at == null, todavía no hace
  // check-in físico → viene en camino.
  mamacita_entry_id: string | null
  arrived_at: string | null
  // Migración 058 — hora estimada de llegada que el cliente dio por
  // teléfono. El TV la muestra bajo el nombre ("~3:15 PM").
  eta_at: string | null
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
  // Migración 047 — fin de sanción por llegada tarde. Si está en el
  // futuro, la fila se pinta naranja para que todo el piso lo vea.
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
  // Migración 051 — mensaje del cintillo de abajo. NULL/'' = sin cintillo.
  display_message: string | null
  // Migración 052 — idioma del TV elegido por el dueño (no cookie).
  display_language: 'es' | 'en'
  // Migración 062 — horario semanal (pantalla de cerrado). NULL = sin horario.
  business_hours: unknown
  timezone: string | null
}

// ── Density tiers ─────────────────────────────────────────────────
// El TV tiene que escalar: un shop de 2 barberos debe verse premium y
// espacioso; uno de 13 (Fade Factory) debe caber completo sin scroll.
// El nivel sale de la columna más larga y TODAS las tablas usan el
// mismo, así el grid queda parejo.
type Density = 'lg' | 'md' | 'sm'

const SIZE: Record<
  Density,
  {
    avatar: number
    th: string
    cell: string
    name: string
    sub: string
    num: string
    rowPad: string
    pill: string
    timer: string
  }
> = {
  lg: {
    avatar: 44,
    th: 'text-sm',
    cell: 'text-2xl',
    name: 'text-3xl',
    sub: 'text-base',
    num: 'text-3xl',
    rowPad: 'py-4',
    pill: 'text-base',
    timer: 'text-3xl',
  },
  md: {
    avatar: 36,
    th: 'text-xs',
    cell: 'text-xl',
    name: 'text-2xl',
    sub: 'text-sm',
    num: 'text-2xl',
    rowPad: 'py-3',
    pill: 'text-sm',
    timer: 'text-2xl',
  },
  sm: {
    avatar: 28,
    th: 'text-[11px]',
    cell: 'text-base',
    name: 'text-lg',
    sub: 'text-xs',
    num: 'text-lg',
    rowPad: 'py-2',
    pill: 'text-xs',
    timer: 'text-xl',
  },
}

function useClock() {
  // null en el servidor; Date memoizada por tick de 30 s.
  return useNowDate(30_000)
}

function useTickingNow() {
  // Para los contadores de descanso y de llamada: tick de 1 s con el
  // reloj compartido. `null` en el servidor, así el HTML no trae un
  // segundo distinto al del cliente (desajuste de hidratación).
  return useNow(1000)
}

/**
 * Screen Wake Lock — pide al navegador mantener la pantalla despierta.
 * Vital para el TV: los shops montan /display en un Fire TV / smart TV
 * y el protector de pantalla entra a los 15-20 min de "sin input".
 *
 * Comportamiento: pide el lock al montar; si el sistema lo suelta (tab
 * en segundo plano porque el TV cambió de input), se re-pide al volver
 * a ser visible; se libera al desmontar. Soporte: Chromium (Chrome,
 * Edge, Silk en Fire TV nuevos, WebView). En iOS Safari y navegadores
 * viejos no-op silencioso — el ajuste del TV es el cinturón; esto, los
 * tirantes.
 */
function useWakeLock() {
  useEffect(() => {
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
      if (!nav.wakeLock) return
      try {
        sentinel = await nav.wakeLock.request('screen')
        sentinel.addEventListener('release', () => {
          sentinel = null
        })
      } catch {
        // NotAllowedError cuando la página no está visible, etc. —
        // se reintenta en el próximo visibilitychange.
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

function formatDate(d: Date, locale: 'es' | 'en') {
  return d.toLocaleDateString(locale === 'es' ? 'es-US' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Minutos enteros entre un ISO y `now`, nunca negativo. */
function minutesSince(iso: string, now: Date | null): number | null {
  if (!now) return null
  return Math.max(0, Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000))
}

// Hora estimada de llegada → reloj local ("3:15 PM"). El TV corre EN la
// tienda, así que la hora local del navegador ES la del shop. Devuelve
// null si no hay eta o la fecha es inválida.
function formatEtaClock(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

type Translate = (key: string) => string

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
  // Configuración (051/052).
  const [shop, setShop] = useState<Shop>(initialShop)
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [barbers, setBarbers] = useState<Barber[]>(initialBarbers)
  const [connected, setConnected] = useState(true)
  const now = useClock()
  const viewportWidth = useViewportWidth()

  // Migración 052 — el TV traduce con el idioma del shop, NO con la
  // cookie del dispositivo. Cambia en vivo (shop es estado + realtime).
  const tvLocale: 'es' | 'en' = shop.display_language === 'en' ? 'en' : 'es'
  const tt: Translate = key => MESSAGES[tvLocale][key] ?? key

  useWakeLock()

  // Kiosk auto-refresh: recarga limpia cada 6h. Algunos navegadores de
  // smart TV acumulan memoria / pierden realtime en sesiones largas.
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
          'id, position, client_name, status, barber_id, created_at, called_at, mamacita_entry_id, arrived_at, eta_at, auto_busy, appointment_barber_id',
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

    // 051: refetch del shop cuando cambia (cintillo, is_open, logo).
    const fetchShop = async () => {
      const { data } = await supabase
        .from('shops')
        .select(
          'id, name, is_open, logo_url, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, display_message, display_language, business_hours, timezone',
        )
        .eq('id', shop.id)
        .single()
      if (data) setShop(data as Shop)
    }

    // Debounce: un cambio puede tocar varias filas/tablas a la vez;
    // colapsamos cada ráfaga en un refetch ~250ms tras el último evento.
    const debouncedEntries = debounce(fetchEntries, 250)
    const debouncedBarbers = debounce(fetchBarbers, 250)
    const debouncedShop = debounce(fetchShop, 250)

    // Broadcast (070): la señal llega por el canal shop:<id> sin datos
    // personales; cada tabla dispara su refetch con el acceso propio.
    const channel = subscribeShopChanges(
      supabase,
      shop.id,
      change => {
        if (change.table === 'queue_entries') debouncedEntries()
        else if (change.table === 'barbers') debouncedBarbers()
        else if (change.table === 'shops') debouncedShop()
      },
      status => {
        // 'SUBSCRIBED' es el estado sano. Cualquier otro = canal caído
        // (red, reinicio del server); lo que hay en pantalla puede estar
        // viejo hasta reconectar — el pie lo muestra en ámbar.
        setConnected(status === 'SUBSCRIBED')
      },
    )

    return () => {
      debouncedEntries.cancel()
      debouncedBarbers.cancel()
      debouncedShop.cancel()
      supabase.removeChannel(channel)
    }
  }, [shop.id])

  const heldPositions = useMemo(() => buildHeldPositions(barbers), [barbers])

  if (!shop.is_open) {
    return (
      <main className="min-h-dvh flex flex-col items-center justify-center px-12 cursor-none select-none">
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
        <h1 className="font-display text-7xl tracking-tight">{shop.name}</h1>
        {(() => {
          // "Abrimos hoy/mañana/el {día} a las {hora}" — solo si el dueño
          // definió horario (062). Zona del shop de la DB, no del aparato.
          if (!shop.business_hours) return null
          const next = nextOpening(
            scheduleFromDb(shop.business_hours),
            shop.timezone || 'America/New_York',
          )
          if (!next) return null
          const time = formatHourLabel(next.start)
          const text =
            next.daysAhead === 0
              ? interpolate(tt('display.opensToday'), { time })
              : next.daysAhead === 1
                ? interpolate(tt('display.opensTomorrow'), { time })
                : interpolate(tt('display.opensOn'), {
                    day: tt(`day.${next.dayKey}`),
                    time,
                  })
          return <p className="text-salvia text-2xl mt-8">{text}</p>
        })()}
      </main>
    )
  }

  // ── Bucketing ─────────────────────────────────────────────────
  const calledEntries = entries.filter(e => e.status === 'called')
  const inProgressEntries = entries.filter(e => e.status === 'in_progress')
  const waitingEntries = entries
    .filter(e => e.status === 'waiting')
    .sort((a, b) => a.position - b.position)

  // DISPONIBLES = barberos en FIFO + disponibles por recibir un cliente
  // llamado (estado de transición). Los de la FIFO primero, por
  // available_since.
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

  // OCUPADOS = cortando (status='busy')
  const busyBarbers = barbers
    .filter(b => b.status === 'busy')
    .sort((a, b) => a.name.localeCompare(b.name))

  // DESCANSO = en break, el más viejo primero
  const breakBarbers = barbers
    .filter(b => b.status === 'break')
    .sort((a, b) => {
      const ta = a.break_started_at ? new Date(a.break_started_at).getTime() : 0
      const tb = b.break_started_at ? new Date(b.break_started_at).getTime() : 0
      return ta - tb
    })

  // ── Density tier ──────────────────────────────────────────────
  // El texto debe leerse desde el otro lado del shop. Con pocos
  // barberos, filas grandes; cuando una columna se llena, bajamos la
  // densidad para que 10-13 quepan sin scroll.
  const availableCount = activeFifo.length + activeCalledBarbers.length
  const occupiedCount = busyBarbers.length + breakBarbers.length
  const maxColumnCount = Math.max(availableCount, occupiedCount, waitingEntries.length)
  const tiers: Density[] = ['lg', 'md', 'sm']
  let tier = maxColumnCount <= 5 ? 0 : maxColumnCount <= 9 ? 1 : 2
  // TVs de 720p (o un stick que renderiza a 1280 px): con 'md' los
  // nombres todavía se truncan, así que va directo a 'sm'.
  if (viewportWidth != null && viewportWidth < 1500) tier = 2
  const density = tiers[tier]

  return (
    // Margen de seguridad: muchos televisores recortan el 2-5 % del
    // borde (overscan) y se llevaban la columna del tiempo.
    <main className="h-dvh flex flex-col cursor-none select-none overflow-hidden px-[2.5%] py-[1%]">
      {/* Cabecera: logo + shop a la izquierda, reloj + fecha a la derecha */}
      <header className="flex items-center justify-between px-6 py-5 border-b border-nxtup-line gap-8">
        <div className="flex items-center gap-5 min-w-0">
          {shop.logo_url ? (
            <ShopLogo url={shop.logo_url} name={shop.name} size={56} />
          ) : (
            <Logo className="h-10 w-auto" tone="dark" />
          )}
          <div className="min-w-0">
            <span className="text-white font-display text-3xl truncate block leading-tight">
              {shop.name}
            </span>
            <span className="text-nxtup-muted text-xs font-bold uppercase tracking-[0.28em]">
              {tt('display.subtitle')}
            </span>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-white font-black text-4xl tabular-nums leading-none">
            {now ? formatClock(now) : ''}
          </p>
          <p className="text-nxtup-muted text-sm font-semibold mt-1.5">
            {now ? formatDate(now, tvLocale) : ''}
          </p>
        </div>
      </header>

      {/* 3 columnas: cada una una tabla con su encabezado. `min-h-0` es
          crítico: por default los items de grid crecen más allá del
          contenedor; con min-h-0 la columna scrollea si no cabe.
          Disponibles no lleva cliente, así que cede ancho a Ocupados y
          En cola (cliente + tiempo). */}
      <section className="flex-1 grid grid-cols-[0.9fr_1.05fr_1.05fr] gap-px bg-nxtup-line min-h-0">
        {/* ── Columna 1: Disponibles ── */}
        <Column
          title={tt('display.col.available')}
          tone="active"
          count={availableCount}
          headers={[
            { label: tt('display.th.num'), width: 'w-14' },
            { label: tt('display.th.barber') },
            { label: tt('display.th.since'), align: 'right' },
          ]}
          density={density}
          empty={{
            icon: <UserCheck />,
            title: tt('display.empty.available.title'),
            blurb: tt('display.empty.available.blurb'),
          }}
        >
          {activeFifo.map((b, idx) => (
            <ActiveRow key={b.id} barber={b} position={idx + 1} density={density} tt={tt} />
          ))}
          {activeCalledBarbers.map(b => {
            const call = calledEntries.find(e => e.barber_id === b.id)
            return (
              <ActiveCalledRow
                key={b.id}
                barber={b}
                clientName={call?.client_name ?? '—'}
                calledAt={call?.called_at ?? null}
                density={density}
                tt={tt}
              />
            )
          })}
        </Column>

        {/* ── Columna 2: Ocupados (corte + descanso) ── */}
        <Column
          title={tt('display.col.occupied')}
          tone="busy"
          count={occupiedCount}
          headers={[
            { label: tt('display.th.barber') },
            { label: tt('display.th.customer') },
            { label: tt('display.th.time'), align: 'right' },
          ]}
          density={density}
          empty={{
            icon: <Coffee />,
            title: tt('display.empty.occupied.title'),
            blurb: tt('display.empty.occupied.blurb'),
          }}
        >
          {busyBarbers.map(b => {
            const c = inProgressEntries.find(e => e.barber_id === b.id)
            // Silla sin confirmar (auto-BUSY, 063) que lleva >40 min sin
            // cerrar — un corte real ya habría terminado. Rojo.
            const stale = !!(
              c?.auto_busy &&
              c?.called_at &&
              now &&
              now.getTime() - new Date(c.called_at).getTime() > 40 * 60_000
            )
            return (
              <BusyRow
                key={b.id}
                barber={b}
                clientName={c?.client_name ?? null}
                minutes={c?.called_at ? minutesSince(c.called_at, now) : null}
                staleLabel={stale ? tt('display.unconfirmedStale') : null}
                density={density}
                tt={tt}
              />
            )
          })}
          {breakBarbers.map(b => (
            <BreakRow
              key={b.id}
              barber={b}
              shop={shop}
              heldPosition={heldPositions.get(b.id)}
              density={density}
              tt={tt}
            />
          ))}
        </Column>

        {/* ── Columna 3: En cola ── */}
        <Column
          title={tt('display.col.queue')}
          tone="queue"
          count={waitingEntries.length}
          headers={[
            { label: tt('display.th.num'), width: 'w-14' },
            { label: tt('display.th.customer') },
            { label: tt('display.th.waiting'), align: 'right' },
          ]}
          density={density}
          empty={{
            icon: <Users />,
            title: tt('display.empty.queue.title'),
            blurb: tt('display.empty.queue.blurb'),
          }}
        >
          {waitingEntries.map((e, idx) => {
            // Cita (066): mostrar con quién bajo el nombre — el cliente
            // amarrado espera a SU barbero, no al pool.
            const apptBarberName = e.appointment_barber_id
              ? barbers.find(r => r.id === e.appointment_barber_id)?.name ?? null
              : null
            return (
              <QueueRow
                key={e.id}
                position={idx + 1}
                clientName={e.client_name}
                enCamino={e.mamacita_entry_id !== null && e.arrived_at === null}
                etaAt={e.eta_at}
                apptLabel={
                  apptBarberName
                    ? interpolate(tt('display.appt.confirmed'), { name: apptBarberName })
                    : null
                }
                minutes={minutesSince(e.arrived_at ?? e.created_at, now)}
                density={density}
                tt={tt}
              />
            )
          })}
        </Column>
      </section>

      {/* Cintillo (051) — rota el mensaje del dueño. Sin mensaje, nada. */}
      <DisplayMessageTicker message={shop.display_message} />

      {/* Pie: marca + estado de conexión. Verde = realtime sano; ámbar
          con pulso = perdimos el canal y reconectamos. */}
      <footer className="flex items-center justify-between px-6 py-3 border-t border-nxtup-line flex-shrink-0">
        <span className="text-nxtup-dim text-xs font-bold uppercase tracking-[0.22em]">
          {tt('display.tagline')}
        </span>
        <span
          className={`flex items-center gap-2 text-xs font-bold uppercase tracking-[0.22em] ${
            connected ? 'text-nxtup-active' : 'text-nxtup-break'
          }`}
        >
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-nxtup-active' : 'bg-nxtup-break animate-pulse'
            }`}
            aria-hidden
          />
          {connected ? tt('display.live') : tt('display.reconnecting')}
        </span>
      </footer>
    </main>
  )
}

// ──────────────────────────────────────────────────────────────
// Column — una tabla con título, conteo, encabezados y estado vacío
// ──────────────────────────────────────────────────────────────

type Header = { label: string; width?: string; align?: 'right' }

function Column({
  title,
  tone,
  count,
  headers,
  density,
  empty,
  children,
}: {
  title: string
  // 'queue' = clientes en cola; blanco para diferenciarla de los
  // estados de barbero (verde/rojo) — identidad del TV de barbería.
  tone: 'active' | 'busy' | 'queue'
  count: number
  headers: Header[]
  density: Density
  empty: { icon: React.ReactNode; title: string; blurb: string }
  children: React.ReactNode
}) {
  const dot: Record<typeof tone, string> = {
    active: 'bg-nxtup-active',
    busy: 'bg-nxtup-busy',
    queue: 'bg-white',
  }
  const text: Record<typeof tone, string> = {
    active: 'text-nxtup-active',
    busy: 'text-nxtup-busy',
    queue: 'text-white',
  }
  const s = SIZE[density]
  return (
    // min-h-0 + overflow-hidden permite que la columna sea más chica
    // que su contenido. El título queda fijo arriba; la tabla scrollea
    // si la lista no cabe.
    <div className="bg-nxtup-bg flex flex-col min-h-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 pt-6 pb-3 flex-shrink-0">
        <div className="flex items-center gap-3">
          <span className={`w-3.5 h-3.5 rounded-full ${dot[tone]}`} aria-hidden />
          <h2 className={`uppercase tracking-[0.14em] text-2xl font-black ${text[tone]}`}>
            {title}
          </h2>
        </div>
        <span className={`text-3xl font-black tabular-nums ${text[tone]}`}>{count}</span>
      </div>
      {count === 0 ? (
        <div className="flex-1 grid place-items-center text-center px-10 pb-16">
          <div>
            <div className="text-nxtup-dim mx-auto mb-4 [&_svg]:w-16 [&_svg]:h-16 [&_svg]:stroke-[1.6]" aria-hidden>
              {empty.icon}
            </div>
            <p className="text-nxtup-muted text-xl font-bold mb-1.5">{empty.title}</p>
            <p className="text-nxtup-dim text-base">{empty.blurb}</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                {headers.map((h, i) => (
                  <th
                    key={i}
                    className={`${s.th} ${h.width ?? ''} ${h.align === 'right' ? 'text-right' : 'text-left'} text-nxtup-dim font-bold uppercase tracking-[0.22em] px-3 first:pl-6 last:pr-6 pb-2.5 border-b border-nxtup-line whitespace-nowrap`}
                  >
                    {h.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>{children}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

const CELL = 'px-3 first:pl-6 last:pr-6 border-b border-nxtup-line align-middle whitespace-nowrap'
// La celda del nombre absorbe el ancho sobrante y trunca (max-w-0 es el
// truco para que una celda de tabla con layout auto pueda encogerse).
const NAME_CELL = 'w-full max-w-0'

function Pill({
  tone,
  size,
  children,
}: {
  tone: 'active' | 'busy' | 'break' | 'muted' | 'accent' | 'orange'
  size: string
  children: React.ReactNode
}) {
  const color: Record<typeof tone, string> = {
    active: 'text-nxtup-active',
    busy: 'text-nxtup-busy',
    break: 'text-nxtup-break',
    muted: 'text-nxtup-muted',
    accent: 'text-salvia',
    orange: 'text-orange-400',
  }
  const dotBg: Record<typeof tone, string> = {
    active: 'bg-nxtup-active',
    busy: 'bg-nxtup-busy',
    break: 'bg-nxtup-break',
    muted: 'bg-nxtup-muted',
    accent: 'bg-salvia',
    orange: 'bg-orange-400',
  }
  return (
    <span
      className={`inline-flex items-center gap-2 font-bold uppercase tracking-[0.12em] ${size} ${color[tone]}`}
    >
      <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotBg[tone]}`} aria-hidden />
      {children}
    </span>
  )
}

// ──────────────────────────────────────────────────────────────
// Rows — una por estado
// ──────────────────────────────────────────────────────────────

function ActiveRow({
  barber,
  position,
  density,
  tt,
}: {
  barber: Barber
  position: number
  density: Density
  tt: Translate
}) {
  const s = SIZE[density]
  // Sanción por llegada tarde (047): fila naranja para que todo el piso
  // vea que no recibirá walk-ins hasta que pase la hora. Sigue en su
  // posición FIFO, solo visualmente distinto.
  const clockNow = useClock()
  const sanctionedUntil = barber.sanctioned_until ? new Date(barber.sanctioned_until) : null
  const isLate =
    sanctionedUntil !== null &&
    clockNow !== null &&
    sanctionedUntil.getTime() > clockNow.getTime()
  const sanctionEndTime = isLate && sanctionedUntil ? formatClock(sanctionedUntil) : null
  return (
    <tr>
      <td className={`${CELL} ${s.rowPad} ${s.num} font-black tabular-nums ${isLate ? 'text-orange-400' : 'text-salvia'}`}>
        {position}
      </td>
      <td className={`${CELL} ${NAME_CELL} ${s.rowPad}`}>
        <span className="flex items-center gap-3 min-w-0">
          <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
          <span className="min-w-0">
            <span className={`text-white font-bold truncate block ${s.name}`}>{barber.name}</span>
            {isLate && sanctionEndTime && (
              <Pill tone="orange" size={s.pill}>
                {interpolate(tt('display.status.late'), { time: sanctionEndTime })}
              </Pill>
            )}
          </span>
        </span>
      </td>
      <td className={`${CELL} ${s.rowPad} ${s.cell} text-right text-nxtup-muted tabular-nums`}>
        {barber.available_since ? formatClock(new Date(barber.available_since)) : '—'}
      </td>
    </tr>
  )
}

function ActiveCalledRow({
  barber,
  clientName,
  calledAt,
  density,
  tt,
}: {
  barber: Barber
  clientName: string
  calledAt: string | null
  density: Density
  tt: Translate
}) {
  const s = SIZE[density]
  return (
    <tr className="bg-nxtup-active/5">
      <td className={`${CELL} ${s.rowPad} ${s.num} font-black text-nxtup-active`} aria-hidden>
        →
      </td>
      <td className={`${CELL} ${NAME_CELL} ${s.rowPad}`}>
        <span className="flex items-center gap-3 min-w-0">
          <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
          <span className="min-w-0">
            <span className={`text-white font-bold truncate block ${s.name}`}>{barber.name}</span>
            <Pill tone="active" size={s.pill}>
              <span className="truncate max-w-[18ch]">
                {tt('display.status.calling')} · {clientName}
              </span>
            </Pill>
          </span>
        </span>
      </td>
      <td className={`${CELL} ${s.rowPad} text-right`}>
        {calledAt && <CalledCountdown calledAt={calledAt} size={s.timer} />}
      </td>
    </tr>
  )
}

// ──────────────────────────────────────────────────────────────
// CalledCountdown — timer mm:ss hacia abajo desde 2:00: lo que le
// queda al cliente para llegar a la silla antes de que el sistema
// asuma que el corte empezó (auto-BUSY, 063).
//
// Tick de 1s del reloj compartido para que los segundos se vean
// fluidos. En los últimos 30s pasa a rojo + pulso.
// ──────────────────────────────────────────────────────────────
function CalledCountdown({ calledAt, size }: { calledAt: string; size: string }) {
  const TOTAL_MS = 120_000
  const calledAtMs = new Date(calledAt).getTime()
  const now = useTickingNow()
  if (now == null) return null

  const remaining = TOTAL_MS - (now - calledAtMs)

  if (remaining <= 0) {
    return (
      <span className={`font-black tabular-nums text-nxtup-busy animate-pulse ${size}`}>⚠</span>
    )
  }

  const totalSec = Math.ceil(remaining / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  const isUrgent = remaining <= 30_000

  return (
    <span
      className={`font-black tabular-nums ${size} ${
        isUrgent ? 'text-nxtup-busy animate-pulse' : 'text-orange-400'
      }`}
    >
      {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
    </span>
  )
}

function BusyRow({
  barber,
  clientName,
  minutes,
  staleLabel,
  density,
  tt,
}: {
  barber: Barber
  clientName: string | null
  minutes: number | null
  // Alerta cuando la silla es auto-BUSY >40 min sin cerrar (063).
  // null = sin alerta. Ya viene traducido vía tt().
  staleLabel: string | null
  density: Density
  tt: Translate
}) {
  const s = SIZE[density]
  return (
    <tr>
      <td className={`${CELL} ${NAME_CELL} ${s.rowPad}`}>
        <span className="flex items-center gap-3 min-w-0">
          <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
          <span className={`text-white font-bold truncate ${s.name}`}>{barber.name}</span>
        </span>
      </td>
      <td className={`${CELL} ${s.rowPad}`}>
        <span className={`block text-white truncate max-w-[12ch] ${s.cell}`}>{clientName ?? '—'}</span>
        {staleLabel && (
          <span className={`block text-nxtup-busy font-bold truncate max-w-[24ch] ${s.sub}`}>{staleLabel}</span>
        )}
      </td>
      <td
        className={`${CELL} ${s.rowPad} ${s.cell} text-right tabular-nums ${
          staleLabel ? 'text-nxtup-busy font-black' : 'text-nxtup-muted'
        }`}
      >
        {minutes == null ? '—' : interpolate(tt('display.min'), { n: minutes })}
      </td>
    </tr>
  )
}

function BreakRow({
  barber,
  shop,
  heldPosition,
  density,
  tt,
}: {
  barber: Barber
  shop: Shop
  heldPosition: number | undefined
  density: Density
  tt: Translate
}) {
  const s = SIZE[density]
  const now = useTickingNow()

  const startedMs = barber.break_started_at ? new Date(barber.break_started_at).getTime() : null
  const elapsedSec = startedMs && now != null ? Math.max(0, Math.floor((now - startedMs) / 1000)) : 0

  const breakMin =
    barber.break_minutes_at_start ??
    ((barber.breaks_taken_today ?? 1) <= 1 ? shop.first_break_minutes : shop.next_break_minutes)
  const totalSec = breakMin * 60
  const remainingSec = totalSec - elapsedSec
  const allowedSec = totalSec + (shop.break_position_grace_minutes ?? 5) * 60
  const overGrace = elapsedSec > allowedSec

  const mm = Math.floor(Math.abs(remainingSec) / 60)
  const ss = Math.abs(remainingSec) % 60
  const formatted = `${remainingSec < 0 ? '+' : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  const timerColor =
    remainingSec < 0 ? (overGrace ? 'text-nxtup-busy' : 'text-nxtup-break') : 'text-white'

  const showHeld = shop.keep_position_on_break && heldPosition !== undefined && !overGrace

  return (
    <tr>
      <td className={`${CELL} ${NAME_CELL} ${s.rowPad}`}>
        <span className="flex items-center gap-3 min-w-0">
          <Avatar avatar={barber.avatar} name={barber.name} size={s.avatar} />
          <span className={`text-white font-bold truncate ${s.name}`}>{barber.name}</span>
        </span>
      </td>
      <td className={`${CELL} ${s.rowPad}`}>
        <Pill tone="break" size={s.pill}>
          {tt('display.status.break')}
        </Pill>
        {showHeld ? (
          <span className={`block text-nxtup-active font-bold mt-1 ${s.sub}`}>
            {interpolate(tt('display.status.returnsTo'), { n: heldPosition })}
          </span>
        ) : overGrace && shop.keep_position_on_break ? (
          <span className={`block text-nxtup-busy font-bold mt-1 ${s.sub}`}>
            {tt('display.status.lostPosition')}
          </span>
        ) : null}
      </td>
      <td
        className={`${CELL} ${s.rowPad} ${s.timer} text-right font-black tabular-nums ${timerColor}`}
        aria-label={`Break: ${formatted}`}
      >
        {formatted}
      </td>
    </tr>
  )
}

function QueueRow({
  position,
  clientName,
  enCamino,
  etaAt,
  apptLabel,
  minutes,
  density,
  tt,
}: {
  position: number
  clientName: string
  // Mamacita: el cliente llamó por teléfono y viene en camino (aún no
  // hizo check-in físico). El barbero NO debe llamarlo hasta que llegue.
  enCamino: boolean
  // Hora estimada de llegada (058). Bajo el nombre: ícono + "~3:15 PM";
  // sin hora, el texto "En camino" de siempre.
  etaAt: string | null
  // Cita (066): "📅 Cita · {barbero}" bajo el nombre. null = walk-in.
  apptLabel: string | null
  minutes: number | null
  density: Density
  tt: Translate
}) {
  const s = SIZE[density]
  const etaClock = enCamino ? formatEtaClock(etaAt) : null
  return (
    <tr>
      <td className={`${CELL} ${s.rowPad} ${s.num} font-black tabular-nums text-salvia`}>
        {position}
      </td>
      <td className={`${CELL} ${NAME_CELL} ${s.rowPad}`}>
        <span className={`block text-white font-bold truncate ${s.name}`}>{clientName}</span>
        {enCamino ? (
          <span
            className={`inline-flex items-center gap-2 text-nxtup-break font-bold uppercase tracking-[0.12em] tabular-nums ${s.pill}`}
          >
            <Phone size={density === 'lg' ? 20 : density === 'md' ? 17 : 14} aria-hidden />
            {etaClock ? `~${etaClock}` : tt('display.status.onTheWay')}
          </span>
        ) : apptLabel ? (
          <span className={`block text-salvia truncate ${s.sub}`}>📅 {apptLabel}</span>
        ) : null}
      </td>
      <td className={`${CELL} ${s.rowPad} ${s.cell} text-right text-nxtup-muted tabular-nums`}>
        {enCamino || minutes == null ? '—' : interpolate(tt('display.min'), { n: minutes })}
      </td>
    </tr>
  )
}

// ──────────────────────────────────────────────────────────────
// Cintillo de abajo
// ──────────────────────────────────────────────────────────────

/**
 * DisplayMessageTicker (051) — rota el mensaje del dueño
 * (shop.display_message): promos, avisos, horarios especiales.
 *
 * Loop seamless: el contenido se renderiza dos veces lado a lado y la
 * animación CSS `queue-ticker` traslada de translateX(0) a
 * translateX(-50%); al reiniciar, la segunda copia está donde estaba
 * la primera = sin salto. Respeta `prefers-reduced-motion` vía la
 * regla en globals.css.
 */
function DisplayMessageTicker({ message }: { message: string | null }) {
  const text = (message ?? '').trim()
  if (!text) return null

  // Velocidad proporcional al largo, mínimo 20s para que un mensaje
  // corto no pase volando.
  const durationSec = Math.max(20, Math.round(text.length * 0.4))

  // 6 copias × mensaje llena cualquier pantalla típica; se duplica todo
  // para el loop seamless.
  const REPEAT = 6
  const segments = Array.from({ length: REPEAT * 2 }, (_, i) => i)

  return (
    <div className="border-t border-nxtup-line bg-nxtup-bg overflow-hidden flex-shrink-0">
      <div
        className="queue-ticker-track flex whitespace-nowrap py-5"
        style={{ animation: `queue-ticker ${durationSec}s linear infinite` }}
      >
        {segments.map(idx => (
          <span key={idx} className="inline-flex items-center px-10">
            <span className="text-3xl font-black tracking-tight text-white">{text}</span>
            <span className="text-salvia text-3xl pl-10" aria-hidden>
              ✦
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}
