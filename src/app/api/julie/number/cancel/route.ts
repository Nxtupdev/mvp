import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/julie/number/cancel — abandonar un flujo de número NO
 * consumado para volver al wizard y elegir otro método (caso NuevaYol
 * 21-oct: tocó "portar" sin querer y la página quedó atrapada en el
 * estado del porte, sin camino de vuelta a "comprar").
 *
 * Solo se permite cuando abandonar es gratis y no deja nada en motion:
 *   * porte en info_required (el dueño aún no completó el enlace seguro;
 *     el token de Mamacita muere solo a los 7 días o al crear un pedido
 *     nuevo) · * cualquier intento en failed.
 * NUNCA para submitted/porting_in_progress (ops ya está tramitando) ni
 * completed (número comprado/activo = dinero real; eso es soporte).
 */
export async function POST(_request: Request) {
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
  const { data: row } = await admin
    .from('julie_numbers')
    .select('choice, status')
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (!row) return Response.json({ ok: true }) // nada que cancelar

  const cancellable =
    row.status === 'failed' || (row.choice === 'port' && row.status === 'info_required')
  if (!cancellable) {
    return Response.json(
      { error: 'Este trámite ya está en proceso y no se puede cancelar desde aquí — escríbenos.' },
      { status: 409 },
    )
  }

  console.log('[julie/number/cancel]', { shop_id: shop.id, choice: row.choice, status: row.status })
  const { error } = await admin.from('julie_numbers').delete().eq('shop_id', shop.id)
  if (error) {
    console.error('[julie/number/cancel] delete failed', error)
    return Response.json({ error: 'No se pudo cancelar — intenta de nuevo.' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
