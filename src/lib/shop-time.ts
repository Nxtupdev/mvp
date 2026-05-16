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

  // 3. Find the UTC instant whose representation in `timeZone` is
  //    {y, m, d, 00:00:00}. Start with the naive UTC of those components,
  //    then iterate to correct for the offset (1 iteration handles
  //    everything except DST-edge cases, 2 handles those).
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
