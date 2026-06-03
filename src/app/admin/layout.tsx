import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  canAccessAdminRoutes,
  getAdminRole,
  getRoleLabel,
  isAdminUser,
} from '@/lib/admin-auth'
import AdminSidebar from './AdminSidebar'

// ============================================================
// /admin/* — Super-admin dashboard de NXTUP
//
// Layout compartido para todas las rutas /admin/*. Centraliza:
//   * Auth gate: cookie + email en ADMIN_EMAILS o PARTNER_EMAILS.
//     Sin estar en ninguna lista → redirect a / (home marketing).
//   * Shell visual: sidebar a la izquierda + main a la derecha.
//
// Dos niveles de acceso:
//   * Admin (Frank): ve y puede tocar TODO incluido panel-tokens
//   * Socio (otros owners): ve las páginas view-only — home,
//     shops, estadísticas, etc. NO ven panel-tokens (oculto en
//     sidebar y bloqueado a nivel de página).
//
// Patrón: para agregar una nueva sección view-only solo creas
// /admin/[feature]/page.tsx y un link en AdminSidebar. Las páginas
// destructivas deben agregar su propio `if (!isAdminUser) redirect`.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  if (!canAccessAdminRoutes(user.email)) redirect('/')

  const role = getAdminRole(user.email)
  const isAdmin = isAdminUser(user.email)
  const roleLabel = getRoleLabel(role)

  // Datos para el sidebar. Todo viene de user_metadata para que se
  // pueda cambiar desde Supabase sin necesidad de redeploy.
  //
  // Para meter o cambiar estos campos sin UI, correr en SQL Editor:
  //   update auth.users
  //   set raw_user_meta_data = raw_user_meta_data
  //     || jsonb_build_object('full_name', 'Juan Pérez', 'title', 'CTO')
  //   where email = 'juan@ejemplo.com';
  //
  // Campos soportados:
  //   * full_name (o name como alias) — nombre humano para el saludo
  //   * title — cargo opcional (CEO, CTO, COO, etc.). Se muestra
  //     debajo del rol "Cofounder" si está seteado.
  const metadata = (user.user_metadata ?? {}) as {
    full_name?: string
    name?: string
    title?: string
  }
  const emailLocal = (user.email ?? '').split('@')[0] ?? ''
  const displayName =
    metadata.full_name?.trim() ||
    metadata.name?.trim() ||
    emailLocal ||
    ''
  const titleLabel = metadata.title?.trim() ?? ''

  return (
    <div className="min-h-screen bg-nxtup-bg text-white flex">
      <AdminSidebar
        displayName={displayName}
        isAdmin={isAdmin}
        roleLabel={roleLabel}
        titleLabel={titleLabel}
      />
      <div className="flex-1 min-w-0 lg:ml-64">{children}</div>
    </div>
  )
}
