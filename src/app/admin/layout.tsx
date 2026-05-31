import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isAdminUser } from '@/lib/admin-auth'
import AdminSidebar from './AdminSidebar'

// ============================================================
// /admin/* — Super-admin dashboard de NXTUP
//
// Layout compartido para todas las rutas /admin/*. Centraliza:
//   * Auth gate: cookie + email en ADMIN_EMAILS env var.
//     Sin esto → redirect a / (home marketing). Las páginas
//     hijas asumen que el usuario YA es admin y no repiten
//     el check.
//   * Shell visual: sidebar a la izquierda + main a la derecha.
//
// Patrón: para agregar una nueva sección admin solo creas
// /admin/[feature]/page.tsx + un link en AdminSidebar. La auth
// y el shell vienen gratis.
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
  if (!isAdminUser(user.email)) redirect('/')

  return (
    <div className="min-h-screen bg-nxtup-bg text-white flex">
      <AdminSidebar adminEmail={user.email ?? ''} />
      <div className="flex-1 min-w-0 lg:ml-64">{children}</div>
    </div>
  )
}
