'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/i18n'
import { Avatar, isRenderableAvatar } from '@/components/avatars'

type Action =
  | 'state_change'
  | 'client_assigned'
  | 'position_kept'
  | 'position_lost'
  | 'shop_settings_changed'
  // Migration 018 + 035 — cascada de 2 min sobre 'called' sin respuesta.
  | 'no_show'
  | 'no_show_no_takers'
  // Migrations 021 + 028 — auto-offline. Sub-razón en metadata.reason:
  //   * 'available_no_action' — 3h sin actividad (idle 021)
  //   * 'busy_too_long' — 3h congelado en busy (idle 021)
  //   * 'break_expired' — pasó break_minutes + grace (028)
  | 'idle_timeout_offline'
  // Migration 037 — el dueño quita la penalidad de un barbero
  // (override manual desde el Centro de Mando). Reusado en 047
  // como acción legacy del sistema de cortes — el sistema nuevo
  // genera sanction_applied / sanction_cleared.
  | 'toll_cleared_by_owner'
  // Migration 037 — el dueño mueve un barbero un slot arriba o
  // abajo en la FIFO (swap de available_since).
  | 'fifo_moved_by_owner'
  // Migración 047 — el sistema (register_late_arrival) detectó
  // llegada tarde y le puso una sanción de tiempo automática.
  | 'sanction_applied'
  // Migración 047 — el dueño levantó la sanción manualmente,
  // o el nightly_state_reset la limpió al final del día.
  | 'sanction_cleared'
  // Migración 049 — el dueño devolvió un break al barbero
  // (decremento manual de breaks_taken_today). Usado cuando el
  // barbero tocó BREAK sin querer en su PWA.
  | 'break_restored_by_owner'

type Event = {
  id: string
  barber_id: string | null
  action: Action
  from_status: string | null
  to_status: string | null
  metadata: Record<string, unknown>
  created_at: string
}

type Barber = {
  id: string
  name: string
  avatar: string | null
}

type Shop = { id: string; name: string }

// Signature of the t() function from useLocale — passed into the
// module-level display helpers (describe/formatMetadata/formatVal)
// so they can resolve i18n keys without importing the hook.
type TFn = (key: string, vars?: Record<string, string | number>) => string

const RANGE_OPTIONS = [
  { value: '24h', labelKey: 'activity.range.24h' },
  { value: 'today', labelKey: 'activity.range.today' },
  { value: '7d', labelKey: 'activity.range.7d' },
  { value: '30d', labelKey: 'activity.range.30d' },
  { value: '90d', labelKey: 'activity.range.90d' },
] as const
type Range = (typeof RANGE_OPTIONS)[number]['value']

const ACTION_OPTIONS: { value: Action | 'all'; labelKey: string }[] = [
  { value: 'all', labelKey: 'activity.action.all' },
  { value: 'state_change', labelKey: 'activity.action.state_change' },
  { value: 'client_assigned', labelKey: 'activity.action.client_assigned' },
  { value: 'position_kept', labelKey: 'activity.action.position_kept' },
  { value: 'position_lost', labelKey: 'activity.action.position_lost' },
  { value: 'no_show', labelKey: 'activity.action.no_show' },
  { value: 'no_show_no_takers', labelKey: 'activity.action.no_show_no_takers' },
  { value: 'idle_timeout_offline', labelKey: 'activity.action.idle_timeout_offline' },
  { value: 'shop_settings_changed', labelKey: 'activity.action.shop_settings_changed' },
  { value: 'toll_cleared_by_owner', labelKey: 'activity.action.toll_cleared_by_owner' },
  { value: 'fifo_moved_by_owner', labelKey: 'activity.action.fifo_moved_by_owner' },
  { value: 'sanction_applied', labelKey: 'activity.action.sanction_applied' },
  { value: 'sanction_cleared', labelKey: 'activity.action.sanction_cleared' },
  { value: 'break_restored_by_owner', labelKey: 'activity.action.break_restored_by_owner' },
]

