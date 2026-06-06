import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
import { shopDateStart, shopDayStart } from '@/lib/shop-time'
import { getServerI18n } from '@/lib/i18n-server'
import PrintButton from './PrintButton'

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
// Hay tres atajos rápidos (today / 7d / 30d) + un picker custom donde
// el dueño elige las fechas exactas que quiere ver. El URL state es:
//
//   * Sin params               → preset 'today'
//   * ?range=7d                → preset 7 días
//   * ?range=30d               → preset 30 días
//   * ?from=YYYY-MM-DD&to=YYYY-MM-DD → custom (siempre gana sobre range)
//
// La comparación es siempre contra el período inmediatamente anterior
// del mismo tamaño. Para preset 'today' eso es ayer; para 7d son los
// 7 días previos a esos 7; para custom de N días son los N días previos.

type PresetKey = 'today' | '7d' | '30d'
const PRESET_KEYS: PresetKey[] = ['today', '7d', '30d']

const PRESET_META: Record<
  PresetKey,
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

type ResolvedRange =
  | { mode: 'preset'; key: PresetKey }
  | { mode: 'custom'; fromYmd: string; toYmd: string }

/**
 * Resuelve el rango a usar a partir de los searchParams. La regla:
 * si `from` y `to` están ambos presentes Y son fechas válidas Y
 * from ≤ to → modo custom. Si no, cae al preset (default 'today').
 *
 * `shopDateStart` devuelve null para fechas inválidas, lo que hace
 * trivial validar el formato.
 */
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

type Boundaries = {
  currentStart: Date
  // null = "until now" (preset behavior: incluye eventos hasta el
  // instante de la query). Para custom siempre tiene valor (start del
  // día SIGUIENTE a `to`, así `to` queda incluido completo).
  currentEnd: Date | null
  previousStart: Date
  previousEnd: Date
}

