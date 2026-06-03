import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/admin-auth'
import AdminPanelTokensManager from './AdminPanelTokensManager'

// ============================================================
// /admin/panel-tokens — Generación de links temporales del
// Centro de Mando.
//
// Auth base: viene del /admin/layout.tsx (admin O socio).
//
// Auth extra ACÁ: solo ADMIN. Esta página crea/revoca tokens —
// es destructiva. Los socios (PARTNER_EMAILS) están autorizados
// para el shell del admin pero NO para esta página. Si un socio
// llega a este URL, lo rebotamos a /admin.
//
// Soporta ?shop=<uuid> en el URL para pre-seleccionar un shop
// (lo usa el botón "Link temporal" de /admin/shops para que
// llegues con el dropdown ya apuntando al shop correcto).
// ============================================================

export const dynamic = 'force-dynamic'

export default async function AdminPanelTokensPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!isAdminUser(user?.email)) redirect('/admin')

  const { shop: preselectShopId } = await searchParams

  const admin = createAdminClient()
  const { data: shops } = await admin
    .from('shops')
    .select('id, name')
    .order('name')

  return (
    <AdminPanelTokensManager
      shops={shops ?? []}
      preselectShopId={preselectShopId ?? null}
    />
  )
}
