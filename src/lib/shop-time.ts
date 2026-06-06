// ============================================================
// Timezone-aware day boundaries.
//
// Vercel's serverless runtime lives in UTC, so naïve uses of
// `new Date()` + `setHours(0,0,0,0)` give us *UTC midnight*, not the
// local midnight of whichever city the shop is in. That broke 'today'
// counters: at 9am Eastern, UTC midnight was still 4 hours away in the
// past so we were including evening cuts from "yesterday local."
//
// These helpers use the Intl API (which knows DST rules) to compute
// the UTC instant that corresponds to local midnight (or any other
// hour) in a given IANA timezone.
// ============================================================

/**
 * Returns the UTC Date that corresponds to `00:00:00.000` *local* time
 * in `timeZone`, offset by `daysAgo` days (0 = today, 1 = yesterday).
 */
export function shopDayStart(timeZone: string, daysAgo = 0): Date {
  // 1. Take "now" and shift by daysAgo (rough — DST may add/subtract an
  //    hour during the transition day, but we re-anchor below).
  const probe = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)

  // 2. Pull the date components AS SEEN IN the target timezone.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(probe)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  const y = Number(get('year'))
  const m = Number(get('month'))
  const d = Number(get('day'))

  return ymdToShopMidnight(y, m, d, timeZone)
}

/**
 * Returns the UTC Date que corresponde a `00:00:00.000` *local* time
 * en `timeZone` para una fecha calendario explícita (YYYY-MM-DD).
 *
 * Usado por el date range picker custom de /dashboard/stats — el dueño
 * elige un día, parseamos la cadena y obtenemos el instante UTC que
 * representa medianoche local de ese día en el shop. Esto importa
 * porque un "Desde: 2026-06-01" debe arrancar a las 00:00 del shop
 * (no a las 00:00 UTC, que sería 8pm-ish del día anterior en NC).
 *
 * Devuelve null si `ymd` no tiene formato YYYY-MM-DD válido — el
 * caller debe manejar este caso y caer a un default.
 */
export function shopDateStart(timeZone: string, ymd: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (
    !Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d) ||
    m < 1 || m > 12 || d < 1 || d > 31
  ) {
    return null
  }
  return ymdToShopMidnight(y, m, d, timeZone)
}

/**
 * Núcleo compartido: dado un (año, mes, día) interpretados como
 * fecha LOCAL en `timeZone`, devuelve el instante UTC equivalente.
 *
 * Empieza con el UTC ingenuo de esos componentes y itera para
 * corregir el offset de zona horaria. Una iteración basta para
 * casos normales; dos manejan transiciones de DST (donde el
 * "00:00" local salta de UTC-5 a UTC-4 o viceversa).
 */
function ymdToShopMidnight(
  y: number,
  m: number,
  d: number,
  timeZone: string,
): Date {
  let utc = Date.UTC(y, m - 1, d, 0, 0, 0)
  for (let i = 0; i < 2; i++) {
    utc -= tzOffsetMs(new Date(utc), timeZone)
  }
  return new Date(utc)
}

/**
 * Returns how many ms the given timezone is OFFSET from UTC at the
 * given instant. Positive for zones west of UTC (e.g. America/New_York
 * returns +14_400_000 / +18_000_000 depending on DST).
 */
function tzOffsetMs(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? '0'
  // Intl sometimes emits hour=24 for midnight on certain locales — normalize.
  const hour = Number(get('hour')) === 24 ? 0 : Number(get('hour'))
  const asIfUtc = Date.UTC(
    Number(get('year')),
    Number(get('month')) - 1,
    Number(get('day')),
    hour,
    Number(get('minute')),
    Number(get('second')),
  )
  return asIfUtc - at.getTime()
}
