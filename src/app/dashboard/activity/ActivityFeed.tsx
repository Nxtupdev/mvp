'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Avatar, isAvatarId, type AvatarId } from '@/components/avatars'

type Action =
  | 'state_change'
  | 'client_assigned'
  | 'position_kept'
  | 'position_lost'
  | 'shop_settings_changed'

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
  avatar: AvatarId | null
}

type Shop = { id: string; name: string }

const RANGE_OPTIONS = [
  { value: '24h', label: 'Últimas 24h' },
  { value: 'today', label: 'Hoy (desde 0:00)' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
  { value: '90d', label: '90 días' },
] as const
type Range = (typeof RANGE_OPTIONS)[number]['value']

const ACTION_OPTIONS: { value: Action | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'state_change', label: 'Cambios de estado' },
  { value: 'client_assigned', label: 'Cliente asignado' },
  { value: 'position_kept', label: 'Posición mantenida' },
  { value: 'position_lost', label: 'Posición perdida' },
  { value: 'shop_settings_changed', label: 'Cambios de config' },
]

const STATUS_LABEL: Record<string, string> = {
  available: 'Activo',
  busy: 'Ocupado',
  break: 'Break',
  offline: 'Off',
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
        avatar: isAvatarId(b.avatar) ? b.avatar : null,
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
      <h1 className="text-3xl font-black tracking-tight mb-2">Activity</h1>
      <p className="text-nxtup-muted text-sm mb-8">
        Registro de cada acción tomada por los barberos. Para resolver disputas y
        mantener constancia. Mostrando últimos 90 días.
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
                {o.label}
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
              Todos los barberos
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
                {o.label}
              </option>
            ))}
          </select>
        </FilterChip>

        <span className="ml-auto text-nxtup-dim text-xs self-center tabular-nums">
          {loading ? '...' : `${filtered.length} eventos`}
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-nxtup-line rounded-2xl py-16 text-center">
          <p className="text-nxtup-muted text-sm">
            {events.length === 0
              ? 'Sin actividad registrada en este rango'
              : 'No hay eventos que coincidan con los filtros'}
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-1">
          {filtered.map(ev => (
            <ActivityRow
              key={ev.id}
              event={ev}
              barber={ev.barber_id ? barberMap.get(ev.barber_id) : undefined}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

function ActivityRow({ event, barber }: { event: Event; barber?: Barber }) {
  const time = formatTime(event.created_at)
  const description = describe(event)
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
          {barber ? <span className="font-medium">{barber.name}</span> : <span className="text-nxtup-muted">Sistema</span>}{' '}
          <span className={accent}>{description}</span>
        </p>
        {event.metadata && hasUserVisibleMeta(event) && (
          <p className="text-nxtup-dim text-xs mt-0.5">
            {formatMetadata(event)}
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
}

function describe(event: Event): string {
  switch (event.action) {
    case 'state_change': {
      const from = event.from_status ? STATUS_LABEL[event.from_status] ?? event.from_status : '—'
      const to = event.to_status ? STATUS_LABEL[event.to_status] ?? event.to_status : '—'
      return `pasó de ${from} a ${to}`
    }
    case 'client_assigned': {
      const name = (event.metadata as { client_name?: string })?.client_name
      return name ? `recibió a ${name}` : 'recibió un cliente'
    }
    case 'position_kept': {
      return 'mantuvo su posición al volver del break'
    }
    case 'position_lost': {
      return 'perdió su posición — excedió el break + gracia'
    }
    case 'shop_settings_changed': {
      return 'cambió la configuración del shop'
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
    default:
      return false
  }
}

function formatMetadata(event: Event): string {
  switch (event.action) {
    case 'state_change': {
      const m = event.metadata as { break_number?: number; break_minutes?: number }
      if (m.break_minutes) {
        const num = m.break_number ?? 0
        const ord = num === 1 ? 'primer' : num === 2 ? 'segundo' : `#${num}`
        return `${ord} break — ${m.break_minutes} min`
      }
      return ''
    }
    case 'client_assigned': {
      const m = event.metadata as { queue_position?: number }
      return m.queue_position ? `Cola #${m.queue_position}` : ''
    }
    case 'position_kept':
    case 'position_lost': {
      const m = event.metadata as {
        elapsed_minutes?: number
        allowed_minutes?: number
      }
      if (m.elapsed_minutes != null && m.allowed_minutes != null) {
        return `${m.elapsed_minutes} min en break · permitido ${m.allowed_minutes} min`
      }
      return ''
    }
    case 'shop_settings_changed': {
      const m = event.metadata as {
        changes?: Record<string, { from: unknown; to: unknown }>
      }
      if (!m.changes) return ''
      return Object.entries(m.changes)
        .map(([k, v]) => `${k}: ${formatVal(v.from)} → ${formatVal(v.to)}`)
        .join(' · ')
    }
    default:
      return ''
  }
}

function formatVal(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'on' : 'off'
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