// Maps DB status → i18n key. Values are resolved with t() at the call
// site (reuses the shared status.* labels).
const STATUS_LABEL: Record<string, string> = {
  available: 'status.available',
  busy: 'status.busy',
  break: 'status.break',
  offline: 'status.offline',
}

export default function ActivityFeed({
  shop,
  barbers: initialBarbers,
  initialEvents,
}: {
  shop: Shop
  barbers: Barber[]
  initialEvents: Event[]
}) {
  const { t } = useLocale()
  const [events, setEvents] = useState<Event[]>(initialEvents)
  // Default to '24h' (rolling) instead of 'today' (since 0:00 local).
  // Barbershops often work past midnight; "today" can end up empty even
  // when the owner just did things 20 minutes ago across the date line.
  const [range, setRange] = useState<Range>('24h')
  const [barberFilter, setBarberFilter] = useState<string>('all')
  const [actionFilter, setActionFilter] = useState<Action | 'all'>('all')
  const [loading, setLoading] = useState(false)

  const barbers = useMemo(
    () =>
      initialBarbers.map(b => ({
        ...b,
        avatar: isRenderableAvatar(b.avatar) ? b.avatar : null,
      })),
    [initialBarbers],
  )
  const barberMap = useMemo(() => {
    const m = new Map<string, Barber>()
    for (const b of barbers) m.set(b.id, b)
    return m
  }, [barbers])

  // Refetch when range changes — filters happen server-side for date,
  // client-side for barber/action so the user can flip them instantly.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const since = computeSince(range)
    setLoading(true)
    supabase
      .from('activity_log')
      .select(
        'id, barber_id, action, from_status, to_status, metadata, created_at',
      )
      .eq('shop_id', shop.id)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(500)
      .then(({ data }) => {
        if (cancelled) return
        if (data) setEvents(data as Event[])
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [range, shop.id])

  // Realtime: prepend new events as they happen.
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`activity-${shop.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'activity_log',
          filter: `shop_id=eq.${shop.id}`,
        },
        payload => {
          const row = payload.new as Event
          setEvents(curr => [row, ...curr].slice(0, 500))
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [shop.id])

  const filtered = events.filter(e => {
    if (barberFilter !== 'all' && e.barber_id !== barberFilter) return false
    if (actionFilter !== 'all' && e.action !== actionFilter) return false
    return true
  })

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-4xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">{t('dash.heading.activity')}</h1>
      <p className="text-nxtup-muted text-sm mb-8">
        {t('activity.subtitle')}
      </p>

      <div className="flex flex-wrap gap-3 mb-6">
        <FilterChip>
          <select
            value={range}
            onChange={e => setRange(e.target.value as Range)}
            className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
          >
            {RANGE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-nxtup-bg">
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip>
          <select
            value={barberFilter}
            onChange={e => setBarberFilter(e.target.value)}
            className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-nxtup-bg">
              {t('activity.filter.allBarbers')}
            </option>
            {barbers.map(b => (
              <option key={b.id} value={b.id} className="bg-nxtup-bg">
                {b.name}
              </option>
            ))}
          </select>
        </FilterChip>

        <FilterChip>
          <select
            value={actionFilter}
            onChange={e => setActionFilter(e.target.value as Action | 'all')}
            className="bg-transparent text-white text-sm focus:outline-none cursor-pointer"
          >
            {ACTION_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-nxtup-bg">
                {t(o.labelKey)}
              </option>
            ))}
          </select>
        </FilterChip>

        <span className="ml-auto text-nxtup-dim text-xs self-center tabular-nums">
          {loading ? '...' : t('activity.eventsCount', { count: filtered.length })}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-nxtup-line rounded-2xl py-16 text-center">
          <p className="text-nxtup-muted text-sm">
            {events.length === 0
              ? t('activity.empty.noneInRange')
              : t('activity.empty.noMatch')}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered.map(ev => (
            <ActivityRow
              key={ev.id}
              event={ev}
              barber={ev.barber_id ? barberMap.get(ev.barber_id) : undefined}
              t={t}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

function ActivityRow({ event, barber, t }: { event: Event; barber?: Barber; t: TFn }) {
  const time = formatTime(event.created_at)
  const description = describe(event, t)
  const accent = ACTION_ACCENT[event.action] ?? 'text-nxtup-muted'

  return (
    <li className="flex items-start gap-4 px-3 py-3 rounded-lg hover:bg-nxtup-line transition-colors">
      <span className="text-nxtup-dim text-xs tabular-nums w-16 mt-1 flex-shrink-0">
        {time}
      </span>
      {barber ? (
        <Avatar avatar={barber.avatar} name={barber.name} size={28} />
      ) : (
        <span className="w-7 h-7 rounded-full bg-nxtup-line flex items-center justify-center text-nxtup-dim text-xs flex-shrink-0">
          ⚙
        </span>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm">
          {barber ? <span className="font-medium">{barber.name}</span> : <span className="text-nxtup-muted">{t('activity.actor.system')}</span>}{' '}
          <span className={accent}>{description}</span>
        </p>
        {event.metadata && hasUserVisibleMeta(event) && (
          <p className="text-nxtup-dim text-xs mt-0.5">
            {formatMetadata(event, t)}
          </p>
        )}
      </div>
    </li>
  )
}

function FilterChip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center bg-nxtup-line border border-nxtup-dim rounded-md px-3 py-1.5 hover:border-white/30 transition-colors">
      {children}
    </div>
  )
}

const ACTION_ACCENT: Record<Action, string> = {
  state_change: 'text-nxtup-muted',
  client_assigned: 'text-nxtup-active',
  position_kept: 'text-nxtup-active',
  position_lost: 'text-nxtup-busy',
  shop_settings_changed: 'text-nxtup-break',
  no_show: 'text-nxtup-busy',
  no_show_no_takers: 'text-nxtup-busy',
  idle_timeout_offline: 'text-nxtup-dim',
  toll_cleared_by_owner: 'text-orange-400',
  fifo_moved_by_owner: 'text-nxtup-active',
  sanction_applied: 'text-orange-400',
  sanction_cleared: 'text-nxtup-active',
  // Break devuelto: ámbar (mismo color que el badge de break/descanso
  // en el resto de la UI) — coincide visualmente con el contexto del
  // recurso que se está restaurando.
  break_restored_by_owner: 'text-nxtup-break',
}

function describe(event: Event, t: TFn): string {
  switch (event.action) {
    case 'state_change': {
      const from = event.from_status
        ? STATUS_LABEL[event.from_status] ? t(STATUS_LABEL[event.from_status]) : event.from_status
        : '—'
      const to = event.to_status
        ? STATUS_LABEL[event.to_status] ? t(STATUS_LABEL[event.to_status]) : event.to_status
        : '—'
      return t('activity.desc.stateChange', { from, to })
    }
    case 'client_assigned': {
      const name = (event.metadata as { client_name?: string })?.client_name
      return name
        ? t('activity.desc.clientAssigned', { name })
        : t('activity.desc.clientAssignedGeneric')
    }
    case 'position_kept': {
      return t('activity.desc.positionKept')
    }
    case 'position_lost': {
      return t('activity.desc.positionLost')
    }
    case 'shop_settings_changed': {
      return t('activity.desc.settingsChanged')
    }
    case 'no_show': {
      // Cascada de 2 min (migraciones 035 + 041) — el barbero no
      // respondió al cliente llamado, el sistema lo mandó a un
      // break corto de 15 min (con su posición FIFO retenida) y
      // pasó el cliente al siguiente disponible. Si vuelve dentro
      // de los 15 min, recupera su turno; si no, el cron del 028
      // lo manda a offline definitivo.
      const name = (event.metadata as { client_name?: string })?.client_name
      const sentTo = (event.metadata as { sent_to?: string })?.sent_to
      const target =
        sentTo === 'break_15min' ? 'break 15 min' : 'offline'
      return name
        ? t('activity.desc.noShow', { name, target })
        : t('activity.desc.noShowGeneric', { target })
    }
    case 'no_show_no_takers': {
      // Cascada disparó pero no había barbero disponible para
      // tomar el cliente → vuelve a la cola.
      const name = (event.metadata as { client_name?: string })?.client_name
      return name
        ? t('activity.desc.noTakers', { name })
        : t('activity.desc.noTakersGeneric')
    }
    case 'idle_timeout_offline': {
      // Tres sub-razones en metadata.reason. Distinguimos por la
      // experiencia del barbero — el break_expired es el más común
      // y el que más le interesa al dueño ver.
      const reason = (event.metadata as { reason?: string })?.reason
      if (reason === 'break_expired') {
        return t('activity.desc.autoOffline.breakExpired')
      }
      if (reason === 'busy_too_long') {
        return t('activity.desc.autoOffline.busyTooLong')
      }
      // available_no_action
      return t('activity.desc.autoOffline.idle')
    }
    case 'toll_cleared_by_owner': {
      // El dueño quitó la penalidad del barbero desde el Centro
      // de Mando. Mostramos el detalle para que se vea que es una
      // acción del dueño y no un fallo automático del peaje.
      const wasLate = (event.metadata as { was_late?: boolean })?.was_late
      return wasLate
        ? t('activity.desc.tollCleared')
        : t('activity.desc.tollClearedLegacy')
    }
    case 'fifo_moved_by_owner': {
      const direction = (event.metadata as { direction?: string })?.direction
      return direction === 'up'
        ? t('activity.desc.fifoUp')
        : t('activity.desc.fifoDown')
    }
    case 'sanction_applied': {
      // Migración 047 — el sistema detectó llegada tarde y aplicó
      // sanción de N horas automáticamente. Metadata viene de apply_sanction:
      // { hours, expires_at, applied_by, reason }.
      const meta = event.metadata as {
        hours?: number
        expires_at?: string
      }
      const expiresTime = meta.expires_at
        ? new Date(meta.expires_at).toLocaleTimeString(undefined, {
            hour: 'numeric',
            minute: '2-digit',
          })
        : null
      if (meta.hours && expiresTime) {
        return t('activity.desc.sanctioned', { hours: meta.hours, time: expiresTime })
      }
      if (meta.hours) {
        return t('activity.desc.sanctionedNoTime', { hours: meta.hours })
      }
      return t('activity.desc.sanctionedGeneric')
    }
    case 'sanction_cleared': {
      // Migración 047 — sanción levantada. Metadata viene de clear_sanction:
      // { cleared_by, cleared_at }. cleared_by puede ser:
      //   * uuid del dueño que lo levantó manualmente
      //   * null si fue el nightly_state_reset (limpieza al final del día)
      const meta = event.metadata as { cleared_by?: string | null }
      if (meta.cleared_by) {
        return t('activity.desc.sanctionCleared')
      }
      return t('activity.desc.sanctionClearedNightly')
    }
    case 'break_restored_by_owner': {
      // Migración 049 — el dueño devolvió un break al barbero. Metadata
      // del endpoint /break/restore: { previous_count, new_count,
      // restored_by, was_on_break }. Si was_on_break=true, además del
      // decrement deshicimos el break completo (lo regresamos a Available
      // con su posición FIFO original). Si false, solo bajamos el contador.
      const meta = event.metadata as {
        previous_count?: number
        new_count?: number
        was_on_break?: boolean
      }
      const counter =
        meta.previous_count != null && meta.new_count != null
          ? ` (${meta.previous_count} → ${meta.new_count})`
          : ''
      if (meta.was_on_break) {
        return t('activity.desc.breakUndone', { counter })
      }
      return t('activity.desc.breakReturned', { counter })
    }
  }
}

function hasUserVisibleMeta(event: Event): boolean {
  switch (event.action) {
    case 'state_change':
      return Boolean(
        (event.metadata as { break_minutes?: number })?.break_minutes,
      )
    case 'client_assigned':
      return Boolean((event.metadata as { queue_position?: number })?.queue_position)
    case 'position_kept':
    case 'position_lost':
      return true
    case 'shop_settings_changed':
      return Boolean(
        (event.metadata as { changes?: Record<string, unknown> })?.changes,
      )
    case 'idle_timeout_offline':
      return Boolean(
        (event.metadata as { minutes_over?: number; minutes_idle?: number })?.minutes_over ??
          (event.metadata as { minutes_idle?: number })?.minutes_idle,
      )
    case 'no_show':
      return Boolean(
        (event.metadata as { seconds_elapsed?: number })?.seconds_elapsed,
      )
    default:
      return false
  }
}

function formatMetadata(event: Event, t: TFn): string {
  switch (event.action) {
    case 'state_change': {
      const m = event.metadata as { break_number?: number; break_minutes?: number }
      if (m.break_minutes) {
        const num = m.break_number ?? 0
        const ord =
          num === 1
            ? t('activity.meta.ordinal.first')
            : num === 2
              ? t('activity.meta.ordinal.second')
              : t('activity.meta.ordinal.nth', { n: num })
        return t('activity.meta.breakDuration', { ordinal: ord, min: m.break_minutes })
      }
      return ''
    }
    case 'client_assigned': {
      const m = event.metadata as { queue_position?: number }
      return m.queue_position ? t('activity.meta.queuePos', { n: m.queue_position }) : ''
    }
    case 'position_kept':
    case 'position_lost': {
      const m = event.metadata as {
        elapsed_minutes?: number
        allowed_minutes?: number
      }
      if (m.elapsed_minutes != null && m.allowed_minutes != null) {
        return t('activity.meta.breakElapsed', {
          elapsed: m.elapsed_minutes,
          allowed: m.allowed_minutes,
        })
      }
      return ''
    }
    case 'shop_settings_changed': {
      const m = event.metadata as {
        changes?: Record<string, { from: unknown; to: unknown }>
      }
      if (!m.changes) return ''
      return Object.entries(m.changes)
        .map(([k, v]) =>
          t('activity.meta.settingChange', {
            key: k,
            from: formatVal(v.from, t),
            to: formatVal(v.to, t),
          }),
        )
        .join(' · ')
    }
    case 'idle_timeout_offline': {
      const m = event.metadata as {
        minutes_over?: number
        minutes_idle?: number
        hours_idle?: number
        total_allowed_minutes?: number
      }
      if (m.minutes_over != null && m.total_allowed_minutes != null) {
        return t('activity.meta.minutesOver', {
          over: m.minutes_over,
          total: m.total_allowed_minutes,
        })
      }
      if (m.minutes_idle != null) {
        return t('activity.meta.idleMin', { min: m.minutes_idle })
      }
      if (m.hours_idle != null) {
        return t('activity.meta.idleHours', { hours: m.hours_idle })
      }
      return ''
    }
    case 'no_show': {
      const m = event.metadata as {
        client_name?: string
        seconds_elapsed?: number
      }
      if (m.seconds_elapsed != null) {
        return t('activity.meta.secondsNoTap', { seconds: Math.round(m.seconds_elapsed) })
      }
      return ''
    }
    default:
      return ''
  }
}

function formatVal(v: unknown, t: TFn): string {
  if (typeof v === 'boolean') return v ? t('activity.meta.on') : t('activity.meta.off')
  if (v == null) return '—'
  return String(v)
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function computeSince(range: Range): string {
  const d = new Date()
  if (range === '24h') {
    d.setHours(d.getHours() - 24)
  } else if (range === 'today') {
    // Local midnight today — strict calendar-day filter.
    d.setHours(0, 0, 0, 0)
  } else {
    const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
    d.setDate(d.getDate() - days)
  }
  return d.toISOString()
}
