'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { debounce } from '@/lib/debounce'
import { useLocale } from '@/lib/i18n'
import ShopLogo from '@/components/ShopLogo'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
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
  avatar: string | null
  available_since: string | null
  break_held_since: string | null
  // Necesarios para mostrar el countdown del break al dueño
  // (cuántos min restantes hasta que el cron 028 lo mande offline).
  break_started_at: string | null
  break_minutes_at_start: number | null
  // Set by the API in 'not_guaranteed' break_mode shops once any
  // barber below this one completes a walk-in during their break.
  // buildHeldPositions() reads this to drop their "Vuelve a #N" badge.
  break_invalidated?: boolean | null
  // Migración 019 (legacy) — counter del sistema viejo de peaje. La
  // migración 047 lo deja en 0 — no leerlo más.
  late_toll_remaining?: number | null
  // Migración 047 — sanción por llegada tarde. Si sanctioned_until está
  // en el futuro, el barbero aparece con borde naranja en el live view.
  sanctioned_until?: string | null
}

type Shop = {
  id: string
  name: string
  is_open: boolean
  max_queue_size: number
  logo_url: string | null
}

const STATUS_KEY: Record<Entry['status'], string> = {
  waiting: 'status.entry.waiting',
  called: 'status.entry.called',
  in_progress: 'status.entry.inProgress',
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

// Labels descriptivos al lado del nombre del barbero — distinto del
// label del BOTÓN de estado (que se mantiene en inglés AVAILABLE / BUSY
// / BREAK / OFFLINE por decisión del dueño). Aquí va el texto pequeño
// que dice "Carlos · Disponible".
const BARBER_KEY: Record<Barber['status'], string> = {
  available: 'status.available',
  busy: 'status.busy',
  break: 'status.break',
  offline: 'status.offline',
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
  const { t } = useLocale()
  const [shop, setShop] = useState(initialShop)
  const [entries, setEntries] = useState<Entry[]>(initialEntries)
  const [barbers, setBarbers] = useState<Barber[]>(initialBarbers)
  const [toggleLoading, setToggleLoading] = useState(false)
  const [origin, setOrigin] = useState('')
  const [copied, setCopied] = useState<'checkin' | 'display' | null>(null)
  // Tick de 30s para checks de sanción (migración 047). Necesario porque
  // react-hooks/purity prohíbe leer Date.now() en render — el state hace
  // la lectura inmutable a nivel de cada render frame.
  const [nowMs, setNowMs] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

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
          .select('id, name, status, avatar, available_since, break_held_since, break_started_at, break_minutes_at_start, break_invalidated, late_toll_remaining, sanctioned_until')
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
            return { ...row, avatar: isRenderableAvatar(row.avatar) ? row.avatar : null }
          }),
        )
      if (s) setShop(s as Shop)
    }

    // Debounce: un solo cambio de estado suele disparar eventos en
    // varias tablas a la vez (queue + barbers); colapsamos la ráfaga en
    // un refetch ~250ms después del último evento, no 2-3 seguidos.
    const debouncedRefresh = debounce(refresh, 250)

    const channel = supabase
      .channel(`dashboard-${shop.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_entries', filter: `shop_id=eq.${shop.id}` },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'barbers', filter: `shop_id=eq.${shop.id}` },
        debouncedRefresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'shops', filter: `id=eq.${shop.id}` },
        debouncedRefresh,
      )
      .subscribe()

    return () => {
      debouncedRefresh.cancel()
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

  const checkinUrl = origin ? `${origin}/kiosk/${shop.id}` : ''
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
              {shop.is_open ? t('dash.shop.open') : t('dash.shop.closed')}
            </h2>
            <p className="text-nxtup-muted text-sm mt-1">
              {t('dash.shop.inQueueCount', { count: entries.length })} ·{' '}
              {t('dash.shop.activeBarbers', {
                count: barbers.filter(b => b.status !== 'offline').length,
              })}
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
              ? t('dash.shop.closeShop')
              : t('dash.shop.openShop')}
        </button>
      </section>

      <div className="grid lg:grid-cols-3 gap-8">
        {/* Queue */}
        <section className="lg:col-span-2">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold">
              {t('dash.shop.liveQueue')}
            </h3>
            <span className="text-nxtup-dim text-xs tabular-nums">
              {entries.length} / {shop.max_queue_size}
            </span>
          </div>

          {entries.length === 0 ? (
            <div className="border border-nxtup-line rounded-2xl py-16 text-center">
              <p className="text-nxtup-muted text-sm">{t('dash.shop.noClients')}</p>
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
                      {t(STATUS_KEY[entry.status])}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}

          <div className="grid grid-cols-3 gap-2 mt-4">
            <Stat label={t('dash.stat.waiting')} value={waiting.length} />
            <Stat label={t('dash.stat.called')} value={entries.filter(e => e.status === 'called').length} />
            <Stat label={t('dash.stat.inProgress')} value={inProgress.length} />
          </div>
        </section>

        {/* Right column */}
        <aside className="flex flex-col gap-8">
          {/* Barbers */}
          <div>
            <div className="flex items-baseline justify-between mb-4">
              <h3 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold">
                {t('common.barbers')}
              </h3>
              <Link
                href="/dashboard/barbers"
                className="text-nxtup-muted hover:text-white text-xs transition-colors"
              >
                {t('common.manage')} →
              </Link>
            </div>
            {barbers.length === 0 ? (
              <Link
                href="/dashboard/barbers"
                className="block border border-dashed border-nxtup-dim hover:border-white rounded-xl px-4 py-6 text-center text-nxtup-muted hover:text-white text-sm transition-colors"
              >
                {t('dash.barbers.addFirst')}
              </Link>
            ) : (
              <div className="flex flex-col gap-2">
                {inQueueBarbers.length > 0 && (
                  <ul className="flex flex-col gap-2">
                    {inQueueBarbers.map(b => {
                      const pos = barberOrder.get(b.id)!
                      // Sanción por llegada tarde (migración 047): si el
                      // barbero está sancionado, borde + número + dot en
                      // naranja para que el dueño lo identifique desde lejos.
                      const sanctionedUntil = b.sanctioned_until
                        ? new Date(b.sanctioned_until)
                        : null
                      const isLate =
                        sanctionedUntil !== null &&
                        sanctionedUntil.getTime() > nowMs
                      const sanctionEndTime =
                        isLate && sanctionedUntil
                          ? sanctionedUntil.toLocaleTimeString(undefined, {
                              hour: 'numeric',
                              minute: '2-digit',
                            })
                          : null
                      return (
                        <li
                          key={b.id}
                          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl bg-nxtup-line ${
                            isLate ? 'ring-2 ring-orange-500/60' : ''
                          }`}
                        >
                          <span
                            className={`text-base font-black tabular-nums w-7 text-center ${
                              isLate ? 'text-orange-400' : 'text-nxtup-active'
                            }`}
                            aria-label={t('dash.barber.positionAria', { n: pos })}
                          >
                            #{pos}
                          </span>
                          <Avatar avatar={b.avatar} name={b.name} size={32} />
                          <span
                            className={`w-2 h-2 rounded-full flex-shrink-0 ${
                              isLate ? 'bg-orange-500' : BARBER_DOT[b.status]
                            }`}
                          />
                          <div className="flex-1 min-w-0">
                            <span className="text-white font-medium block truncate">
                              {b.name}
                            </span>
                            {isLate && sanctionEndTime && (
                              <span className="block text-orange-400 text-[10px] font-semibold">
                                {t('dash.barber.sanctionedUntil', { time: sanctionEndTime })}
                              </span>
                            )}
                          </div>
                          <span className="text-nxtup-muted text-xs uppercase tracking-widest">
                            {t(BARBER_KEY[b.status])}
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
                        {t('common.outOfQueue')}
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
                                title={t('dash.barber.keepPositionHint')}
                              >
                                {t('dash.barber.returnsTo', { n: heldPos })}
                              </span>
                            )}
                            {b.status === 'break' && b.break_started_at ? (
                              <BreakCountdownInline
                                breakStartedAt={b.break_started_at}
                                breakMinutesAtStart={b.break_minutes_at_start}
                              />
                            ) : (
                              <span className="text-nxtup-muted text-xs uppercase tracking-widest">
                                {t(BARBER_KEY[b.status])}
                              </span>
                            )}
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
              {t('common.share')}
            </h3>
            <div className="flex flex-col gap-3">
              <ShareRow
                label={t('dash.share.checkin.label')}
                hint={t('dash.share.checkin.hint')}
                url={checkinUrl}
                copied={copied === 'checkin'}
                onCopy={() => copy('checkin', checkinUrl)}
              />
              <ShareRow
                label={t('dash.share.tv.label')}
                hint={t('dash.share.tv.hint')}
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
  const { t } = useLocale()
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
          {copied ? t('common.copied') : t('common.copy')}
        </button>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// BreakCountdownInline — minutos restantes del break del barbero,
