'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ShopLogo from '@/components/ShopLogo'
import { Avatar, isAvatarId, type AvatarId } from '@/components/avatars'
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
  initialCutsToday,
}: {
  shopId: string
  shop: Shop
  initialBarber: Barber
  initialPeers: Peer[]
  initialCalledClient: DeviceClient
  initialCurrentClient: DeviceClient
  initialCutsToday: number
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
  const [cutsToday, setCutsToday] = useState(initialCutsToday)
  const [pending, setPending] = useState<ActionTone | null>(null)
  const [error, setError] = useState('')

  // ── Live updates ────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient()
    const sinceMidnight = new Date()
    sinceMidnight.setHours(0, 0, 0, 0)
    const sinceIso = sinceMidnight.toISOString()

    const fetchBarber = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
        )
        .eq('id', barber.id)
        .single()
      if (data) {
        const row = data as { avatar?: unknown } & Omit<Barber, 'avatar'>
        setBarber({ ...row, avatar: isAvatarId(row.avatar) ? row.avatar : null })
      }
    }

    const fetchPeers = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
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

    const fetchCuts = async () => {
      const { count } = await supabase
        .from('queue_entries')
        .select('*', { count: 'exact', head: true })
        .eq('barber_id', barber.id)
        .eq('status', 'done')
        .gte('completed_at', sinceIso)
      setCutsToday(count ?? 0)
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
          fetchCuts()
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

  const otherPeers = peers.filter(p => p.id !== barber.id)

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

  // ── Render ──────────────────────────────────────────────────────
  return (
    <main className="min-h-[100dvh] flex flex-col px-5 pt-8 pb-10 max-w-md mx-auto w-full">
      {/* Top — shop name */}
      <header className="flex items-center gap-3 mb-6">
        {shop.logo_url && <ShopLogo url={shop.logo_url} name={shop.name} size={32} />}
        <span className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold">
          {shop.name}
        </span>
      </header>

      {/* Hero — who am I, what state */}
      <section className="flex items-center gap-4 mb-6">
        <Avatar avatar={barber.avatar} name={barber.name} size={64} />
        <div className="flex-1 min-w-0">
          <h1 className="text-3xl font-black tracking-tight truncate">
            {barber.name}
          </h1>
          <StatusLine
            barber={barber}
            shop={shop}
            fifoPosition={fifoPosition}
            heldPosition={heldPosition}
            calledClient={calledClient}
            currentClient={currentClient}
          />
        </div>
      </section>

      {/* Action buttons */}
      <section className="grid grid-cols-3 gap-2 mb-6">
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
        <p className="text-nxtup-busy text-sm mb-4 text-center" role="alert">
          {error}
        </p>
      )}

      {/* Today's stats */}
      <section className="grid grid-cols-2 gap-3 mb-6">
        <Stat label="Cortes hoy" value={cutsToday.toString()} />
        <Stat
          label="Breaks hoy"
          value={(barber.breaks_taken_today ?? 0).toString()}
        />
      </section>

      {/* Other barbers */}
      <section className="mb-6">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
          Otros barberos
        </p>
        {otherPeers.length === 0 ? (
          <p className="text-nxtup-dim text-sm">Sos el único activo hoy</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {otherPeers.map(p => (
              <PeerRow
                key={p.id}
                peer={p}
                fifoPosition={buildBarberOrder(peers).get(p.id)}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Kiosk link footer */}
      <footer className="mt-auto pt-6 flex flex-col items-center gap-1">
        <Link
          href={`/barber/${shopId}/${barber.id}/kiosk`}
          className="text-nxtup-dim text-xs underline underline-offset-4 hover:text-nxtup-muted"
        >
          Abrir modo pantalla completa →
        </Link>
        <p className="text-nxtup-dim text-[10px] text-center max-w-[280px] leading-relaxed">
          Para tablet en tu estación. Mismos 3 botones, sin distracciones.
        </p>
      </footer>
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
    return <p className="text-nxtup-dim text-sm mt-1">Off · sin turno</p>
  }
  if (barber.status === 'busy' && currentClient) {
    return (
      <p className="text-nxtup-busy text-sm mt-1 font-medium">
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
      <p className="text-nxtup-active text-sm mt-1 font-medium">
        → Llamado: {calledClient.client_name}
      </p>
    )
  }
  if (barber.status === 'available' && fifoPosition !== undefined) {
    return (
      <p className="text-nxtup-active text-sm mt-1 font-medium">
        En fila #{fifoPosition}
        {fifoPosition === 1 ? ' · Eres el siguiente' : ''}
      </p>
    )
  }
  return <p className="text-nxtup-muted text-sm mt-1">Active</p>
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
    return <p className="text-nxtup-break text-sm mt-1 font-medium">Break</p>
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

  const willHold =
    shop.keep_position_on_break && heldPosition !== undefined && remaining > -shop.break_position_grace_minutes * 60

  return (
    <p className="text-nxtup-break text-sm mt-1 font-medium tabular-nums">
      Break · {formatted}
      {willHold && (
        <span className="text-nxtup-active ml-2">Vuelve a #{heldPosition}</span>
      )}
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
        rounded-lg py-4 text-sm font-black tracking-widest
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-nxtup-line rounded-xl px-4 py-3">
      <p className="text-nxtup-muted text-[10px] uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className="text-3xl font-black tabular-nums">{value}</p>
    </div>
  )
}

const PEER_STATUS_TEXT: Record<Status, string> = {
  available: 'Libre',
  busy: 'Ocupado',
  break: 'Break',
  offline: 'Off',
}

const PEER_DOT: Record<Status, string> = {
  available: 'bg-nxtup-active',
  busy: 'bg-nxtup-busy',
  break: 'bg-nxtup-break',
  offline: 'bg-nxtup-dim',
}

function PeerRow({
  peer,
  fifoPosition,
}: {
  peer: Peer
  fifoPosition: number | undefined
}) {
  return (
    <li className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-nxtup-line">
      <span className="text-nxtup-active text-sm font-black tabular-nums w-7 text-center">
        {fifoPosition !== undefined ? `#${fifoPosition}` : '—'}
      </span>
      <Avatar avatar={peer.avatar} name={peer.name} size={28} />
      <span className="text-white text-sm font-medium flex-1 truncate">
        {peer.name}
      </span>
      <span className="flex items-center gap-2 text-nxtup-muted text-[10px] uppercase tracking-widest">
        <span className={`w-1.5 h-1.5 rounded-full ${PEER_DOT[peer.status]}`} />
        {PEER_STATUS_TEXT[peer.status]}
      </span>
    </li>
  )
}
