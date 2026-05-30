import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
import { shopDayStart } from '@/lib/shop-time'

type Entry = {
  id: string
  barber_id: string | null
  status: 'waiting' | 'called' | 'in_progress' | 'done' | 'cancelled'
  created_at: string
  called_at: string | null
  completed_at: string | null
}

type Barber = {
  id: string
  name: string
  avatar: string | null
}

type ClientRow = {
  id: string
  first_visit_at: string
  referral_source: ReferralSource | null
}

type ReferralSource =
  | 'walk-by'
  | 'google'
  | 'instagram'
  | 'tiktok'
  | 'friend'
  | 'other'

const REFERRAL_LABELS: Record<ReferralSource, string> = {
  'walk-by': 'De pasada',
  google: 'Google',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  friend: 'Un amigo',
  other: 'Otro',
}

// ── Rangos de fecha ──────────────────────────────────────────────
// Hoy: día actual local desde 00:00. Comparado con el día previo
//   completo (ayer 00:00 a hoy 00:00).
// 7d / 30d: ventana móvil. Comparado con la ventana inmediatamente
//   anterior del mismo tamaño.

type RangeKey = 'today' | '7d' | '30d'
const VALID_RANGES: RangeKey[] = ['today', '7d', '30d']

const RANGE_META: Record<
  RangeKey,
  { label: string; heading: string; comparisonLabel: string }
> = {
  today: {
    label: 'Hoy',
    heading: 'Resumen del día. Comparado contra el día anterior.',
    comparisonLabel: 'ayer',
  },
  '7d': {
    label: '7 días',
    heading: 'Últimos 7 días. Comparado contra los 7 días previos.',
    comparisonLabel: '7 días previos',
  },
  '30d': {
    label: '30 días',
    heading: 'Últimos 30 días. Comparado contra los 30 días previos.',
    comparisonLabel: '30 días previos',
  },
}

function parseRange(input: string | undefined): RangeKey {
  if (input && (VALID_RANGES as string[]).includes(input)) {
    return input as RangeKey
  }
  return 'today'
}

