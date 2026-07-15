import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Avatar, isRenderableAvatar } from '@/components/avatars'
import { shopDateStart, shopDayStart } from '@/lib/shop-time'
import { getServerI18n } from '@/lib/i18n-server'
import type { Locale } from '@/lib/i18n-types'
import PrintButton from './PrintButton'

// Firma del helper t() bindeado a un locale (ver i18n-server.makeServerT).
// Se pasa a los helpers module-level que renderizan texto para que
// puedan traducir sin re-leer la cookie.
type T = (key: string, vars?: Record<string, string | number>) => string

type Entry = {
  id: string
  barber_id: string | null
  status: 'waiting' | 'called' | 'in_progress' | 'done' | 'cancelled'
  created_at: string
  called_at: string | null
  completed_at: string | null
  // FK al cliente del kiosk. Necesario para split nuevo/recurrente en
  // el card de Walk-ins: comparamos entry.created_at vs el first_visit_at
  // del cliente para saber si esta entry FUE el primer visit del cliente.
  client_id: string | null
  // Presencia física (mig. 053): arrived_at != null = el cliente LLEGÓ
  // (walk-in nace con ella; voz se activa al hacer check-in). Reserva de
  // voz que nunca llega = arrived_at NULL + mamacita_entry_id != null.
  arrived_at: string | null
  mamacita_entry_id: string | null
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

// Cada ReferralSource mapea a su key i18n del kiosk — resolvemos con
// t() en el render en vez de hardcodear los labels en español.
const REFERRAL_LABEL_KEYS: Record<ReferralSource, string> = {
  'walk-by': 'kiosk.source.walk-by',
  google: 'kiosk.source.google',
  instagram: 'kiosk.source.instagram',
  tiktok: 'kiosk.source.tiktok',
  friend: 'kiosk.source.friend',
  other: 'kiosk.source.other',
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

// Cada preset apunta a sus keys i18n — resolvemos con t() donde se
// renderiza (label/heading/comparisonLabel).
const PRESET_META: Record<
  PresetKey,
  { label: string; heading: string; comparisonLabel: string }
> = {
  today: {
    label: 'stats.preset.today.label',
    heading: 'stats.preset.today.heading',
    comparisonLabel: 'stats.preset.today.comparison',
  },
  '7d': {
    label: 'stats.preset.7d.label',
    heading: 'stats.preset.7d.heading',
    comparisonLabel: 'stats.preset.7d.comparison',
  },
  '30d': {
    label: 'stats.preset.30d.label',
    heading: 'stats.preset.30d.heading',
    comparisonLabel: 'stats.preset.30d.comparison',
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
function formatYmdShort(ymd: string, timeZone: string, locale: Locale): string {
  const date = shopDateStart(timeZone, ymd)
  if (!date) return ymd
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: 'short',
  }).format(date)
}

function getDisplayMeta(
  resolved: ResolvedRange,
  timeZone: string,
  locale: Locale,
  t: T,
): { label: string; heading: string; comparisonLabel: string } {
  if (resolved.mode === 'preset') {
    const meta = PRESET_META[resolved.key]
    return {
      label: t(meta.label),
      heading: t(meta.heading),
      comparisonLabel: t(meta.comparisonLabel),
    }
  }
  const fromLabel = formatYmdShort(resolved.fromYmd, timeZone, locale)
  const toLabel = formatYmdShort(resolved.toYmd, timeZone, locale)
  return {
    label: `${fromLabel} – ${toLabel}`,
    heading: t('stats.custom.heading', { from: fromLabel, to: toLabel }),
    comparisonLabel: t('stats.custom.comparison'),
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
  locale: Locale,
): string {
  const endInclusive = currentEnd
    ? new Date(currentEnd.getTime() - 1)
    : new Date()

  const sameDay =
    formatYmdInTz(currentStart, timeZone) ===
    formatYmdInTz(endInclusive, timeZone)

  if (sameDay) {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }).format(currentStart)
  }

  const start = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: '2-digit',
    month: 'short',
  }).format(currentStart)
  const end = new Intl.DateTimeFormat(locale, {
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
function formatPrintTimestamp(now: Date, timeZone: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, {
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
  const meta = getDisplayMeta(resolved, timeZone, locale, t)
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
    .select('id, barber_id, status, created_at, called_at, completed_at, client_id, arrived_at, mamacita_entry_id')
    .eq('shop_id', shop.id)
    .gte('created_at', currentStart.toISOString())
  if (currentEnd) {
    currentQuery = currentQuery.lt('created_at', currentEnd.toISOString())
  }

  const previousQuery = supabase
    .from('queue_entries')
    .select('id, barber_id, status, created_at, called_at, completed_at, client_id, arrived_at, mamacita_entry_id')
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
  // "Clientes de hoy" cuenta solo a los que LLEGARON, no a los que
  // llamaron. Una reserva de voz (Mamacita) que nunca aparece se queda
  // con arrived_at NULL → no debe inflar el número. Señal de llegada:
  //   arrived_at != null        → walk-in (nace así) o voz activada al check-in
  //   mamacita_entry_id == null → walk-in (cubre entries pre-mig-053 sin
  //                               arrived_at, que también son presenciales)
  // Pendiente = reserva de voz sin llegar (mamacita_entry_id + arrived_at NULL).
  const isPendingVoice = (e: Entry) =>
    e.mamacita_entry_id !== null && e.arrived_at === null
  const arrivedCurrent = current.filter(e => !isPendingVoice(e))
  const arrivedPrevious = previous.filter(e => !isPendingVoice(e))
  const voiceEnRouteCurrent = current.length - arrivedCurrent.length

  const walkInsCurrent = arrivedCurrent.length
  const walkInsPrevious = arrivedPrevious.length

  const waitCurrent = avgWaitMinutes(arrivedCurrent)
  const waitPrevious = avgWaitMinutes(arrivedPrevious)
  const waitDelta = Math.round(waitCurrent - waitPrevious)

  const cutsByBarber = computeCutsByBarber(arrivedCurrent, allBarbers)
  const peak = computePeakHour(arrivedCurrent, timeZone)

  // Breakdown de los clientes que llegaron, por status — para que el
  // dueño entienda por qué el total puede no cuadrar con los cortes por
  // barbero (suma de status='done'). Reportado como bug por el dueño de
  // Fade Factory: "math not mathing".
  const walkInsBreakdown = {
    attended: arrivedCurrent.filter(e => e.status === 'done').length,
    inProgress: arrivedCurrent.filter(e => e.status === 'in_progress').length,
    waiting: arrivedCurrent.filter(e => e.status === 'waiting' || e.status === 'called').length,
    cancelled: arrivedCurrent.filter(e => e.status === 'cancelled').length,
  }

  // ── Split nuevo/recurrente ──────────────────────────────────────
  // Cargamos los clients referenciados por las entries del período
  // (actual + previo) en UNA query para no hacer N+1. Después
  // clasificamos cada entry comparando su created_at con el
  // first_visit_at del cliente: si están dentro de un margen de 60s,
  // esta entry FUE el primer visit del cliente (= "nuevo"). Si no,
  // el cliente ya existía antes y este es un visit recurrente.
  //
  // El margen de 60s captura la latencia entre el INSERT al clients
  // y el INSERT al queue_entries que hace /api/kiosk/checkin: son
  // dos round trips secuenciales, normalmente <100ms aparte.
  const allClientIds = new Set<string>()
  for (const e of arrivedCurrent) {
    if (e.client_id) allClientIds.add(e.client_id)
  }
  for (const e of arrivedPrevious) {
    if (e.client_id) allClientIds.add(e.client_id)
  }

  const clientFirstVisitMap = new Map<string, string>()
  if (allClientIds.size > 0) {
    const { data: clientsLookup } = await supabase
      .from('clients')
      .select('id, first_visit_at')
      .in('id', Array.from(allClientIds))
    for (const c of (clientsLookup ?? []) as Array<{
      id: string
      first_visit_at: string | null
    }>) {
      if (c.first_visit_at) clientFirstVisitMap.set(c.id, c.first_visit_at)
    }
  }

  const FIRST_VISIT_THRESHOLD_MS = 60_000

  function classifyEntries(entries: Entry[]): { newOnes: number; returning: number } {
    let newOnes = 0
    let returning = 0
    for (const e of entries) {
      const firstVisit = e.client_id
        ? clientFirstVisitMap.get(e.client_id)
        : null
      if (!firstVisit) {
        // Sin cliente linkeado o cliente huérfano → contamos como
        // recurrente (más conservador — preferimos sub-reportar nuevos
        // que inflarlos por entries sin data).
        returning++
        continue
      }
      const diff = Math.abs(
        new Date(e.created_at).getTime() - new Date(firstVisit).getTime(),
      )
      if (diff < FIRST_VISIT_THRESHOLD_MS) {
        newOnes++
      } else {
        returning++
      }
    }
    return { newOnes, returning }
  }

  const walkInsCurrentSplit = classifyEntries(arrivedCurrent)
  const walkInsPreviousSplit = classifyEntries(arrivedPrevious)

  const marketingRows = computeMarketingBreakdown(newClientsCurrent)

  const printDateRange = formatPrintDateRange(
    currentStart,
    currentEnd,
    timeZone,
    locale,
  )
  const printTimestamp = formatPrintTimestamp(now, timeZone, locale)

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
            alt={t('stats.logoAlt', { shop: shop.name })}
            className="h-16 w-auto max-w-[120px] object-contain"
          />
        )}
        <div className="flex-1 min-w-0">
          <h1 className="text-4xl font-black tracking-tight text-zinc-900">
            {shop.name}
          </h1>
          <p className="text-base mt-1 text-zinc-700">
            {t('stats.report')} ·{' '}
            <span className="font-semibold">{printDateRange}</span>
          </p>
          <p className="text-xs mt-1 text-zinc-500">
            {t('stats.generatedOn', { date: printTimestamp })}
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

      <RangeTabs resolved={resolved} todayYmd={todayYmd} t={t} />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title={t('stats.card.walkins', { range: meta.label.toLowerCase() })}>
          <BigNumber value={walkInsCurrent.toString()} />
          {walkInsCurrent > 0 && (
            <p className="text-nxtup-muted text-xs mb-1 tabular-nums">
              {[
                walkInsBreakdown.attended > 0 &&
                  `${walkInsBreakdown.attended} ${walkInsBreakdown.attended === 1 ? t('stats.breakdown.attended.one') : t('stats.breakdown.attended.many')}`,
                walkInsBreakdown.inProgress > 0 &&
                  `${walkInsBreakdown.inProgress} ${t('stats.breakdown.inProgress')}`,
                walkInsBreakdown.waiting > 0 &&
                  `${walkInsBreakdown.waiting} ${t('stats.breakdown.waiting')}`,
                walkInsBreakdown.cancelled > 0 &&
                  `${walkInsBreakdown.cancelled} ${walkInsBreakdown.cancelled === 1 ? t('stats.breakdown.cancelled.one') : t('stats.breakdown.cancelled.many')}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
          {voiceEnRouteCurrent > 0 && (
            <p className="text-nxtup-break text-xs mb-1 tabular-nums">
              {t('stats.voice.enRoute', { count: voiceEnRouteCurrent })}
            </p>
          )}
          {/* Split nuevo/recurrente — segundo nivel de breakdown que
              le dice al dueño cuántos de esos walk-ins son retención
              vs. clientes brand new. Solo se renderiza si hay datos
              para mostrar (al menos un recurrente o un nuevo). */}
          {walkInsCurrent > 0 &&
            (walkInsCurrentSplit.returning > 0 || walkInsCurrentSplit.newOnes > 0) && (
              <p className="text-nxtup-muted text-xs mb-2 tabular-nums">
                {[
                  walkInsCurrentSplit.returning > 0 &&
                    `${walkInsCurrentSplit.returning} ${walkInsCurrentSplit.returning === 1 ? t('stats.split.returning.one') : t('stats.split.returning.many')}`,
                  walkInsCurrentSplit.newOnes > 0 &&
                    `${walkInsCurrentSplit.newOnes} ${walkInsCurrentSplit.newOnes === 1 ? t('stats.split.new.one') : t('stats.split.new.many')}`,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                {walkInsCurrentSplit.returning > 0 &&
                  walkInsPreviousSplit.returning > 0 &&
                  (() => {
                    const d = formatCountDelta(
                      walkInsCurrentSplit.returning,
                      walkInsPreviousSplit.returning,
                      meta.comparisonLabel,
                      t,
                      { unitName: t('stats.unit.returning') },
                    )
                    // Saltarse el caso "Igual que ..." en inline — el
                    // dueño no necesita ver "Igual" pegado a un breakdown
                    // que ya es informativo. Solo mostramos cuando hay
                    // movimiento real (up o down).
                    if (d.kind === 'neutral') return null
                    const colorClass =
                      d.kind === 'up' ? 'text-nxtup-active' : 'text-nxtup-busy'
                    return (
                      <span className={`ml-2 ${colorClass}`}>({d.label})</span>
                    )
                  })()}
              </p>
            )}
          {(() => {
            const d = formatCountDelta(
              walkInsCurrent,
              walkInsPrevious,
              meta.comparisonLabel,
              t,
            )
            return <Delta kind={d.kind} label={d.label} />
          })()}
        </Card>

        <Card title={t('stats.card.avgWait')}>
          <BigNumber
            value={waitCurrent > 0 ? `${Math.round(waitCurrent)} min` : '—'}
            mutedSuffix={
              waitCurrent > 0 ? undefined : t('stats.wait.noData')
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
                ? t('stats.delta.noData', { label: meta.comparisonLabel })
                : waitDelta === 0
                  ? t('stats.delta.equal', { label: meta.comparisonLabel })
                  : t('stats.delta.waitMin', {
                      delta: `${waitDelta > 0 ? '+' : ''}${waitDelta}`,
                      label: meta.comparisonLabel,
                      prev: Math.round(waitPrevious),
                    })
            }
          />
        </Card>

        <Card title={t('stats.card.cutsByBarber')}>
          {cutsByBarber.length === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">
              {t('stats.empty.noCuts')}
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

        <Card title={t('stats.card.peakHour')}>
          {peak.count === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">
              {t('stats.empty.noWalkins')}
            </p>
          ) : (
            <>
              <BigNumber
                value={`${formatHour(peak.hour)} — ${formatHour(peak.hour + 1)}`}
              />
              <p className="text-nxtup-muted text-sm">
                {peak.count === 1
                  ? t('stats.peak.count.one', { count: peak.count })
                  : t('stats.peak.count.many', { count: peak.count })}
              </p>
            </>
          )}
        </Card>

        <Card
          title={t('stats.card.howHeard', { count: newClientsCurrent.length })}
          fullWidth
        >
          {marketingRows.length === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">
              {newClientsCurrent.length === 0
                ? t('stats.marketing.emptyNone')
                : t('stats.marketing.emptyNoSource')}
            </p>
          ) : (
            <ul className="flex flex-col gap-3 mt-2">
              {marketingRows.map(row => (
                <MarketingRow
                  key={row.source}
                  label={t(REFERRAL_LABEL_KEYS[row.source])}
                  count={row.count}
                  pct={row.pct}
                />
              ))}
            </ul>
          )}
          {newClientsPrevious.length > 0 &&
            (() => {
              const d = formatCountDelta(
                newClientsCurrent.length,
                newClientsPrevious.length,
                meta.comparisonLabel,
                t,
                { unitName: t('stats.unit.new') },
              )
              return <Delta kind={d.kind} label={d.label} />
            })()}
        </Card>
      </div>

      <p className="text-nxtup-dim text-xs mt-6 text-center print:hidden">
        {t('stats.lastUpdated')}:{' '}
        {now.toLocaleTimeString('en-GB', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone,
        })}{' '}
        ({timeZone}) · {t('stats.reload')}
      </p>
    </main>
  )
}

// ──────────────────────────────────────────────────────────────
// Computations
// ──────────────────────────────────────────────────────────────

// Si el período previo tuvo menos que este umbral de eventos, mostrar
// el delta como ABSOLUTO (+N) en vez de PORCENTAJE (+X%). Razón: un
// cambio de 1 a 6 sale como "+500%" que suena dramático pero en
// realidad son números chiquitos. Frank pidió que cambie a algo más
// leíble cuando la base es pequeña.
const SMALL_BASE_THRESHOLD = 3

type DeltaResult = { kind: 'up' | 'down' | 'neutral'; label: string }

/**
 * Calcula la etiqueta de delta para un par (actual, previo) de números
 * enteros. Decide entre mostrar % o absoluto según el tamaño de la base
 * para evitar porcentajes engañosos cuando el período previo es chiquito.
 *
 * Casos:
 *   * previous = 0 → "Sin datos de {comparisonLabel}" (no hay base)
 *   * delta = 0    → "Igual que {comparisonLabel}"
 *   * previous < SMALL_BASE_THRESHOLD → ABSOLUTO ("+5 vs ..., era 1")
 *   * Else → PORCENTAJE ("+45% vs ..., 11")
 *
 * `unitName` se pone entre el delta y el "vs" para textos más naturales:
 *   formatCountDelta(6, 1, '7 días previos', { unitName: 'recurrentes' })
 *   → "+5 recurrentes vs 7 días previos (era 1)"
 *   formatCountDelta(6, 11, '7 días previos', { unitName: 'recurrentes' })
 *   → "-45% recurrentes vs 7 días previos (11)"
 */
function formatCountDelta(
  current: number,
  previous: number,
  comparisonLabel: string,
  t: T,
  opts: { unitName?: string } = {},
): DeltaResult {
  if (previous === 0) {
    return {
      kind: 'neutral',
      label: t('stats.delta.noData', { label: comparisonLabel }),
    }
  }
  const delta = current - previous
  if (delta === 0) {
    return {
      kind: 'neutral',
      label: t('stats.delta.equal', { label: comparisonLabel }),
    }
  }

  const unit = opts.unitName ? ` ${opts.unitName}` : ''
  const sign = delta > 0 ? '+' : ''
  const kind: 'up' | 'down' = delta > 0 ? 'up' : 'down'

  if (previous < SMALL_BASE_THRESHOLD) {
    return {
      kind,
      label: t('stats.delta.count', {
        sign,
        delta,
        unit,
        label: comparisonLabel,
        previous,
      }),
    }
  }

  const pct = Math.round((delta / previous) * 100)
  return {
    kind,
    label: t('stats.delta.countPct', {
      sign,
      pct,
      unit,
      label: comparisonLabel,
      previous,
    }),
  }
}

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
  t,
}: {
  resolved: ResolvedRange
  todayYmd: string
  t: T
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
        aria-label={t('stats.range.shortcuts')}
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
              {t(PRESET_META[k].label)}
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
            {t('stats.range.from')}
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
            {t('stats.range.to')}
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
          {t('common.apply')}
        </button>
        {resolved.mode === 'custom' && (
          <Link
            href="/dashboard/stats"
            className="text-nxtup-muted hover:text-white text-xs underline underline-offset-4 ml-1"
          >
            {t('common.clear')}
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
