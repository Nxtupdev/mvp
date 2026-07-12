import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSensorShop } from '@/lib/poc-sensor'

/**
 * POST /api/sensor/observations  (POC exit-sensor)
 *
 * El agente reporta el batch CRUDO de un ciclo de escaneo. Una fila por
 * dispositivo, sin debounce (el debounce se simula offline después).
 *
 * Auth: Authorization: Bearer <token>.
 * Body: { observations: [{ device_id, scan_ts, seen_arp, seen_icmp }] }
 *   - scan_ts: ISO string (cuándo escaneó el agente). Si falta, se usa now().
 *
 * Solo se guardan device_id que pertenezcan al shop del token — un agente
 * no puede reportar dispositivos de otro shop aunque conozca el id.
 */
type Obs = {
  device_id?: string
  scan_ts?: string
  seen_arp?: boolean
  seen_icmp?: boolean
}

export async function POST(request: NextRequest) {
  const shopId = await resolveSensorShop(request)
  if (!shopId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { observations?: Obs[] }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const obs = Array.isArray(body.observations) ? body.observations : []
  if (obs.length === 0) return Response.json({ ok: true, inserted: 0 })

  const admin = createAdminClient()

  // IDs válidos = los dispositivos de ESTE shop.
  const { data: own } = await admin
    .from('poc_sensor_devices')
    .select('id')
    .eq('shop_id', shopId)
  const ownIds = new Set((own ?? []).map((d) => (d as { id: string }).id))

  const nowIso = new Date().toISOString()
  const rows = obs
    .filter((o) => o.device_id && ownIds.has(o.device_id))
    .map((o) => ({
      device_id: o.device_id as string,
      scan_ts: o.scan_ts ?? nowIso,
      seen_arp: Boolean(o.seen_arp),
      seen_icmp: Boolean(o.seen_icmp),
    }))

  if (rows.length === 0) return Response.json({ ok: true, inserted: 0 })

  const { error } = await admin.from('poc_scan_observations').insert(rows)
  if (error) {
    console.error('[poc-sensor] observations insert failed', error)
    return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
  }

  return Response.json({ ok: true, inserted: rows.length })
}
