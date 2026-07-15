import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isDemoOwner } from '@/lib/demo'

/**
 * POST /api/demo/reset
 *
 * Resetea la barbería DEMO a estado fresco (misma data que el seed, con
 * timestamps actuales). Lo usa el botón "Resetear demo" del dashboard
 * para que los socios refresquen el demo entre pruebas sin tocar SQL.
 *
 * Gates:
 *   1. Usuario autenticado.
 *   2. Su email = DEMO_OWNER_EMAIL. Un dueño real NUNCA pasa este check,
 *      así que su data está a salvo. La función SQL además solo opera
 *      sobre el shop del dueño demo (doble candado).
 *
 * El reseed vive en la función SQL reset_demo_shop() (migración 059),
 * security definer, granted solo a service_role → la invocamos con el
 * admin client.
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }
  if (!isDemoOwner(user.email)) {
    return Response.json(
      { error: 'Solo la cuenta demo puede resetear.' },
      { status: 403 },
    )
  }

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('reset_demo_shop')
  if (error) {
    console.error('[demo/reset] rpc error:', error.message)
    return Response.json({ error: 'No se pudo resetear el demo.' }, { status: 500 })
  }

  return Response.json({ ok: true, shop_id: data })
}
