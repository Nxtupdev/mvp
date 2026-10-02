import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { shopDateStart, shopDayStart } from '@/lib/shop-time'
import { getServerI18n } from '@/lib/i18n-server'
import PrintButton from '../stats/PrintButton'

// Tope de filas por consulta — un rango de 30 días en una barbería
// activa son ~600 entries; mostramos las más recientes y avisamos si
// el rango quedó truncado para que el dueño lo acorte.
const MAX_ROWS = 500

type Entry = {
  id: string
  barber_id: string | null
  status: 'waiting' | 'called' | 'in_progress' | 'done' | 'cancelled'
  created_at: string
  called_at: string | null
  completed_at: string | null
  client_id: string | null
  arrived_at: string | null
  mamacita_entry_id: string | null
  appointment_barber_id: string | null
}

type ClientRow = {
  id: string
  first_name: string
  last_name: string | null
  phone_number: string
}

// ── Rango de fechas ──────────────────────────────────────────────
// Mismo contrato de URL que /dashboard/stats (presets today/7d/30d +
// custom from/to), sin el período de comparación: el historial lista,
// no compara.

type PresetKey = 'today' | '7d' | '30d'
const PRESET_KEYS: PresetKey[] = ['today', '7d', '30d']
const PRESET_DAYS: Record<PresetKey, number> = { today: 0, '7d': 7, '30d': 30 }
const PRESET_LABEL_KEYS: Record<PresetKey, string> = {
  today: 'stats.preset.today.label',
  '7d': 'stats.preset.7d.label',
  '30d': 'stats.preset.30d.label',
}

type ResolvedRange =
  | { mode: 'preset'; key: PresetKey }
  | { mode: 'custom'; fromYmd: string; toYmd: string }

function resolveRange(
  searchParams: { range?: string; from?: string; to?: string },
  timeZone: string,
): ResolvedRange {
  const { from, to } = searchParams
  if (from && to) {
    const fromDate = shopDateStart(timeZone, from)
    const toDate = shopDateStart(timeZone, to)
    if (fromDate && toDate && fromDate.getTime() <= toDate.getTime()) {
      return { mode: 'custom', fromYmd: from, toYmd: to }
    }
  }
  if (
    searchParams.range === '7d' ||
    searchParams.range === '30d' ||
    searchParams.range === 'today'
  ) {
    return { mode: 'preset', key: searchParams.range }
  }
  return { mode: 'preset', key: 'today' }
}

function addOneDayYmd(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return ymd
  const next = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1),
  )
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(next.getUTCDate()).padStart(2, '0')
  return `${next.getUTCFullYear()}-${nm}-${nd}`
}

function getBoundaries(
  resolved: ResolvedRange,
  timeZone: string,
): { start: Date; end: Date | null } {
  if (resolved.mode === 'preset') {
    return { start: shopDayStart(timeZone, PRESET_DAYS[resolved.key]), end: null }
  }
  const start = shopDateStart(timeZone, resolved.fromYmd)!
  const end =
    shopDateStart(timeZone, addOneDayYmd(resolved.toYmd)) ??
    new Date(shopDateStart(timeZone, resolved.toYmd)!.getTime() + 24 * 60 * 60 * 1000)
  return { start, end }
}

function shopTodayYmd(timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  return `${get('year')}-${get('month')}-${get('day')}`
}

