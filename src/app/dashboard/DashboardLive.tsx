'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import ShopLogo from '@/components/ShopLogo'
import { Avatar, isAvatarId, type AvatarId } from '@/components/avatars'
import {
  buildBarberOrder,
  buildHeldPositions,
  sortByQueueOrder,
} from '@/lib/queue-order'

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
  avatar: AvatarId | null
  available_since: string | null
  break_held_since: string | null
}

type Shop = {
  id: string
  name: string
  is_open: boolean
  max_queue_size: number
  logo_url: string | null
}

const STATUS_LABEL: Record<Entry['status'], string> = {
  waiting: 'Waiting',
  called: 'Called',
  in_progress: 'In chair',
}

const STATUS_COLOR: Record<Entry['status'], string> = {
  waiting: 'text-nxtup-muted',
  called: 'text-nxtup-break',
  in_progress: 'text-nxtup-active',
}

const BARBER_DOT: Record<Barber['status'], string> = {
  available: 'bg-nxtup-active',
  busy: 'bg-nxtup-busy',
  break: 'bg-nxtup-break',
  offline: 'bg-nxtup-dim',
}

const BARBER_LABEL: Record<Barber['status'], string> = {
  available: 'Available',
  busy: 'Busy',
  break: 'Break',
  offline: 'Off',
}

