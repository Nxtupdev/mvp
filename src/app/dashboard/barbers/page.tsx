import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BarberManager from './BarberManager'

export default async function BarbersPage() {
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

  const { data: barbers } = await supabase
    .from('barbers')
    .select('id, name, status, avatar, created_at')
    .eq('shop_id', shop.id)
    .order('created_at', { ascending: true })

  return <BarberManager shopId={shop.id} initialBarbers={barbers ?? []} />
}
