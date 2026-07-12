import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveSensorShop } from '@/lib/poc-sensor'

/**
 * GET /api/sensor/devices  (POC exit-sensor)
 *
 * El agente Linux del POC obtiene su lista de dispositivos pareados
 * (las IPs a escanear) para su shop. Auth: Authorization: Bearer <token>.
 *
 * Respuesta 200: { devices: [{ id, ip, label }] }
 */
export async function GET(request: NextRequest) {
  const shopId = await resolveSensorShop(request)
  if (!shopId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data } = await admin
    .from('poc_sensor_devices')
    .select('id, ip, label')
    .eq('shop_id', shopId)
    .order('created_at', { ascending: true })

  return Response.json({ devices: data ?? [] })
}