// renderizados en línea junto a los demás badges del dashboard live.
//
// El interval propio (cada 30s) es suficiente — el break dura
// 15-30 min típicamente, así que actualizar cada 30s da resolución
// fina sin re-render churn.
//
// Cuando se vence el tiempo, muestra "vencido" en rojo y empieza a
// pulsar — visual signal de que el cron 028 ya debería haberlo
// mandado offline o el barbero está sobre la grace.
// ──────────────────────────────────────────────────────────────
function BreakCountdownInline({
  breakStartedAt,
  breakMinutesAtStart,
}: {
  breakStartedAt: string
  breakMinutesAtStart: number | null
}) {
  const { t } = useLocale()
  const [now, setNow] = useState(Date.now)

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Si no tenemos el snapshot del minutos al iniciar break (caso
  // raro de barberos pre-009), assumimos 15 min como floor para no
  // mostrar números absurdos.
  const totalMin = breakMinutesAtStart ?? 15
  const startedAtMs = new Date(breakStartedAt).getTime()
  const elapsedMs = now - startedAtMs
  const elapsedMin = Math.floor(elapsedMs / 60_000)
  const remainingMin = totalMin - elapsedMin

  if (remainingMin <= 0) {
    return (
      <span className="text-xs font-bold uppercase tracking-widest text-nxtup-busy animate-pulse">
        {t('dash.break.expired')}
      </span>
    )
  }

  return (
    <span className="text-xs font-bold uppercase tracking-widest text-nxtup-break tabular-nums">
      {remainingMin} {t('kiosk.success.min')}
    </span>
  )
}
