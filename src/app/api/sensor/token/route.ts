import { NextRequest } from 'next/server'
import crypto from 'node:crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/sensor/token  (POC exit-sensor)
 *
 * Genera (o rota) el token de sensor del shop del dueño. Lo llama el
 * dueño desde /dashboard/sensor. El agente Linux usa este token como
 * Bearer para GET /devices y POST /observations.
 *
 * Auth: cookie del dueño. Rotar invalida el token anterior (upsert).
 */
export async function POST(_request: NextRequest) {
  const cookieClient = await createClient()
  const {
    data: { user },
  } = await cookieClient.auth.getUser()
  if (!user) return Response.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data: shop } = await admin
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) return Response.json({ error: 'Shop no encontrado' }, { status: 404 })

  const token = `sensor_${crypto.randomBytes(24).toString('base64url')}`

  const { error } = await admin
    .from('poc_sensor_config')
    .upsert(
      { shop_id: (shop as { id: string }).id, token },
      { onConflict: 'shop_id' },
    )
  if (error) {
    console.error('[poc-sensor] token upsert failed', error)
    return Response.json({ error: 'No se pudo generar el token' }, { status: 500 })
  }

  return Response.json({ token })
}
