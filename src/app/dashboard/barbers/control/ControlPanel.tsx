'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Avatar,
  isRenderableAvatar,
} from '@/components/avatars'
import { buildBarberOrder } from '@/lib/queue-order'

// ============================================================
// Centro de mando — owner-side control panel.
//
// One card per barber. Each card shows:
//   • Avatar + name
//   • Current status (with color) and context (client name, FIFO
//     position, break timer)
//   • Four action buttons (ACTIVE / BUSY / BREAK / OFFLINE) that
//     call the regular state endpoint as the authenticated owner.
//
// Realtime — peer dashboards, kiosks, NXT TAP devices, etc. all
// reflect the change within milliseconds via the same Supabase
// channel they were already subscribed to.
// ============================================================

type Status = 'available' | 'busy' | 'break' | 'offline'

type Barber = {
  id: string
  name: string
  status: Status
  avatar: string | null
  available_since: string | null
  break_started_at: string | null
  break_held_since: string | null
  break_minutes_at_start: number | null
  breaks_taken_today: number | null
  break_invalidated?: boolean | null
  // Migration 019 — barber paying late-arrival toll. >0 means
  // they're in the queue but not eligible for auto-assigned clients.
  late_toll_remaining?: number | null
}

type Entry = {
  id: string
  barber_id: string | null
  client_name: string
  status: 'called' | 'in_progress'
  position: number
}

type Shop = {
  id: string
  name: string
  first_break_minutes: number
  next_break_minutes: number
  break_position_grace_minutes: number
  break_mode: 'guaranteed' | 'not_guaranteed'
}

const STATUS_LABEL: Record<Status, string> = {
  available: 'Active',
  busy: 'Busy',
  break: 'Break',
  offline: 'Offline',
}

const STATUS_COLOR: Record<Status, string> = {
  available: 'text-nxtup-active',
  busy: 'text-nxtup-busy',
  break: 'text-nxtup-break',
  offline: 'text-nxtup-dim',
}

const STATUS_DOT: Record<Status, string> = {
  available: 'bg-nxtup-active',
  busy: 'bg-nxtup-busy',
  break: 'bg-nxtup-break',
  offline: 'bg-nxtup-dim',
}

function normalizeBarbers(rows: unknown[]): Barber[] {
  return rows.map(r => {
    const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
    return {
      ...row,
      avatar: isRenderableAvatar(row.avatar) ? row.avatar : null,
    }
  })
}