function getRangeBoundaries(rangeKey: RangeKey, timeZone: string) {
  if (rangeKey === 'today') {
    return {
      currentStart: shopDayStart(timeZone, 0),
      currentEnd: null, // hasta ahora
      previousStart: shopDayStart(timeZone, 1),
      previousEnd: shopDayStart(timeZone, 0),
    }
  }
  if (rangeKey === '7d') {
    return {
      currentStart: shopDayStart(timeZone, 7),
      currentEnd: null,
      previousStart: shopDayStart(timeZone, 14),
      previousEnd: shopDayStart(timeZone, 7),
    }
  }
  // 30d
  return {
    currentStart: shopDayStart(timeZone, 30),
    currentEnd: null,
    previousStart: shopDayStart(timeZone, 60),
    previousEnd: shopDayStart(timeZone, 30),
  }
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  const sp = await searchParams
  const range = parseRange(sp.range)
  const meta = RANGE_META[range]

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name')
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
  const now = new Date()
  const { currentStart, previousStart, previousEnd } = getRangeBoundaries(
    range,
    timeZone,
  )

  // ── Queries ───────────────────────────────────────────────────
  // queue_entries del período actual + previo + barbers del shop + clients
  // con first_visit_at en cualquiera de los dos rangos (para marketing).
  const currentQuery = supabase
    .from('queue_entries')
    .select('id, barber_id, status, created_at, called_at, completed_at')
    .eq('shop_id', shop.id)
    .gte('created_at', currentStart.toISOString())

  const previousQuery = supabase
    .from('queue_entries')
    .select('id, barber_id, status, created_at, called_at, completed_at')
    .eq('shop_id', shop.id)
    .gte('created_at', previousStart.toISOString())
    .lt('created_at', previousEnd.toISOString())

  const [
    { data: currentEntries },
    { data: previousEntries },
    { data: barbers },
    { data: clientsCurrent },
    { data: clientsPrevious },
  ] = await Promise.all([
    currentQuery,
    previousQuery,
    supabase
      .from('barbers')
      .select('id, name, avatar')
      .eq('shop_id', shop.id)
      .order('name'),
    supabase
      .from('clients')
      .select('id, first_visit_at, referral_source')
      .eq('shop_id', shop.id)
      .gte('first_visit_at', currentStart.toISOString()),
    supabase
      .from('clients')
      .select('id, first_visit_at, referral_source')
      .eq('shop_id', shop.id)
      .gte('first_visit_at', previousStart.toISOString())
      .lt('first_visit_at', previousEnd.toISOString()),
  ])

  const current = (currentEntries ?? []) as Entry[]
  const previous = (previousEntries ?? []) as Entry[]
  const allBarbers: Barber[] = (barbers ?? []).map(b => ({
    id: b.id,
    name: b.name,
    avatar: isRenderableAvatar(b.avatar) ? b.avatar : null,
  }))
  const newClientsCurrent = (clientsCurrent ?? []) as ClientRow[]
  const newClientsPrevious = (clientsPrevious ?? []) as ClientRow[]

  // ── Cards ─────────────────────────────────────────────────────
  const walkInsCurrent = current.length
  const walkInsPrevious = previous.length
  const walkInsDeltaPct =
    walkInsPrevious > 0
      ? Math.round(((walkInsCurrent - walkInsPrevious) / walkInsPrevious) * 100)
      : null

  const waitCurrent = avgWaitMinutes(current)
  const waitPrevious = avgWaitMinutes(previous)
  const waitDelta = Math.round(waitCurrent - waitPrevious)

  const cutsByBarber = computeCutsByBarber(current, allBarbers)
  const peak = computePeakHour(current)
  const marketingRows = computeMarketingBreakdown(newClientsCurrent)
  const marketingDeltaPct =
    newClientsPrevious.length > 0
      ? Math.round(
          ((newClientsCurrent.length - newClientsPrevious.length) /
            newClientsPrevious.length) *
            100,
        )
      : null

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">Stats</h1>
      <p className="text-nxtup-muted text-sm mb-6">{meta.heading}</p>

      <RangeTabs current={range} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={`Walk-ins ${meta.label.toLowerCase()}`}>
          <BigNumber value={walkInsCurrent.toString()} />
          <Delta
            kind={
              walkInsDeltaPct === null
                ? 'neutral'
                : walkInsDeltaPct >= 0
                  ? 'up'
                  : 'down'
            }
            label={
              walkInsDeltaPct === null
                ? `Sin datos de ${meta.comparisonLabel}`
                : walkInsDeltaPct === 0
                  ? `Igual que ${meta.comparisonLabel}`
                  : `${walkInsDeltaPct > 0 ? '+' : ''}${walkInsDeltaPct}% vs ${meta.comparisonLabel} (${walkInsPrevious})`
            }
          />
        </Card>

        <Card title="Tiempo promedio de espera">
          <BigNumber
            value={waitCurrent > 0 ? `${Math.round(waitCurrent)} min` : '—'}
            mutedSuffix={
              waitCurrent > 0 ? undefined : 'sin entries con called_at'
            }
          />
          <Delta
            kind={
              waitPrevious === 0
                ? 'neutral'
                : waitDelta < 0
                  ? 'down'
                  : waitDelta > 0
                    ? 'up'
                    : 'neutral'
            }
            invertColors
            label={
              waitPrevious === 0
                ? `Sin datos de ${meta.comparisonLabel}`
                : waitDelta === 0
                  ? `Igual que ${meta.comparisonLabel}`
                  : `${waitDelta > 0 ? '+' : ''}${waitDelta} min vs ${meta.comparisonLabel} (${Math.round(waitPrevious)} min)`
            }
          />
        </Card>

        <Card title="Cortes por barbero">
          {cutsByBarber.length === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">
              Sin cortes registrados
            </p>
          ) : (
            <ul className="flex flex-col gap-3 mt-2">
              {cutsByBarber.map(b => (
                <li key={b.id} className="flex items-center gap-3">
                  <Avatar avatar={b.avatar} name={b.name} size={28} />
                  <span className="text-white text-sm font-medium flex-1 truncate">
                    {b.name}
                  </span>
                  <span className="text-white text-lg font-black tabular-nums w-8 text-right">
                    {b.count}
                  </span>
                  <span className="text-nxtup-muted text-xs w-16 text-right tabular-nums">
                    {b.avgChairMin > 0 ? `~${Math.round(b.avgChairMin)} min` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Hora pico">
          {peak.count === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">
              Sin walk-ins registrados
            </p>
          ) : (
            <>
              <BigNumber
                value={`${formatHour(peak.hour)} — ${formatHour(peak.hour + 1)}`}
              />
              <p className="text-nxtup-muted text-sm">
                {peak.count} {peak.count === 1 ? 'walk-in' : 'walk-ins'} en ese rango
              </p>
            </>
          )}
        </Card>

        <Card
          title={`¿Cómo nos conocieron? · ${newClientsCurrent.length} nuevos`}
          fullWidth
        >
          {marketingRows.length === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">
              {newClientsCurrent.length === 0
                ? 'Sin clientes nuevos en el período'
                : 'Clientes nuevos sin fuente registrada'}
            </p>
          ) : (
            <ul className="flex flex-col gap-3 mt-2">
              {marketingRows.map(row => (
                <MarketingRow
                  key={row.source}
                  label={REFERRAL_LABELS[row.source]}
                  count={row.count}
                  pct={row.pct}
                />
              ))}
            </ul>
          )}
          {marketingDeltaPct !== null && (
            <Delta
              kind={
                marketingDeltaPct === 0
                  ? 'neutral'
                  : marketingDeltaPct > 0
                    ? 'up'
                    : 'down'
              }
              label={
                marketingDeltaPct === 0
                  ? `Igual que ${meta.comparisonLabel}`
                  : `${marketingDeltaPct > 0 ? '+' : ''}${marketingDeltaPct}% vs ${meta.comparisonLabel} (${newClientsPrevious.length} nuevos)`
              }
            />
          )}
        </Card>
      </div>

      <p className="text-nxtup-dim text-xs mt-6 text-center">
        Última actualización:{' '}
        {now.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone,
        })}{' '}
        ({timeZone}) · Recarga para datos frescos.
      </p>
    </main>
  )
}

