import { createAdminClient } from '@/lib/supabase/admin'
import AdminPanelTokensManager from './AdminPanelTokensManager'

// ============================================================
// /admin/panel-tokens — Generación de links temporales del
// Centro de Mando.
//
// Auth: viene del /admin/layout.tsx — no se duplica aquí.
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