export default function ControlPanel({
  shop,
  initialBarbers,
  initialEntries,
}: {
  shop: Shop
  initialBarbers: Barber[]
  initialEntries: Entry[]
}) {
  const [barbers, setBarbers] = useState<Barber[]>(() =>
    normalizeBarbers(initialBarbers),
  )
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  // Per-barber pending status — disables the row while a state change
  // is in flight to prevent double-tapping the same button twice.
  const [pendingBy, setPendingBy] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string>('')

  // ── Realtime: keep barbers + entries in sync ─────────────────
  useEffect(() => {
    const supabase = createClient()

    const fetchBarbers = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated, late_toll_remaining',
        )
        .eq('shop_id', shop.id)
        .order('name')
      if (data) setBarbers(normalizeBarbers(data as unknown[]))
    }

    const fetchEntries = async () => {
      const { data } = await supabase
        .from('queue_entries')
        .select('id, barber_id, client_name, status, position')
        .eq('shop_id', shop.id)
        .in('status', ['called', 'in_progress'])
      if (data) setEntries(data as Entry[])
    }

    const channel = supabase
      .channel(`control-panel-${shop.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'barbers',
          filter: `shop_id=eq.${shop.id}`,
        },
        () => fetchBarbers(),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `shop_id=eq.${shop.id}`,
        },
        () => fetchEntries(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [shop.id])

  // FIFO ranking so each Active row can show "#N en fila" next to
  // the status label. Helps the dueño see who's truly first.
  const fifoOrder = buildBarberOrder(barbers)

  // ── Action: change barber state ─────────────────────────────
  async function changeState(barberId: string, target: Status) {
    if (pendingBy[barberId]) return
    setPendingBy(p => ({ ...p, [barberId]: true }))
    setError('')
    try {
      const res = await fetch(`/api/barbers/${barberId}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'No se pudo cambiar el estado')
      }
      // Realtime subscription will reflect the change; no manual
      // setBarbers needed here.
    } catch {
      setError('Error de red')
    } finally {
      setPendingBy(p => ({ ...p, [barberId]: false }))
    }
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      <Link
        href="/dashboard/barbers"
        className="text-nxtup-muted hover:text-white text-xs uppercase tracking-[0.2em] inline-flex items-center gap-1 mb-4 transition-colors"
      >
        ← Barbers
      </Link>
      <h1 className="text-3xl font-black tracking-tight mb-2">Centro de mando</h1>
      <p className="text-nxtup-muted text-sm mb-8 max-w-prose">
        Cambia el estado de cualquier barbero remotamente. Útil si alguien se fue
        sin tocar BREAK, o si necesitas reorganizar la fila desde fuera del shop.
      </p>

      {error && (
        <div className="bg-nxtup-busy/15 border border-nxtup-busy rounded-lg px-4 py-3 mb-6 text-sm text-white">
          {error}
        </div>
      )}

      {barbers.length === 0 ? (
        <div className="border border-dashed border-nxtup-dim rounded-2xl py-16 text-center">
          <p className="text-nxtup-muted text-sm">
            Sin barberos en este shop.
          </p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {barbers.map(barber => (
            <BarberControlRow
              key={barber.id}
              barber={barber}
              shop={shop}
              fifoPosition={fifoOrder.get(barber.id)}
              entry={entries.find(e => e.barber_id === barber.id) ?? null}
              pending={pendingBy[barber.id] ?? false}
              onChange={s => changeState(barber.id, s)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

// ──────────────────────────────────────────────────────────────
// BarberControlRow — one card per barber. Contains the context
// strip (avatar + name + current status + meta) and the action
// row (4 status buttons).
// ──────────────────────────────────────────────────────────────

function BarberControlRow({
  barber,
  shop,
  fifoPosition,
  entry,
  pending,
  onChange,
}: {
  barber: Barber
  shop: Shop
  fifoPosition: number | undefined
  entry: Entry | null
  pending: boolean
  onChange: (next: Status) => void
}) {
  // Late-arrival toll (migración 019): si > 0, este barbero está
  // pagando peaje — ring naranja en la fila para que el dueño lo
  // detecte de un vistazo desde el Centro de Mando.
  const lateToll = barber.late_toll_remaining ?? 0
  const isLate = lateToll > 0

  return (
    <li
      className={`rounded-xl bg-nxtup-line p-4 flex flex-col gap-4 ${
        isLate ? 'border-2 border-orange-500/60' : 'border border-nxtup-line'
      }`}
    >
      {/* Top strip — identity + status */}
      <div className="flex items-center gap-3">
        <Avatar avatar={barber.avatar} name={barber.name} size={44} />
        <div className="flex-1 min-w-0">
          <p className="text-white text-base font-bold tracking-tight truncate">
            {barber.name}
          </p>
          <StatusLine
            barber={barber}
            shop={shop}
            fifoPosition={fifoPosition}
            entry={entry}
          />
          {isLate && (
            <p className="text-orange-400 text-[11px] font-semibold mt-0.5">
              ⏳ Esperando turno · {lateToll} por pasar
            </p>
          )}
        </div>
        <span
          className={`w-3 h-3 rounded-full flex-shrink-0 ${
            isLate ? 'bg-orange-500' : STATUS_DOT[barber.status]
          }`}
          aria-hidden
        />
      </div>

      {/* Action buttons — 2x2 on narrow screens, single row on wide */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <ActionButton
          label="Active"
          tone="active"
          current={barber.status === 'available'}
          disabled={pending}
          onClick={() => onChange('available')}
        />
        <ActionButton
          label="Busy"
          tone="busy"
          current={barber.status === 'busy'}
          disabled={pending}
          onClick={() => onChange('busy')}
        />
        <ActionButton
          label="Break"
          tone="break"
          current={barber.status === 'break'}
          disabled={pending}
          onClick={() => onChange('break')}
        />
        <ActionButton
          label="Offline"
          tone="offline"
          current={barber.status === 'offline'}
          disabled={pending}
          onClick={() => onChange('offline')}
        />
      </div>
    </li>
  )
}

function StatusLine({
  barber,
  shop,
  fifoPosition,
  entry,
}: {
  barber: Barber
  shop: Shop
  fifoPosition: number | undefined
  entry: Entry | null
}) {
  const color = STATUS_COLOR[barber.status]
  const label = STATUS_LABEL[barber.status]

  if (barber.status === 'available') {
    return (
      <p className={`text-xs ${color}`}>
        {label}
        {fifoPosition !== undefined ? ` · #${fifoPosition} en fila` : ' · sin posición'}
      </p>
    )
  }
  if (barber.status === 'busy' && entry) {
    return (
      <p className={`text-xs ${color}`}>
        {label} · con {entry.client_name}
      </p>
    )
  }
  if (barber.status === 'break') {
    return <BreakLine barber={barber} shop={shop} />
  }
  return <p className={`text-xs ${color}`}>{label}</p>
}

function BreakLine({ barber, shop }: { barber: Barber; shop: Shop }) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  if (!barber.break_started_at) {
    return <p className="text-xs text-nxtup-break">Break</p>
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

  const forfeited =
    shop.break_mode === 'not_guaranteed' && barber.break_invalidated === true

  return (
    <p className="text-xs text-nxtup-break tabular-nums">
      Break · {formatted}
      {forfeited && <span className="text-nxtup-busy ml-2 font-bold">turno perdido</span>}
    </p>
  )
}

function ActionButton({
  label,
  tone,
  current,
  disabled,
  onClick,
}: {
  label: string
  tone: 'active' | 'busy' | 'break' | 'offline'
  current: boolean
  disabled: boolean
  onClick: () => void
}) {
  // Each tone has a coloured ring/fill when currently set, neutral
  // outline otherwise. Disabled greys everything out.
  const palette = {
    active: { border: 'border-emerald-500', text: 'text-emerald-300', bg: 'bg-emerald-500' },
    busy: { border: 'border-rose-500', text: 'text-rose-300', bg: 'bg-rose-500' },
    break: { border: 'border-amber-500', text: 'text-amber-300', bg: 'bg-amber-500' },
    offline: { border: 'border-nxtup-dim', text: 'text-nxtup-muted', bg: 'bg-nxtup-dim' },
  }[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        rounded-md py-2.5 text-xs font-black tracking-widest uppercase
        transition-all active:scale-[0.97]
        ${current
          ? `${palette.bg} text-black border-2 ${palette.border}`
          : `bg-transparent border-2 ${palette.border} ${palette.text} hover:bg-nxtup-bg`
        }
        disabled:opacity-40 disabled:cursor-not-allowed
      `}
    >
      {label}
    </button>
  )
}
