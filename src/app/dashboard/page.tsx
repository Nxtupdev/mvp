import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardLive from './DashboardLive'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, is_open, max_queue_size, logo_url')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  const [{ data: entries }, { data: barbers }] = await Promise.all([
    supabase
      .from('queue_entries')
      .select('id, position, client_name, status, barber_id, created_at')
      .eq('shop_id', shop.id)
      .in('status', ['waiting', 'called', 'in_progress'])
      .order('position', { ascending: true }),
    supabase
      .from('barbers')
      .select('id, name, status, avatar, available_since, break_held_since')
      .eq('shop_id', shop.id)
      .order('name'),
  ])

  return (
    <DashboardLive
      shop={shop}
      initialEntries={entries ?? []}
      initialBarbers={barbers ?? []}
    />
  )
}
