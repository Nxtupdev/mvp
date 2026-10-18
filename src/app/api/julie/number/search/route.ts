import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedMamacitaPost } from '@/lib/mamacita'

/**
 * POST /api/julie/number/search — proxy firmado al buscador de números
 * de Mamacita (la compra ocurre en SU cuenta Twilio, así que el
 * inventario se consulta de su lado; contrato 17-oct).
 *
 * Body: { area_code: '919' } → respuesta de Mamacita passthrough:
 * { numbers: ['+1919...', ...], fallback_note?: string } — solo números
 * LOCAL long-code con Voice+SMS, nunca toll-free.
 *
 * Gate: dueño autenticado + add-on Julie activo (sin pagar no se
 * provisiona ni se consulta). Env MAMACITA_NUMBER_SEARCH_URL ausente =
 * el proveedor aún no está conectado (503, la UI lo dice).
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) return Response.json({ error: 'No tienes una barbería' }, { status: 404 })

  const admin = createAdminClient()
  const { data: subRow } = await admin
    .from('subscriptions')
    .select('julie_active')
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (!subRow?.julie_active) {
    return Response.json(
      { error: 'Activa Julie primero — el número se configura después del pago.' },
      { status: 400 },
    )
  }

  let areaCode = ''
  try {
    const body = await request.json()
    areaCode = String(body?.area_code ?? '').replace(/\D/g, '')
  } catch {
    // cae a la validación de abajo
  }
  if (areaCode.length !== 3) {
    return Response.json({ error: 'area_code inválido (3 dígitos)' }, { status: 400 })
  }

  const url = process.env.MAMACITA_NUMBER_SEARCH_URL
  if (!url) {
    return Response.json(
      { error: 'La búsqueda de números aún no está conectada.' },
      { status: 503 },
    )
  }

  try {
    const res = await signedMamacitaPost(url, {
      shop_id: shop.id,
      area_code: areaCode,
    })
    if (res.status !== 200 || !res.body) {
      console.error('[julie/number/search] mamacita respondió', res.status, res.body)
      return Response.json(
        { error: 'No se pudo buscar números — intenta de nuevo.' },
        { status: 502 },
      )
    }
    return Response.json(res.body)
  } catch (err) {
    console.error('[julie/number/search] error', err)
    return Response.json(
      { error: 'No se pudo buscar números — intenta de nuevo.' },
      { status: 502 },
    )
  }
}
