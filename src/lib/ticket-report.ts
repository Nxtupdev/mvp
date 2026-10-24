import { splitAmount } from '@/lib/tickets'

/**
 * Reportes de tickets por periodo (082) — lógica compartida entre
 * Cuentas → Reportes (dueño) y Mi cuenta (barbero).
 *
 * Dos reglas que hacen confiable un reporte:
 *   1. Los periodos se cortan en la hora LOCAL de la barbería
 *      (shops.timezone), no en UTC: "hoy" en Raleigh empieza a las
 *      00:00 de Raleigh, no a las 8pm del día anterior.
 *   2. Las líneas LIQUIDADAS usan el % congelado en su cierre
 *      (settlements.totals); solo las no liquidadas usan el % vigente.
 *      Así un reporte de la semana pasada no cambia si el dueño mueve
 *      el deslizador hoy.
 */

export type Period = 'today' | 'week' | 'month' | 'range'

export type ReportLine = {
  barber_id: string
  service_name: string | null
  amount: number
  settlement_id: string | null
}

const DAY_MS = 86_400_000

/** Offset (ms) de la zona `tz` respecto a UTC en el instante `ms`. */
function tzOffsetMs(ms: number, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(ms))
  const v = (t: string) => Number(parts.find(p => p.type === t)?.value)
  const asUtc = Date.UTC(v('year'), v('month') - 1, v('day'), v('hour'), v('minute'), v('second'))
  return asUtc - ms
}

/** Instante UTC de la medianoche local de `ymd` (YYYY-MM-DD) en `tz`. */
function zonedMidnight(ymd: string, tz: string): number {
  const [y, m, d] = ymd.split('-').map(Number)
  const guess = Date.UTC(y, m - 1, d)
  // Dos pasadas: la segunda corrige el raro caso de un cambio de
  // horario (DST) entre la medianoche UTC y la local.
  const first = guess - tzOffsetMs(guess, tz)
  return guess - tzOffsetMs(first, tz)
}

/** Fecha local YYYY-MM-DD de un instante en `tz`. */
export function localYmd(ms: number, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ms))
}

function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10)
}

const YMD = /^\d{4}-\d{2}-\d{2}$/

/**
 * Resuelve el periodo pedido a un rango [startIso, endIso) en la zona
 * de la barbería. Semana = lunes a domingo. Rango libre: `from`..`to`
 * inclusivos; inválido o invertido cae a "hoy".
 */
export function resolvePeriod(
  periodRaw: string | undefined,
  fromRaw: string | undefined,
  toRaw: string | undefined,
  tz: string,
  nowMs: number = Date.now(),
): { period: Period; startIso: string; endIso: string; fromYmd: string; toYmd: string } {
  const today = localYmd(nowMs, tz)
  let fromYmd = today
  let toYmd = today
  let period: Period = 'today'

  if (periodRaw === 'week') {
    period = 'week'
    const [y, m, d] = today.split('-').map(Number)
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay() // 0 = domingo
    fromYmd = addDays(today, -((weekday + 6) % 7)) // lunes
  } else if (periodRaw === 'month') {
    period = 'month'
    fromYmd = `${today.slice(0, 7)}-01`
  } else if (
    periodRaw === 'range' &&
    fromRaw &&
    toRaw &&
    YMD.test(fromRaw) &&
    YMD.test(toRaw) &&
    fromRaw <= toRaw
  ) {
    period = 'range'
    fromYmd = fromRaw
    toYmd = toRaw
  }

  return {
    period,
    startIso: new Date(zonedMidnight(fromYmd, tz)).toISOString(),
    endIso: new Date(zonedMidnight(addDays(toYmd, 1), tz)).toISOString(),
    fromYmd,
    toYmd,
  }
}

export type SettlementTotals = { barber_id: string; percent: number }[]

/**
 * Agrega las líneas confirmadas de un periodo. `currentPct(barberId)`
 * da el % vigente (líneas sin liquidar); `frozen` mapea
 * settlement_id → [{barber_id, percent}] (líneas liquidadas).
 */
export function aggregateReport(
  lines: ReportLine[],
  currentPct: (barberId: string) => number,
  frozen: Map<string, SettlementTotals>,
) {
  // Total por (barbero, %) — se reparte por bucket y se suma, para que
  // dos tramos con % distintos no se mezclen.
  const buckets = new Map<string, { barber_id: string; pct: number; total: number; count: number }>()
  const byService = new Map<string, { name: string; count: number; total: number }>()

  for (const l of lines) {
    const amount = Number(l.amount)
    const pct = l.settlement_id
      ? (frozen.get(l.settlement_id)?.find(x => x.barber_id === l.barber_id)?.percent ??
        currentPct(l.barber_id))
      : currentPct(l.barber_id)
    const key = `${l.barber_id}:${pct}`
    const b = buckets.get(key) ?? { barber_id: l.barber_id, pct, total: 0, count: 0 }
    b.total += amount
    b.count += 1
    buckets.set(key, b)

    const name = l.service_name ?? '—'
    const s = byService.get(name) ?? { name, count: 0, total: 0 }
    s.count += 1
    s.total += amount
    byService.set(name, s)
  }

  const round = (n: number) => Math.round(n * 100) / 100
  const barbers = new Map<
    string,
    { barber_id: string; count: number; total: number; barber_part: number; house_part: number }
  >()
  for (const b of buckets.values()) {
    const { barber, house } = splitAmount(round(b.total), b.pct)
    const acc = barbers.get(b.barber_id) ?? {
      barber_id: b.barber_id,
      count: 0,
      total: 0,
      barber_part: 0,
      house_part: 0,
    }
    acc.count += b.count
    acc.total = round(acc.total + b.total)
    acc.barber_part = round(acc.barber_part + barber)
    acc.house_part = round(acc.house_part + house)
    barbers.set(b.barber_id, acc)
  }

  const perBarber = Array.from(barbers.values()).sort((a, z) => z.total - a.total)
  return {
    total: round(perBarber.reduce((s, x) => s + x.total, 0)),
    barber_part: round(perBarber.reduce((s, x) => s + x.barber_part, 0)),
    house_part: round(perBarber.reduce((s, x) => s + x.house_part, 0)),
    count: perBarber.reduce((s, x) => s + x.count, 0),
    perBarber,
    perService: Array.from(byService.values())
      .map(s => ({ ...s, total: round(s.total) }))
      .sort((a, z) => z.total - a.total),
  }
}