export default async function HistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const { locale, t } = await getServerI18n()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, logo_url')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  let timeZone = 'America/New_York'
  try {
    const { data: tzRow } = await supabase
      .from('shops')
      .select('timezone')
      .eq('id', shop.id)
      .maybeSingle()
    const value = (tzRow as { timezone?: string } | null)?.timezone
    if (typeof value === 'string' && value.length > 0) timeZone = value
  } catch {
    // Column doesn't exist yet — default is fine.
  }

  const resolved = resolveRange(sp, timeZone)
  const { start, end } = getBoundaries(resolved, timeZone)
  const todayYmd = shopTodayYmd(timeZone)

  let entriesQuery = supabase
    .from('queue_entries')
    .select(
      'id, barber_id, status, created_at, called_at, completed_at, client_id, arrived_at, mamacita_entry_id, appointment_barber_id',
    )
    .eq('shop_id', shop.id)
    .gte('created_at', start.toISOString())
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS)
  if (end) {
    entriesQuery = entriesQuery.lt('created_at', end.toISOString())
  }

  const [{ data: entriesData }, { data: barbersData }] = await Promise.all([
    entriesQuery,
    supabase.from('barbers').select('id, name').eq('shop_id', shop.id),
  ])

  const entries = (entriesData ?? []) as Entry[]
  const barberName = new Map(
    ((barbersData ?? []) as Array<{ id: string; name: string }>).map(b => [
      b.id,
      b.name,
    ]),
  )

  // Clientes de las entries en UNA query (sin N+1), igual que stats.
  const clientIds = Array.from(
    new Set(entries.map(e => e.client_id).filter((x): x is string => !!x)),
  )
  const clientById = new Map<string, ClientRow>()
  if (clientIds.length > 0) {
    const { data: clientsData } = await supabase
      .from('clients')
      .select('id, first_name, last_name, phone_number')
      .in('id', clientIds)
    for (const c of (clientsData ?? []) as ClientRow[]) {
      clientById.set(c.id, c)
    }
  }

  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: 'short',
  })
  const timeFmt = new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })

  const STATUS_KEYS: Record<Entry['status'], string> = {
    waiting: 'history.status.waiting',
    called: 'history.status.called',
    in_progress: 'history.status.inProgress',
    done: 'history.status.done',
    cancelled: 'history.status.cancelled',
  }

  // Tipo de entrada: cita (eligió barbero en kiosko, mig. 066), voz
  // (reserva Mamacita, mig. 053) o walk-in. Una reserva de voz que
  // nunca llegó se marca aparte — no pisó la barbería.
  function entryType(e: Entry): { label: string; pending: boolean } {
    if (e.appointment_barber_id) return { label: t('history.type.appointment'), pending: false }
    if (e.mamacita_entry_id) {
      return { label: t('history.type.voice'), pending: e.arrived_at === null }
    }
    return { label: t('history.type.walkin'), pending: false }
  }

  const minutesBetween = (a: string | null, b: string | null): string => {
    if (!a || !b) return '—'
    const min = (new Date(b).getTime() - new Date(a).getTime()) / 60000
    return min >= 0 ? `${Math.round(min)} min` : '—'
  }

  const rangeLabel =
    resolved.mode === 'preset'
      ? t(PRESET_LABEL_KEYS[resolved.key])
      : `${resolved.fromYmd} – ${resolved.toYmd}`

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl w-full mx-auto stats-print-root">
      {/* Header SOLO para impresión — mismo patrón que stats. */}
      <header className="hidden print:flex items-center gap-6 mb-8 pb-6 border-b border-zinc-300">
        {shop.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.logo_url}
            alt={shop.name}
            className="h-16 w-auto max-w-[120px] object-contain"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-4xl font-black tracking-tight text-zinc-900">
            {shop.name}
          </h1>
          <p className="text-base mt-1 text-zinc-700">
            {t('history.heading')} · <span className="font-semibold">{rangeLabel}</span>
          </p>
        </div>
      </header>

      <div className="print:hidden flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2">
            {t('history.heading')}
          </h1>
          <p className="text-nxtup-muted text-sm">{t('history.subheading')}</p>
        </div>
        <PrintButton />
      </div>

      {/* Tabs de rango — mismo contrato de URL que stats. */}
      <div className="print:hidden flex flex-col gap-4 mb-6">
        <nav
          className="inline-flex gap-1 p-1 bg-nxtup-line/40 rounded-lg self-start"
          aria-label={t('stats.range.shortcuts')}
        >
          {PRESET_KEYS.map(k => {
            const isCurrent = resolved.mode === 'preset' && resolved.key === k
            return (
              <Link
                key={k}
                href={
                  k === 'today'
                    ? '/dashboard/history'
                    : `/dashboard/history?range=${k}`
                }
                className={`px-4 py-1.5 rounded-md text-xs font-bold uppercase tracking-widest transition-colors ${
                  isCurrent ? 'bg-white text-black' : 'text-nxtup-muted hover:text-white'
                }`}
                aria-current={isCurrent ? 'page' : undefined}
              >
                {t(PRESET_LABEL_KEYS[k])}
              </Link>
            )
          })}
        </nav>

        <form
          action="/dashboard/history"
          method="GET"
          className="flex flex-wrap items-end gap-3"
        >
          <label className="flex flex-col gap-1">
            <span className="text-nxtup-muted text-[10px] uppercase tracking-wider font-bold">
              {t('stats.range.from')}
            </span>
            <input
              type="date"
              name="from"
              defaultValue={resolved.mode === 'custom' ? resolved.fromYmd : ''}
              max={todayYmd}
              required
              className="bg-nxtup-line text-white rounded-lg px-3 py-2 border border-nxtup-dim focus:border-white focus:outline-none text-sm tabular-nums"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-nxtup-muted text-[10px] uppercase tracking-wider font-bold">
              {t('stats.range.to')}
            </span>
            <input
              type="date"
              name="to"
              defaultValue={resolved.mode === 'custom' ? resolved.toYmd : ''}
              max={todayYmd}
              required
              className="bg-nxtup-line text-white rounded-lg px-3 py-2 border border-nxtup-dim focus:border-white focus:outline-none text-sm tabular-nums"
            />
          </label>
          <button
            type="submit"
            className="bg-white text-black rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-nxtup-active transition-colors"
          >
            {t('common.apply')}
          </button>
          {resolved.mode === 'custom' && (
            <Link
              href="/dashboard/history"
              className="text-nxtup-muted hover:text-white text-xs underline underline-offset-4 ml-1"
            >
              {t('common.clear')}
            </Link>
          )}
        </form>
      </div>

      {entries.length === 0 ? (
        <p className="text-nxtup-dim text-sm py-12 text-center border border-nxtup-line rounded-2xl">
          {t('history.empty')}
        </p>
      ) : (
        <>
          <p className="text-nxtup-muted text-xs mb-3 tabular-nums">
            {entries.length === 1
              ? t('history.count.one')
              : t('history.count.many', { count: entries.length })}
            {entries.length === MAX_ROWS && ` · ${t('history.truncated', { max: MAX_ROWS })}`}
          </p>
          <div className="overflow-x-auto border border-nxtup-line rounded-2xl print:border-zinc-300">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nxtup-line print:border-zinc-300 text-left text-[10px] uppercase tracking-wider text-nxtup-muted">
                  <th className="px-3 py-3 font-bold">{t('history.col.date')}</th>
                  <th className="px-3 py-3 font-bold">{t('history.col.client')}</th>
                  <th className="px-3 py-3 font-bold">{t('history.col.phone')}</th>
                  <th className="px-3 py-3 font-bold">{t('history.col.barber')}</th>
                  <th className="px-3 py-3 font-bold">{t('history.col.type')}</th>
                  <th className="px-3 py-3 font-bold">{t('history.col.status')}</th>
                  <th className="px-3 py-3 font-bold text-right">{t('history.col.wait')}</th>
                  <th className="px-3 py-3 font-bold text-right">{t('history.col.chair')}</th>
                </tr>
              </thead>
              <tbody>
                {entries.map(e => {
                  const client = e.client_id ? clientById.get(e.client_id) : undefined
                  const clientName = client
                    ? `${client.first_name}${client.last_name ? ` ${client.last_name}` : ''}`
                    : '—'
                  const type = entryType(e)
                  const created = new Date(e.created_at)
                  return (
                    <tr
                      key={e.id}
                      className="border-b border-nxtup-line/50 last:border-0 print:border-zinc-200"
                    >
                      <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                        <span className="text-white print:text-zinc-900">{dateFmt.format(created)}</span>{' '}
                        <span className="text-nxtup-muted">{timeFmt.format(created)}</span>
                      </td>
                      <td className="px-3 py-2.5 text-white print:text-zinc-900 max-w-[180px] truncate">
                        {clientName}
                      </td>
                      <td className="px-3 py-2.5 text-nxtup-muted whitespace-nowrap tabular-nums">
                        {client?.phone_number ?? '—'}
                      </td>
                      <td className="px-3 py-2.5 text-white print:text-zinc-900 max-w-[140px] truncate">
                        {(e.barber_id && barberName.get(e.barber_id)) || '—'}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className="text-nxtup-muted">{type.label}</span>
                        {type.pending && (
                          <span className="text-nxtup-break ml-1" title={t('history.type.voicePending')}>
                            ·
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <StatusBadge status={e.status} label={t(STATUS_KEYS[e.status])} />
                      </td>
                      <td className="px-3 py-2.5 text-right text-nxtup-muted whitespace-nowrap tabular-nums">
                        {minutesBetween(e.created_at, e.called_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-nxtup-muted whitespace-nowrap tabular-nums">
                        {minutesBetween(e.called_at, e.completed_at)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </main>
  )
}

function StatusBadge({
  status,
  label,
}: {
  status: Entry['status']
  label: string
}) {
  const color =
    status === 'done'
      ? 'text-nxtup-active'
      : status === 'cancelled'
        ? 'text-nxtup-busy'
        : status === 'in_progress'
          ? 'text-white'
          : 'text-nxtup-muted'
  return <span className={`text-xs font-medium ${color} print:text-zinc-700`}>{label}</span>
}
