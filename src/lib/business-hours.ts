// Horario de apertura semanal (migración 062). Lógica pura compartida
// por Settings (editor), TV (pantalla de cerrado) y quien lo necesite.
// El ENFORCEMENT vive en la DB (cron apply_business_hours) — esto es
// solo lectura/presentación.

export type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'

export type DaySchedule = { enabled: boolean; start: string; end: string }
export type WeekSchedule = Record<DayKey, DaySchedule>

// Orden de render (semana empieza lunes, como la vive una barbería).
export const DAY_KEYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']

export function emptySchedule(): WeekSchedule {
  const s = {} as WeekSchedule
  for (const d of DAY_KEYS) s[d] = { enabled: false, start: '09:00', end: '19:00' }
  return s
}

/** Normaliza el jsonb de la DB (puede venir parcial/null) a un WeekSchedule completo. */
export function scheduleFromDb(raw: unknown): WeekSchedule {
  const s = emptySchedule()
  if (!raw || typeof raw !== 'object') return s
  const obj = raw as Record<string, Partial<DaySchedule> | undefined>
  for (const d of DAY_KEYS) {
    const day = obj[d]
    if (day && typeof day === 'object') {
      s[d] = {
        enabled: !!day.enabled,
        start: typeof day.start === 'string' ? day.start.slice(0, 5) : '09:00',
        end: typeof day.end === 'string' ? day.end.slice(0, 5) : '19:00',
      }
    }
  }
  return s
}

/** Un día es válido para auto-apertura si está activado y end > start
 *  (no soportamos cruzar medianoche — misma regla que el cron). */
export function isValidDay(d: DaySchedule): boolean {
  return d.enabled && !!d.start && !!d.end && d.start < d.end
}

/** true si hay al menos un día activado válido. */
export function hasAnyOpenDay(s: WeekSchedule): boolean {
  return DAY_KEYS.some(k => isValidDay(s[k]))
}

// ── Próxima apertura ─────────────────────────────────────────────
// Calcula el próximo (día, hora) de apertura EN LA ZONA DEL SHOP.
// daysAhead: 0 = hoy (solo si la apertura aún no pasó), 1 = mañana...

export type NextOpening = { dayKey: DayKey; start: string; daysAhead: number }

const JS_DAY_TO_KEY: DayKey[] = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/** Partes locales (día de semana + HH:MM) de `now` en la zona dada. */
function localParts(now: Date, timeZone: string): { dayKey: DayKey; hm: string } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = fmt.formatToParts(now)
  const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
  const wd = get('weekday').toLowerCase().slice(0, 3) as DayKey
  let hour = get('hour')
  if (hour === '24') hour = '00' // algunos runtimes emiten 24:00
  return { dayKey: wd, hm: `${hour}:${get('minute')}` }
}

export function nextOpening(
  schedule: WeekSchedule,
  timeZone: string,
  now: Date = new Date(),
): NextOpening | null {
  const { dayKey: todayKey, hm } = localParts(now, timeZone)
  const todayIdx = JS_DAY_TO_KEY.indexOf(todayKey)
  if (todayIdx === -1) return null
  for (let ahead = 0; ahead < 7; ahead++) {
    const key = JS_DAY_TO_KEY[(todayIdx + ahead) % 7]
    const day = schedule[key]
    if (!isValidDay(day)) continue
    if (ahead === 0 && day.start <= hm) continue // hoy ya abrió (o pasó)
    return { dayKey: key, start: day.start, daysAhead: ahead }
  }
  return null
}

/** "09:00" → "9:00 AM" (formato humano para TV/kiosko). */
export function formatHourLabel(hm: string): string {
  const [hStr, m] = hm.split(':')
  let h = Number(hStr)
  const suffix = h >= 12 ? 'PM' : 'AM'
  if (h === 0) h = 12
  else if (h > 12) h -= 12
  return `${h}:${m} ${suffix}`
}
