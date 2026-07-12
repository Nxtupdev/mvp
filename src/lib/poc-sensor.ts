import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POC de detección de salida (sensor Wi-Fi). Valida el token Bearer que
 * manda el agente y devuelve el shop_id al que pertenece, o null si es
 * inválido. Patrón espejo de los panel-tokens (migración 043): token
 * por-shop en tabla, validado server-side con service role.
 *
 * DESCARTABLE — solo para el POC (tablas poc_).
 */
export async function resolveSensorShop(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  if (!token) return null

  const admin = createAdminClient()
  const { data } = await admin
    .from('poc_sensor_config')
    .select('shop_id')
    .eq('token', token)
    .maybeSingle()

  return (data as { shop_id?: string } | null)?.shop_id ?? null
}
