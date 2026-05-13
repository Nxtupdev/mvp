'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import ShopLogo from '@/components/ShopLogo'
import TapButton from '@/components/TapButton'
import { Avatar, isAvatarId, type AvatarId } from '@/components/avatars'
import { buildBarberOrder } from '@/lib/queue-order'

type Barber = {
  id: string
  name: string
  status: string
  avatar: AvatarId | null
  available_since: string | null
}
type Shop = {
  id: string
  name: string
  is_open: boolean
  max_queue_size: number
  logo_url: string | null
}
type Entry = {
  id: string
  position: number
  status: 'waiting' | 'called' | 'in_progress' | 'done' | 'cancelled'
  barber_id: string | null
  created_at: string
}

const STORAGE_KEY = 'nxtup_client'
const WAIT_PER_PERSON = 20

export default function CheckInForm({
  shop,
  barbers: initialBarbers,
  queueCount: initialQueueCount,
  waitingCount: initialWaitingCount,
}: {
  shop: Shop
  barbers: Barber[]
  queueCount: number
  waitingCount: number
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [stage, setStage] = useState<'form' | 'loading' | 'queued'>('form')
  const [entry, setEntry] = useState<Entry | null>(null)
  const [position, setPosition] = useState(0)
  const [assignedBarberId, setAssignedBarberId] = useState<string | null>(null)
  const [error, setError] = useState('')

  // Live state — subscribed via realtime so walk-in vs check-in mode flips
  // automatically if barbers change status while the page is open.
  const [barbers, setBarbers] = useState<Barber[]>(initialBarbers)
  const [queueCount, setQueueCount] = useState(initialQueueCount)
  const [waitingCount, setWaitingCount] = useState(initialWaitingCount)

  // Client can opt out of walk-in mode if they want a specific barber, want
  // to leave & come back, or just want a record.
  const [forceCheckIn, setForceCheckIn] = useState(false)

  const fifoOrder = useMemo(() => buildBarberOrder(barbers), [barbers])
  const fifoBarbers = useMemo(
    () =>
      [...barbers]
        .filter(b => fifoOrder.has(b.id))
        .sort((a, b) => fifoOrder.get(a.id)! - fifoOrder.get(b.id)!),
    [barbers, fifoOrder],
  )
  const availableInFifoCount = fifoBarbers.length

  // Mode rule:
  //   walk-in  ⇔  there is a barber sitting in the FIFO right now AND no
  //                waiting clients ahead. The new client can just sit and
  //                the next available barber picks them up.
  //   check-in ⇔  otherwise (someone is already waiting, or all barbers
  //                are busy/break/offline/already-called). Anti-manipulation
  //                primitive kicks in.
  const walkInMode =
    !forceCheckIn && availableInFifoCount > 0 && waitingCount === 0
  const allBusy = barbers.length > 0 && availableInFifoCount === 0

  // Restore previous name from prior visits.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as { name?: string }
        if (parsed.name) setName(parsed.name)
      }
    } catch {}
  }, [])

  // Realtime: keep barbers + queue counts fresh while the page is open.
  // This is what flips the walk-in / check-in mode reactively.
  useEffect(() => {
    if (stage === 'queued') return

    const supabase = createClient()

    const refresh = async () => {
      const [{ data: b }, { count: qc }, { count: wc }] = await Promise.all([
        supabase
          .from('barbers')
          .select('id, name, status, avatar, available_since')
          .eq('shop_id', shop.id)
          .neq('status', 'offline')
          .order('name'),
        supabase
          .from('queue_entries')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shop.id)
          .in('status', ['waiting', 'called', 'in_progress']),
        supabase
          .from('queue_entries')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shop.id)
          .eq('status', 'waiting'),
      ])
      if (b)
        setBarbers(
          (b as unknown[]).map(r => {
            const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
            return { ...row, avatar: isAvatarId(row.avatar) ? row.avatar : null }
          }),
        )
      setQueueCount(qc ?? 0)
      setWaitingCount(wc ?? 0)
    }

    const channel = supabase
      .channel(`q-${shop.id}-form`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barbers', filter: `shop_id=eq.${shop.id}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries', filter: `shop_id=eq.${shop.id}` },
        refresh,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [shop.id, stage])

  // Live position + status while queued (preserved from prior version).
  useEffect(() => {
    if (stage !== 'queued' || !entry) return

    const supabase = createClient()

    const refresh = async () => {
      const [{ count }, { data: live }] = await Promise.all([
        supabase
          .from('queue_entries')
          .select('*', { count: 'exact', head: true })
          .eq('shop_id', shop.id)
          .in('status', ['waiting', 'called', 'in_progress'])
          .lte('created_at', entry.created_at),
        supabase
          .from('queue_entries')
          .select('id, position, status, barber_id, created_at')
          .eq('id', entry.id)
          .maybeSingle(),
      ])
      setPosition(count ?? 1)
      if (live) {
        setEntry(live as Entry)
        setAssignedBarberId(live.barber_id)
      }
    }

    refresh()

    const channel = supabase
      .channel(`queue-${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries', filter: `shop_id=eq.${shop.id}` },
        refresh,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [stage, entry, shop.id])

  async function handleTap() {
    if (stage === 'loading') return
    const trimmed = name.trim()
    if (!trimmed) {
      inputRef.current?.focus()
      setError('Escribe tu nombre primero')
      return
    }

    setStage('loading')
    setError('')

    try {
      const res = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: shop.id,
          client_name: trimmed,
        }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error ?? 'Error al registrarte. Intenta de nuevo.')
        setStage('form')
        return
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: trimmed }))
      setEntry(data.entry)
      setPosition(data.entry.position)
      setAssignedBarberId(data.entry.barber_id ?? null)
      setStage('queued')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setStage('form')
    }
  }

  async function handleLeave() {
    if (!entry) return
    await fetch('/api/checkin/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entry_id: entry.id }),
    })
    setStage('form')
    setEntry(null)
    setAssignedBarberId(null)
  }

  // ── Closed state ────────────────────────────────────────────
  if (!shop.is_open) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <ShopLogo url={shop.logo_url} name={shop.name} size={96} className="mb-8" />
        <p className="text-nxtup-muted text-xs uppercase tracking-widest mb-2">Cerrado</p>
        <h1 className="text-3xl font-bold">{shop.name}</h1>
        <p className="text-nxtup-dim mt-4">No hay check-in disponible en este momento.</p>
      </div>
    )
  }

  // ── Full queue ──────────────────────────────────────────────
  if (queueCount >= shop.max_queue_size) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center">
        <ShopLogo url={shop.logo_url} name={shop.name} size={96} className="mb-8" />
        <p className="text-nxtup-muted text-xs uppercase tracking-widest mb-2">Sin cupos</p>
        <h1 className="text-3xl font-bold">{shop.name}</h1>
        <p className="text-nxtup-dim mt-4">La cola está llena por hoy.</p>
      </div>
    )
  }

  // ── Queued state ────────────────────────────────────────────
  if (stage === 'queued' && entry) {
    const wait = (position - 1) * WAIT_PER_PERSON
    const assignedBarber = assignedBarberId
      ? barbers.find(b => b.id === assignedBarberId)
      : null
    const isCalled = entry.status === 'called'

    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 text-center gap-5">
        <ShopLogo url={shop.logo_url} name={shop.name} size={64} className="mb-2" />
        <p className="text-nxtup-muted text-xs uppercase tracking-widest">{shop.name}</p>

        {isCalled && assignedBarber ? (
          <div className="flex flex-col items-center gap-3">
            <p className="text-nxtup-active text-xs uppercase tracking-[0.4em] font-bold">
              Te están esperando
            </p>
            <Avatar avatar={assignedBarber.avatar} name={assignedBarber.name} size={72} />
            <h2 className="text-5xl font-black tracking-tight">{assignedBarber.name}</h2>
            <p className="text-nxtup-muted text-sm">Acércate a su silla ahora</p>
          </div>
        ) : (
          <>
            <div className="flex flex-col items-center">
              <span className="text-nxtup-muted text-sm mb-1">Tu posición</span>
              <span className="text-9xl font-black leading-none tabular-nums">
                {position}
              </span>
            </div>
            <p className="text-nxtup-muted">
              {wait === 0 ? 'Te llaman pronto' : `~${wait} min de espera`}
            </p>
            {assignedBarber && (
              <p className="text-nxtup-dim text-sm">Con {assignedBarber.name}</p>
            )}
          </>
        )}

        <button
          onClick={handleLeave}
          className="mt-6 text-nxtup-dim text-sm underline underline-offset-4 hover:text-nxtup-muted transition-colors"
        >
          Salir de la cola
        </button>
      </div>
    )
  }

  // ── Walk-in mode (zero friction) ────────────────────────────
  if (walkInMode) {
    const nextBarber = fifoBarbers[0]

    return (
      <main className="min-h-screen flex flex-col px-6 pt-10 pb-12 max-w-sm mx-auto w-full">
        <header className="flex flex-col items-center text-center">
          <ShopLogo
            url={shop.logo_url}
            name={shop.name}
            size={64}
            className="mb-4"
          />
          <h1 className="text-3xl font-black tracking-tight">{shop.name}</h1>
          <p className="text-nxtup-active text-[10px] uppercase tracking-[0.4em] font-bold mt-2">
            Next Available
          </p>
        </header>

        <section className="mt-12 flex flex-col items-center text-center">
          <Avatar avatar={nextBarber.avatar} name={nextBarber.name} size={120} />
          <h2 className="text-5xl font-black tracking-tight mt-6">
            {nextBarber.name}
          </h2>
        </section>

        <footer className="mt-auto pt-12 flex flex-col items-center gap-3">
          <button
            type="button"
            onClick={() => setForceCheckIn(true)}
            className="text-nxtup-dim text-xs underline underline-offset-4 hover:text-nxtup-muted transition-colors"
          >
            ¿Esperás a alguien específico? Reservar mi turno →
          </button>
        </footer>
      </main>
    )
  }

  // ── Idle / form state (check-in required) ───────────────────
  const submitDisabled = !name.trim()

  return (
    <main className="min-h-screen flex flex-col px-6 pt-10 pb-12 max-w-sm mx-auto w-full">
      {/* Top: brand */}
      <header className="flex flex-col items-center text-center">
        <ShopLogo
          url={shop.logo_url}
          name={shop.name}
          size={64}
          className="mb-4"
        />
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.4em] mb-1 font-bold">
          Check in
        </p>
        <h1 className="text-3xl font-black tracking-tight">{shop.name}</h1>

        {availableInFifoCount > 0 && waitingCount > 0 ? (
          <p className="text-nxtup-break text-xs mt-3 font-medium tracking-wide">
            {waitingCount === 1 ? '1 persona' : `${waitingCount} personas`} en cola
            antes que tú
          </p>
        ) : allBusy ? (
          <p className="text-nxtup-break text-xs mt-3 font-medium tracking-wide">
            Todos ocupados — entrás a la cola
          </p>
        ) : null}

        {forceCheckIn && availableInFifoCount > 0 && waitingCount === 0 && (
          <button
            type="button"
            onClick={() => setForceCheckIn(false)}
            className="text-nxtup-dim text-[10px] uppercase tracking-[0.3em] mt-3 hover:text-nxtup-muted transition-colors"
          >
            ← Pasar directo sin reservar
          </button>
        )}
      </header>

      {/* Middle: name input */}
      <div className="mt-10">
        <label
          htmlFor="client-name"
          className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] block mb-2 text-center font-bold"
        >
          Tu nombre
        </label>
        <input
          ref={inputRef}
          id="client-name"
          required
          value={name}
          onChange={e => {
            setName(e.target.value)
            if (error) setError('')
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault()
              handleTap()
            }
          }}
          placeholder="Marcus"
          autoComplete="given-name"
          autoFocus
          className="
            w-full bg-nxtup-line text-white text-xl text-center
            rounded-2xl px-5 py-4
            border border-nxtup-dim
            focus:border-white focus:outline-none
            placeholder:text-nxtup-dim
          "
        />
      </div>

      {/* Hero: the button */}
      <div className="mt-10 grid place-items-center">
        <TapButton
          label="TAP"
          hint={allBusy ? 'tomar mi turno' : 'entrar a la fila'}
          onClick={handleTap}
          loading={stage === 'loading'}
          disabled={submitDisabled && stage !== 'loading'}
          ariaLabel="Tap para entrar a la fila"
        />
      </div>

      {error && (
        <p
          className="text-nxtup-busy text-sm mt-6 text-center"
          role="alert"
        >
          {error}
        </p>
      )}

      {/* Footer: live shop info */}
      <footer className="mt-auto pt-12 flex flex-col items-center gap-3">
        {barbers.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-2 justify-center">
            {barbers.map(b => (
              <span key={b.id} className="flex items-center gap-1.5">
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    b.status === 'available'
                      ? 'bg-nxtup-active'
                      : b.status === 'busy'
                        ? 'bg-nxtup-busy'
                        : 'bg-nxtup-break'
                  }`}
                />
                <span className="text-nxtup-muted text-xs">{b.name}</span>
              </span>
            ))}
          </div>
        )}
        <p className="text-nxtup-dim text-[10px] uppercase tracking-[0.3em]">
          {queueCount === 0
            ? 'Sin cola'
            : queueCount === 1
              ? '1 en cola'
              : `${queueCount} en cola`}
        </p>
      </footer>
    </main>
  )
}