// ──────────────────────────────────────────────────────────────
// Computations
// ──────────────────────────────────────────────────────────────

function avgWaitMinutes(entries: Entry[]): number {
  const waits = entries
    .filter(e => e.called_at)
    .map(
      e =>
        (new Date(e.called_at!).getTime() - new Date(e.created_at).getTime()) /
        60000,
    )
  if (waits.length === 0) return 0
  return waits.reduce((a, b) => a + b, 0) / waits.length
}

function computeCutsByBarber(entries: Entry[], barbers: Barber[]) {
  const done = entries.filter(e => e.status === 'done' && e.barber_id)
  const byId = new Map<string, { count: number; chairMins: number[] }>()
  for (const e of done) {
    if (!e.barber_id) continue
    let agg = byId.get(e.barber_id)
    if (!agg) {
      agg = { count: 0, chairMins: [] }
      byId.set(e.barber_id, agg)
    }
    agg.count++
    if (e.called_at && e.completed_at) {
      const min =
        (new Date(e.completed_at).getTime() -
          new Date(e.called_at).getTime()) /
        60000
      if (min > 0) agg.chairMins.push(min)
    }
  }
  const rows = barbers
    .map(b => {
      const agg = byId.get(b.id)
      return {
        id: b.id,
        name: b.name,
        avatar: b.avatar,
        count: agg?.count ?? 0,
        avgChairMin:
          agg && agg.chairMins.length > 0
            ? agg.chairMins.reduce((a, b) => a + b, 0) / agg.chairMins.length
            : 0,
      }
    })
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
  return rows
}

function computePeakHour(entries: Entry[]) {
  const buckets = new Array(24).fill(0) as number[]
  for (const e of entries) {
    const h = new Date(e.created_at).getHours()
    if (h >= 0 && h < 24) buckets[h]++
  }
  let peakHour = 0
  let peakCount = 0
  for (let h = 0; h < 24; h++) {
    if (buckets[h] > peakCount) {
      peakCount = buckets[h]
      peakHour = h
    }
  }
  return { hour: peakHour, count: peakCount }
}

