import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ServiceManager from './ServiceManager'

export default async function ServicesPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  const { data: services } = await supabase
    .from('services')
    .select('id, name, price, duration_minutes, sort_order, active')
    .eq('shop_id', shop.id)
    .order('sort_order', { ascending: true })

  return <ServiceManager shopId={shop.id} initialServices={services ?? []} />
}
