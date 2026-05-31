import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import PanelTokensManager from './PanelTokensManager'

// ============================================================
// /dashboard/settings/panel-tokens
//
// Generar y revocar links temporales del Centro de Mando.
//
// Use case canónico: el dueño quiere que un dueño de un shop
// nuevo (barbería de prueba, demo) pruebe el centro de mando
// SIN darle acceso al dashboard completo. Genera un link aquí,
// lo copia, lo manda. Cuando termine el demo, revoca con un tap.
//
// Auth: cookie del dueño. La tabla shop_control_tokens tiene
// RLS scope-limited a su shop, así que solo ve/maneja los suyos.
// ============================================================

export default async function PanelTokensPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  return <PanelTokensManager shop={shop} />
}