function computeMarketingBreakdown(
  currentClients: ClientRow[],
): Array<{ source: ReferralSource; count: number; pct: number }> {
  // Agrupar por source ignorando null. El % es proporcional al total
  // de clientes nuevos CON source registrado en el período. Si todos
  // tienen source null (raro post-source-required), devolvemos []
  // y el render muestra empty state.
  const byCounted = new Map<ReferralSource, number>()
  for (const c of currentClients) {
    if (c.referral_source == null) continue
    byCounted.set(
      c.referral_source,
      (byCounted.get(c.referral_source) ?? 0) + 1,
    )
  }
  const totalWithSource = Array.from(byCounted.values()).reduce(
    (a, b) => a + b,
    0,
  )
  return Array.from(byCounted.entries())
    .map(([source, count]) => ({
      source,
      count,
      pct:
        totalWithSource > 0 ? Math.round((count / totalWithSource) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count)
}

function formatHour(h: number): string {
  const safe = ((h % 24) + 24) % 24
  return `${String(safe).padStart(2, '0')}:00`
}

// ──────────────────────────────────────────────────────────────
// Small render bits
// ──────────────────────────────────────────────────────────────

function RangeTabs({ current }: { current: RangeKey }) {
  return (
    <nav
      className="inline-flex gap-1 mb-6 p-1 bg-nxtup-line/40 rounded-lg"
      aria-label="Rango de tiempo"
    >
      {VALID_RANGES.map(r => {
        const isCurrent = r === current
        return (
          <Link
            key={r}
            href={r === 'today' ? '/dashboard/stats' : `/dashboard/stats?range=${r}`}
            className={`
              px-4 py-1.5 rounded-md text-xs font-bold uppercase
              tracking-widest transition-colors
              ${
                isCurrent
                  ? 'bg-white text-black'
                  : 'text-nxtup-muted hover:text-white'
              }
            `}
            aria-current={isCurrent ? 'page' : undefined}
          >
            {RANGE_META[r].label}
          </Link>
        )
      })}
    </nav>
  )
}

function Card({
  title,
  children,
  fullWidth = false,
}: {
  title: string
  children: React.ReactNode
  fullWidth?: boolean
}) {
  return (
    <section
      className={`border border-nxtup-line rounded-2xl p-6 ${
        fullWidth ? 'md:col-span-2' : ''
      }`}
    >
      <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-4">
        {title}
      </p>
      {children}
    </section>
  )
}

function BigNumber({
  value,
  mutedSuffix,
}: {
  value: string
  mutedSuffix?: string
}) {
  return (
    <div className="flex items-baseline gap-3 mb-2">
      <span className="text-5xl font-black tracking-tight tabular-nums">
        {value}
      </span>
      {mutedSuffix && (
        <span className="text-nxtup-dim text-xs">{mutedSuffix}</span>
      )}
    </div>
  )
}

function Delta({
  kind,
  label,
  invertColors,
}: {
  kind: 'up' | 'down' | 'neutral'
  label: string
  invertColors?: boolean
}) {
  const goodGreen = !invertColors
  const upColor = goodGreen ? 'text-nxtup-active' : 'text-nxtup-busy'
  const downColor = goodGreen ? 'text-nxtup-busy' : 'text-nxtup-active'
  const color =
    kind === 'up' ? upColor : kind === 'down' ? downColor : 'text-nxtup-muted'
  const arrow = kind === 'up' ? '↑' : kind === 'down' ? '↓' : '·'
  return (
    <p className={`text-xs font-medium ${color}`}>
      {arrow} {label}
    </p>
  )
}

function MarketingRow({
  label,
  count,
  pct,
}: {
  label: string
  count: number
  pct: number
}) {
  return (
    <li className="flex items-center gap-3">
      <span className="text-white text-sm font-medium flex-1 truncate">
        {label}
      </span>
      {/* Mini bar visual — un track gris con un fill emerald que
          representa el % del total. Da una pista visual rápida sin
          necesitar chart library. */}
      <div className="hidden sm:flex flex-1 max-w-[160px] h-2 bg-nxtup-line rounded-full overflow-hidden">
        <div
          className="bg-nxtup-active h-full"
          style={{ width: `${pct}%` }}
          aria-hidden
        />
      </div>
      <span className="text-white text-base font-black tabular-nums w-8 text-right">
        {count}
      </span>
      <span className="text-nxtup-muted text-xs w-10 text-right tabular-nums">
        {pct}%
      </span>
    </li>
  )
}
