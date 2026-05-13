import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ShopSettings from './ShopSettings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select(
      'id, name, max_queue_size, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, is_open, logo_url',
    )
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  return <ShopSettings shop={shop} userEmail={user.email ?? ''} />
}
