import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/admin-auth'
import AdminPanelTokensManager from './AdminPanelTokensManager'

// ============================================================
// /admin/panel-tokens — Generación de links temporales del
// Centro de Mando, controlado por staff de NXTUP (Frank).
//
// Use case: el dueño de un shop nuevo NO debe entrar al dashboard
// (le daría acceso completo). Yo (admin) genero un link aquí
// vinculado a SU shop, lo copio, se lo mando por WhatsApp. Él
// abre el link y maneja solo el Centro de Mando.
//
// Auth: cookie + email en la lista de ADMIN_EMAILS (env var).
// Sin email autorizado → redirect a /. La ruta es discoverable
// por URL pero inaccesible sin la cookie correcta.
//
// La lista de shops se trae vía admin client para que se vean
// todos los shops del sistema (RLS bloquearía a un user normal).
// ============================================================

export const dynamic = 'force-dynamic'

export default async function AdminPanelTokensPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!isAdminUser(user.email)) redirect('/')

  // Service-role client — necesario para ver TODOS los shops,
  // no solo el del owner autenticado (que es como funciona el
  // dashboard normal).
  const admin = createAdminClient()
  const { data: shops } = await admin
    .from('shops')
    .select('id, name')
    .order('name')

  return <AdminPanelTokensManager shops={shops ?? []} />
}
