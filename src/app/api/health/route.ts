import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/health — para el monitor externo (UptimeRobot o similar).
 *
 * Responde 200 con `ok: true` cuando la base contesta y cada trabajo
 * de pg_cron corrió dentro de su plazo con éxito; 503 en cualquier
 * otro caso, con el detalle de qué falló. El monitor solo necesita el
 * código de estado.
 *
 * Por qué importa: el cron `nxtup-cascade-no-show` mueve el piso de
 * todas las barberías cada 10 s (auto-BUSY, countdowns); si se
 * detiene, los clientes quedan en `called` para siempre y nadie lo ve
 * — ya nos pasó en silencio una vez (CHECK de la 063). Esto es lo
 * único que lo vigila. Ver OPERATIONS.md.
 *
 * No expone secretos: nombres de jobs, fechas y estados. Si se define
 * `HEALTH_TOKEN`, exige `?token=` para responder el detalle (el
 * código de estado se devuelve igual).
 */
export const dynamic = 'force-dynamic'

// Máximo tiempo sin correr, por job (ventana = varias cadencias, para
// no alertar por un tick lento). Un job que no esté aquí se reporta
// pero no afecta el resultado.
const MAX_AGE_SECONDS: Record<string, number> = {
  'nxtup-cascade-no-show': 90, // tick de 10s — el corazón del piso
  'nxtup-break-expired-offline': 5 * 60, // cada 1 min
  'nxtup-business-hours': 5 * 60, // cada 1 min
  'nxtup-expire-voice-no-shows': 5 * 60, // cada 1 min
  // nxtup-auto-offline-idle NO se vigila: desactivado a propósito (046).
  // nxtup-reset-daily-breaks NO existe: lo absorbió el nightly-reset (013).
  'nxtup-demo-reseed': 45 * 60, // cada 30 min
  'nxtup-nightly-reset': 26 * 60 * 60, // diario
  'nxtup-cleanup-activity-log': 26 * 60 * 60, // diario
  'nxtup-cleanup-cron-history': 26 * 60 * 60, // diario (071)
}

type CronRow = {
  jobname: string
  schedule: string
  active: boolean
  last_start: string | null
  last_end: string | null
  last_status: string | null
}

export async function GET(request: NextRequest) {
  const token = process.env.HEALTH_TOKEN
  const authorized = !token || request.nextUrl.searchParams.get('token') === token

  const admin = createAdminClient()
  const startedAt = Date.now()
  const problems: string[] = []

  // 1. Base de datos: una consulta trivial con la llave de servicio.
  const { error: dbError } = await admin.from('shops').select('id', { count: 'exact', head: true })
  const dbMs = Date.now() - startedAt
  if (dbError) problems.push(`db: ${dbError.message}`)

  // 2. Crons (migración 071). Sin la función, se reporta y falla.
  const { data: cronRows, error: cronError } = await admin.rpc('nxtup_cron_health')
  const now = Date.now()
  const crons = ((cronRows ?? []) as CronRow[]).map(r => {
    const ageSeconds = r.last_start ? Math.round((now - Date.parse(r.last_start)) / 1000) : null
    const maxAge = MAX_AGE_SECONDS[r.jobname]
    const watched = maxAge !== undefined
    let ok = true
    if (watched) {
      // Un job diario recién programado aún no tiene corrida: no es
      // falla. Los frecuentes (ventana < 1 h) sí deben tener historial.
      const neverRanIsFine = ageSeconds === null && maxAge >= 3600
      if (!r.active) ok = false
      else if (neverRanIsFine) ok = true
      else if (ageSeconds === null || ageSeconds > maxAge) ok = false
      else if (r.last_status && r.last_status !== 'succeeded' && r.last_status !== 'running') ok = false
    }
    if (watched && !ok) {
      problems.push(
        `cron ${r.jobname}: ${!r.active ? 'inactive' : ageSeconds === null ? 'never ran' : `last run ${ageSeconds}s ago (${r.last_status ?? 'unknown'})`}`,
      )
    }
    return { job: r.jobname, watched, ok, ageSeconds, lastStatus: r.last_status, schedule: r.schedule }
  })
  if (cronError) problems.push(`cron health: ${cronError.message}`)
  for (const job of Object.keys(MAX_AGE_SECONDS)) {
    // El reseed del demo es prescindible para la salud del piso.
    if (job === 'nxtup-demo-reseed') continue
    if (!cronError && !crons.some(c => c.job === job)) problems.push(`cron ${job}: not scheduled`)
  }

  const ok = problems.length === 0
  if (!ok) console.error('[health] FAIL', problems.join(' | '))

  const body = authorized
    ? { ok, checkedAt: new Date(now).toISOString(), db: { ok: !dbError, ms: dbMs }, crons, problems }
    : { ok }
  return Response.json(body, {
    status: ok ? 200 : 503,
    headers: { 'Cache-Control': 'no-store' },
  })
}