function getBoundaries(resolved: ResolvedRange, timeZone: string): Boundaries {
  if (resolved.mode === 'preset') {
    if (resolved.key === 'today') {
      return {
        currentStart: shopDayStart(timeZone, 0),
        currentEnd: null,
        previousStart: shopDayStart(timeZone, 1),
        previousEnd: shopDayStart(timeZone, 0),
      }
    }
    if (resolved.key === '7d') {
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

  // ── Custom mode ─────────────────────────────────────────────────
  // fromStart = 00:00 LOCAL del día `from`
  // currentEnd = 00:00 LOCAL del día SIGUIENTE a `to`
  //   (así el query `< currentEnd` incluye TODO el día `to`)
  // previousStart = fromStart - (currentEnd - fromStart)
  // previousEnd   = fromStart
  //
  // shopDateStart está garantizado a devolver Date (no null) porque
  // resolveRange ya validó que from/to son parseables.
  const fromStart = shopDateStart(timeZone, resolved.fromYmd)!
  const nextDay = addOneDayYmd(resolved.toYmd)
  const currentEnd =
    shopDateStart(timeZone, nextDay) ??
    // Fallback defensivo si la fecha cae justo en una transición DST
    // rara que rompe el +1 día: sumamos 24h sobre toStart.
    new Date(shopDateStart(timeZone, resolved.toYmd)!.getTime() + 24 * 60 * 60 * 1000)

  const sizeMs = currentEnd.getTime() - fromStart.getTime()

  return {
    currentStart: fromStart,
    currentEnd,
    previousStart: new Date(fromStart.getTime() - sizeMs),
    previousEnd: fromStart,
  }
}

/**
 * Suma un día calendario a un string YYYY-MM-DD. Usamos Date.UTC
 * (que maneja overflow — ej. día 32 de enero → 1 de febrero) y
 * re-formateamos.
 */
function addOneDayYmd(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return ymd
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const next = new Date(Date.UTC(y, m - 1, d + 1))
  const ny = next.getUTCFullYear()
  const nm = String(next.getUTCMonth() + 1).padStart(2, '0')
  const nd = String(next.getUTCDate()).padStart(2, '0')
  return `${ny}-${nm}-${nd}`
}

/**
 * Devuelve el YYYY-MM-DD de "hoy" según la zona horaria del shop.
 * Usado como `max` en los inputs de fecha — no tiene sentido permitir
 * elegir fechas futuras para un reporte histórico.
 */
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

/**
 * Formato corto en español para mostrar fechas en headings/labels.
 * Ej: "01 jun" — leído en la zona del shop para que no haya off-by-one
 * por el offset UTC.
 */
function formatYmdShort(ymd: string, timeZone: string): string {
  const date = shopDateStart(timeZone, ymd)
  if (!date) return ymd
  return new Intl.DateTimeFormat('es', {
    timeZone,
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function getDisplayMeta(
  resolved: ResolvedRange,
  timeZone: string,
): { label: string; heading: string; comparisonLabel: string } {
  if (resolved.mode === 'preset') {
    return PRESET_META[resolved.key]
  }
  const fromLabel = formatYmdShort(resolved.fromYmd, timeZone)
  const toLabel = formatYmdShort(resolved.toYmd, timeZone)
  return {
    label: `${fromLabel} – ${toLabel}`,
    heading: `Personalizado: ${fromLabel} – ${toLabel}. Comparado contra el período previo del mismo tamaño.`,
    comparisonLabel: 'período previo',
  }
}

/**
 * Devuelve la fecha YYYY-MM-DD de una Date interpretada EN la zona
 * horaria del shop. Usado para comparar si dos Dates caen en el mismo
 * día calendario del shop (no necesariamente del UTC).
 */
function formatYmdInTz(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * Formato amigable del rango de fechas del reporte — para mostrar en
 * el encabezado del PDF. Casos:
 *   * Mismo día → "06 de junio, 2026"
 *   * Multi-día → "30 may – 06 jun 2026"
 *
 * `currentEnd` es exclusivo (start del día siguiente). Restamos 1ms
 * para caer "dentro" del último día y que el formateo no salte de día.
 * Si currentEnd es null (presets como 7d/30d que llegan "hasta ahora"),
 * usamos el momento actual.
 */
function formatPrintDateRange(
  currentStart: Date,
  currentEnd: Date | null,
  timeZone: string,
): string {
  const endInclusive = currentEnd
    ? new Date(currentEnd.getTime() - 1)
    : new Date()

  const sameDay =
    formatYmdInTz(currentStart, timeZone) ===
    formatYmdInTz(endInclusive, timeZone)

  if (sameDay) {
    return new Intl.DateTimeFormat('es', {
      timeZone,
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(currentStart)
  }

  const start = new Intl.DateTimeFormat('es', {
    timeZone,
    day: '2-digit',
    month: 'short',
  }).format(currentStart)
  const end = new Intl.DateTimeFormat('es', {
    timeZone,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(endInclusive)
  return `${start} – ${end}`
}

/**
 * Timestamp completo para el "Generado el …" del PDF — fecha larga
 * + hora local del shop. Ejemplo: "06 de junio de 2026, 14:23".
 */
function formatPrintTimestamp(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('es', {
    timeZone,
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
}

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
  const { t } = await getServerI18n()

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
  const meta = getDisplayMeta(resolved, timeZone)
  const todayYmd = shopTodayYmd(timeZone)
  const now = new Date()
  const { currentStart, currentEnd, previousStart, previousEnd } = getBoundaries(
    resolved,
    timeZone,
  )

  // ── Queries ───────────────────────────────────────────────────
  // queue_entries del período actual + previo + barbers del shop + clients
  // con first_visit_at en cualquiera de los dos rangos (para marketing).
  //
  // currentEnd es null para presets ("hasta ahora") y Date para custom
  // (start del día siguiente a `to`). Cuando es Date agregamos `.lt()`.
  let currentQuery = supabase
    .from('queue_entries')
    .select('id, barber_id, status, created_at, called_at, completed_at')
    .eq('shop_id', shop.id)
    .gte('created_at', currentStart.toISOString())
  if (currentEnd) {
    currentQuery = currentQuery.lt('created_at', currentEnd.toISOString())
  }

  const previousQuery = supabase
    .from('queue_entries')
    .select('id, barber_id, status, created_at, called_at, completed_at')
    .eq('shop_id', shop.id)
    .gte('created_at', previousStart.toISOString())
    .lt('created_at', previousEnd.toISOString())

  let clientsCurrentQuery = supabase
    .from('clients')
    .select('id, first_visit_at, referral_source')
    .eq('shop_id', shop.id)
    .gte('first_visit_at', currentStart.toISOString())
  if (currentEnd) {
    clientsCurrentQuery = clientsCurrentQuery.lt(
      'first_visit_at',
      currentEnd.toISOString(),
    )
  }

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
    clientsCurrentQuery,
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
  const peak = computePeakHour(current, timeZone)

  // Breakdown del total de walk-ins por status — para que el dueño
  // entienda por qué el total (12) puede no cuadrar con los cortes
  // por barbero (suma de status='done'). Reportado como bug por el
  // dueño de Fade Factory: "math not mathing".
  const walkInsBreakdown = {
    attended: current.filter(e => e.status === 'done').length,
    inProgress: current.filter(e => e.status === 'in_progress').length,
    waiting: current.filter(e => e.status === 'waiting' || e.status === 'called').length,
    cancelled: current.filter(e => e.status === 'cancelled').length,
  }
  const marketingRows = computeMarketingBreakdown(newClientsCurrent)
  const marketingDeltaPct =
    newClientsPrevious.length > 0
      ? Math.round(
          ((newClientsCurrent.length - newClientsPrevious.length) /
            newClientsPrevious.length) *
            100,
        )
      : null

  const printDateRange = formatPrintDateRange(currentStart, currentEnd, timeZone)
  const printTimestamp = formatPrintTimestamp(now, timeZone)

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl w-full mx-auto stats-print-root">
      {/* Header SOLO para impresión — branding del shop al imprimir el
          PDF. Trae el logo (si existe), el nombre del shop, el rango
          de fechas del reporte y la marca de tiempo de generación.
          Se oculta en pantalla porque el dueño ya ve esa info en la
          UI normal de arriba. */}
      <header className="hidden print:flex items-center gap-6 mb-8 pb-6 border-b border-zinc-300">
        {shop.logo_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.logo_url}
            alt={`${shop.name} logo`}
            className="h-16 w-auto max-w-[120px] object-contain"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-4xl font-black tracking-tight text-zinc-900">
            {shop.name}
          </h1>
          <p className="text-base mt-1 text-zinc-700">
            Reporte · <span className="font-semibold">{printDateRange}</span>
          </p>
          <p className="text-xs mt-1 text-zinc-500">
            Generado el {printTimestamp}
          </p>
        </div>
      </header>

      {/* Encabezado SOLO en pantalla — el botón de PDF queda a la derecha
          en desktop, abajo en mobile. El bloque entero se oculta al
          imprimir porque el header de arriba ya cubre esa info. */}
      <div className="print:hidden flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight mb-2">{t('dash.heading.stats')}</h1>
          <p className="text-nxtup-muted text-sm">{meta.heading}</p>
        </div>
        <PrintButton />
      </div>

      <RangeTabs resolved={resolved} todayYmd={todayYmd} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={`Walk-ins ${meta.label.toLowerCase()}`}>
          <BigNumber value={walkInsCurrent.toString()} />
          {walkInsCurrent > 0 && (
            <p className="text-nxtup-muted text-xs mb-1 tabular-nums">
              {[
                walkInsBreakdown.attended > 0 &&
                  `${walkInsBreakdown.attended} ${walkInsBreakdown.attended === 1 ? 'atendido' : 'atendidos'}`,
                walkInsBreakdown.inProgress > 0 &&
                  `${walkInsBreakdown.inProgress} en silla`,
                walkInsBreakdown.waiting > 0 &&
                  `${walkInsBreakdown.waiting} ${walkInsBreakdown.waiting === 1 ? 'esperando' : 'esperando'}`,
                walkInsBreakdown.cancelled > 0 &&
                  `${walkInsBreakdown.cancelled} ${walkInsBreakdown.cancelled === 1 ? 'cancelado' : 'cancelados'}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
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

      <p className="text-nxtup-dim text-xs mt-6 text-center print:hidden">
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

function computePeakHour(entries: Entry[], timeZone: string) {
  // Bug fix: la versión anterior usaba new Date().getHours() que
  // devuelve la hora del SERVIDOR (Vercel en UTC), no del shop. Eso
  // hacía que un walk-in a las 5 PM en RD apareciera como 9 PM
  // (UTC-4 → diferencia de 4 horas). El dueño percibía la hora pico
  // 4 horas más tarde de lo real.
  //
  // Fix: extraer la hora en la zona horaria del shop usando Intl.
  // Misma estrategia que shopDayStart() en /lib/shop-time.ts.
  const hourFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour: '2-digit',
    hour12: false,
  })
  const buckets = new Array(24).fill(0) as number[]
  for (const e of entries) {
    const parts = hourFormatter.formatToParts(new Date(e.created_at))
    const hourStr = parts.find(p => p.type === 'hour')?.value ?? '0'
    // Intl a veces emite hour=24 para medianoche en algunos locales.
    const h = Number(hourStr) === 24 ? 0 : Number(hourStr)
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

function RangeTabs({
  resolved,
  todayYmd,
}: {
  resolved: ResolvedRange
  todayYmd: string
}) {
  // Para custom mode los inputs vienen pre-llenados con los valores
  // del URL. Para preset mode quedan vacíos — si el dueño rellena
  // ambos y aplica, pasamos a custom; el form GET resuelve todo
  // server-side sin necesidad de state cliente.
  const fromDefault = resolved.mode === 'custom' ? resolved.fromYmd : ''
  const toDefault = resolved.mode === 'custom' ? resolved.toYmd : ''

  return (
    <div className="print:hidden flex flex-col gap-4 mb-6">
      <nav
        className="inline-flex gap-1 p-1 bg-nxtup-line/40 rounded-lg self-start"
        aria-label="Atajos de rango"
      >
        {PRESET_KEYS.map(k => {
          const isCurrent = resolved.mode === 'preset' && resolved.key === k
          return (
            <Link
              key={k}
              href={
                k === 'today' ? '/dashboard/stats' : `/dashboard/stats?range=${k}`
              }
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
              {PRESET_META[k].label}
            </Link>
          )
        })}
      </nav>

      {/* Form GET — el navegador serializa los inputs como query params
          y navega. SSR re-evalúa todo desde cero. No requiere JS. */}
      <form
        action="/dashboard/stats"
        method="GET"
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1">
          <span className="text-nxtup-muted text-[10px] uppercase tracking-wider font-bold">
            Desde
          </span>
          <input
            type="date"
            name="from"
            defaultValue={fromDefault}
            max={todayYmd}
            required
            className="bg-nxtup-line text-white rounded-lg px-3 py-2 border border-nxtup-dim focus:border-white focus:outline-none text-sm tabular-nums"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-nxtup-muted text-[10px] uppercase tracking-wider font-bold">
            Hasta
          </span>
          <input
            type="date"
            name="to"
            defaultValue={toDefault}
            max={todayYmd}
            required
            className="bg-nxtup-line text-white rounded-lg px-3 py-2 border border-nxtup-dim focus:border-white focus:outline-none text-sm tabular-nums"
          />
        </label>
        <button
          type="submit"
          className="bg-white text-black rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-widest hover:bg-nxtup-active transition-colors"
        >
          Aplicar
        </button>
        {resolved.mode === 'custom' && (
          <Link
            href="/dashboard/stats"
            className="text-nxtup-muted hover:text-white text-xs underline underline-offset-4 ml-1"
          >
            Limpiar
          </Link>
        )}
      </form>
    </div>
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