export default function DashboardLive({
  shop: initialShop,
  initialEntries,
  initialBarbers,
}: {
  shop: Shop
  initialEntries: Entry[]
  initialBarbers: Barber[]
}) {
  const [shop, setShop] = useState(initialShop)
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [barbers, setBarbers] = useState<Barber[]>(initialBarbers)
  const [toggleLoading, setToggleLoading] = useState(false)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState<'checkin' | 'display' | null>(null)

  useEffect(() => {
    setOrigin(window.location.origin)
  }, [])

  useEffect(() => {
    const supabase = createClient()

    const refresh = async () => {
      const [{ data: e }, { data: b }, { data: s }] = await Promise.all([
        supabase
          .from('queue_entries')
          .select('id, position, client_name, status, barber_id, created_at')
          .eq('shop_id', shop.id)
          .in('status', ['waiting', 'called', 'in_progress'])
          .order('position', { ascending: true }),
        supabase
          .from('barbers')
          .select('id, name, status, avatar, available_since, break_held_since')
          .eq('shop_id', shop.id)
          .order('name'),
        supabase
          .from('shops')
          .select('id, name, is_open, max_queue_size, logo_url')
          .eq('id', shop.id)
          .single(),
      ])
      if (e) setEntries(e as Entry[])
      if (b)
        setBarbers(
          (b as unknown[]).map(r => {
            const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
            return { ...row, avatar: isAvatarId(row.avatar) ? row.avatar : null }
          }),
        )
      if (s) setShop(s as Shop)
    }

    const channel = supabase
      .channel(`dashboard-${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries', filter: `shop_id=eq.${shop.id}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barbers', filter: `shop_id=eq.${shop.id}` },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${shop.id}` },
        refresh,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [shop.id])

  async function toggleOpen() {
    if (toggleLoading) return
    setToggleLoading(true)
    const supabase = createClient()
    const { data, error } = await supabase
      .from('shops')
      .update({ is_open: !shop.is_open })
      .eq('id', shop.id)
      .select('id, name, is_open, max_queue_size, logo_url')
      .single()
    if (data) setShop(data as Shop)
    if (error) console.error(error)
    setToggleLoading(false)
  }

  const checkinUrl = origin ? `${origin}/q/${shop.id}` : ''
  const displayUrl = origin ? `${origin}/display/${shop.id}` : ''

  function copy(target: 'checkin' | 'display', value: string) {
    if (!value) return
    navigator.clipboard.writeText(value)
    setCopied(target)
    setTimeout(() => setCopied(null), 1500)
  }

  const upNext = useMemo(
    () =>
      entries.find(e => e.status === 'called') ??
      entries.find(e => e.status === 'waiting') ??
      null,
    [entries],
  )
  const inProgress = useMemo(() => entries.filter(e => e.status === 'in_progress'), [entries])
  const waiting = useMemo(() => entries.filter(e => e.status === 'waiting'), [entries])
  const barberOrder = useMemo(() => buildBarberOrder(barbers), [barbers])
  const heldPositions = useMemo(() => buildHeldPositions(barbers), [barbers])
  const orderedBarbers = useMemo(
    () => sortByQueueOrder(barbers, barberOrder),
    [barbers, barberOrder],
  )
  const inQueueBarbers = orderedBarbers.filter(b => barberOrder.has(b.id))
  const outOfQueueBarbers = orderedBarbers.filter(b => !barberOrder.has(b.id))

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-6xl w-full mx-auto">
      {/* Status hero */}
      <section className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-8 mb-8 border-b border-nxtup-line">
        <div className="flex items-center gap-5">
          {shop.logo_url && (
            <ShopLogo url={shop.logo_url} name={shop.name} size={64} />
          )}
          <div>
            <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-2 font-bold">
              {shop.name}
            </p>
            <h2
              className={`text-4xl font-black tracking-tight ${
                shop.is_open ? 'text-nxtup-active' : 'text-nxtup-busy'
              }`}
            >
              {shop.is_open ? 'OPEN' : 'CLOSED'}
            </h2>
            <p className="text-nxtup-muted text-sm mt-1">
              {entries.length} en cola ·{' '}
              {barbers.filter(b => b.status !== 'offline').length} barberos activos
            </p>
          </div>
        </div>
        <button
          onClick={toggleOpen}
          disabled={toggleLoading}
          className="self-start sm:self-auto px-5 py-3 bg-nxtup-line border border-nxtup-dim hover:border-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40"
        >
          {toggleLoading
            ? '...'
            : shop.is_open
              ? 'Close shop'
              : 'Open shop'}
        </button>
      </section>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Queue */}
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold">
              Live queue
            </h3>
            <span className="text-nxtup-dim text-xs tabular-nums">
              {entries.length} / {shop.max_queue_size}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="border border-nxtup-line rounded-2xl py-16 text-center">
              <p className="text-nxtup-muted text-sm">No hay clientes en espera</p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {entries.map(entry => {
                const barber = barbers.find(b => b.id === entry.barber_id)
                const isUpNext = entry.id === upNext?.id
                return (
                  <li
                    key={entry.id}
                    className={`flex items-center gap-4 px-4 sm:px-5 py-4 rounded-xl border ${
                      isUpNext
                        ? 'bg-nxtup-line border-white/20'
                        : 'bg-transparent border-nxtup-line'
                    }`}
                  >
                    <span className="text-nxtup-dim text-xl font-black tabular-nums w-8 text-right">
                      {entry.position}
                    </span>
                    <span className="text-white font-bold text-lg flex-1 truncate">
                      {entry.client_name}
                    </span>
                    {barber && (
                      <span className="hidden sm:block text-nxtup-muted text-sm truncate max-w-[120px]">
                        {barber.name}
                      </span>
                    )}
                    <span
                      className={`text-xs font-bold uppercase tracking-widest ${STATUS_COLOR[entry.status]}`}
                    >
                      {STATUS_LABEL[entry.status]}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="grid grid-cols-3 gap-2 mt-4">
            <Stat label="Waiting" value={waiting.length} />
            <Stat label="Called" value={entries.filter(e => e.status === 'called').length} />
            <Stat label="In chair" value={inProgress.length} />
          </div>
        </section>

        {/* Right column */}
        <aside className="flex flex-col gap-8">
          {/* Barbers */}
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold">
                Barbers
              </h3>
              <Link
                href="/dashboard/barbers"
                className="text-nxtup-muted hover:text-white text-xs transition-colors"
              >
                Manage →
              </Link>
            </div>
            {barbers.length === 0 ? (
              <Link
                href="/dashboard/barbers"
                className="block border border-dashed border-nxtup-dim hover:border-white rounded-xl px-4 py-6 text-center text-nxtup-muted hover:text-white text-sm transition-colors"
              >
                + Agregar primer barbero
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                {inQueueBarbers.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {inQueueBarbers.map(b => {
                      const pos = barberOrder.get(b.id)!
                      return (
                        <li
                          key={b.id}
                          className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-nxtup-line"
                        >
                          <span
                            className="text-base font-black tabular-nums w-7 text-center text-nxtup-active"
                            aria-label={`Posición ${pos}`}
                          >
                            #{pos}
                          </span>
                          <Avatar avatar={b.avatar} name={b.name} size={32} />
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${BARBER_DOT[b.status]}`}
                          />
                          <span className="text-white font-medium flex-1 truncate">{b.name}</span>
                          <span className="text-nxtup-muted text-xs uppercase tracking-widest">
                            {BARBER_LABEL[b.status]}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                )}

                {outOfQueueBarbers.length > 0 && (
                  <>
                    {inQueueBarbers.length > 0 && (
                      <p className="text-nxtup-dim text-[10px] uppercase tracking-[0.3em] mt-3 mb-1 px-1 font-bold">
                        Fuera de fila
                      </p>
                    )}
                    <ul className="flex flex-col gap-2 opacity-60">
                      {outOfQueueBarbers.map(b => {
                        const heldPos = heldPositions.get(b.id)
                        return (
                          <li
                            key={b.id}
                            className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-nxtup-line"
                          >
                            <span className="text-nxtup-dim text-base font-black w-7 text-center">
                              —
                            </span>
                            <Avatar avatar={b.avatar} name={b.name} size={32} />
                            <span
                              className={`w-2 h-2 rounded-full flex-shrink-0 ${BARBER_DOT[b.status]}`}
                            />
                            <span className="text-white font-medium flex-1 truncate">{b.name}</span>
                            {heldPos !== undefined && b.status === 'break' && (
                              <span
                                className="text-[10px] font-bold uppercase tracking-widest text-nxtup-break border border-nxtup-break/40 rounded px-1.5 py-0.5"
                                title="El barbero conserva esta posición si vuelve dentro del tiempo permitido"
                              >
                                Vuelve a #{heldPos}
                              </span>
                            )}
                            <span className="text-nxtup-muted text-xs uppercase tracking-widest">
                              {BARBER_LABEL[b.status]}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Share */}
          <div>
            <h3 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-4 font-bold">
              Share
            </h3>
            <div className="flex flex-col gap-3">
              <ShareRow
                label="Client check-in"
                hint="Imprimí este link como QR en la entrada"
                url={checkinUrl}
                copied={copied === 'checkin'}
                onCopy={() => copy('checkin', checkinUrl)}
              />
              <ShareRow
                label="TV display"
                hint="Abrir en Fire TV / browser de la TV"
                url={displayUrl}
                copied={copied === 'display'}
                onCopy={() => copy('display', displayUrl)}
              />
            </div>
          </div>
        </aside>
      </div>
    </main>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-nxtup-line rounded-xl px-4 py-3">
      <p className="text-nxtup-muted text-xs uppercase tracking-widest mb-1">{label}</p>
      <p className="text-2xl font-black tabular-nums">{value}</p>
    </div>
  )
}

function ShareRow({
  label,
  hint,
  url,
  copied,
  onCopy,
}: {
  label: string
  hint: string
  url: string
  copied: boolean
  onCopy: () => void
}) {
  return (
    <div className="border border-nxtup-line rounded-xl p-4">
      <p className="text-nxtup-muted text-xs uppercase tracking-widest mb-1">{label}</p>
      <p className="text-nxtup-dim text-xs mb-3 leading-relaxed">{hint}</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 text-xs text-nxtup-muted bg-nxtup-bg border border-nxtup-line rounded-md px-3 py-2 truncate font-mono">
          {url || '...'}
        </code>
        <button
          onClick={onCopy}
          disabled={!url}
          className="px-3 py-2 bg-nxtup-line border border-nxtup-dim hover:border-white rounded-md text-xs font-medium transition-colors disabled:opacity-40"
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  )
}
