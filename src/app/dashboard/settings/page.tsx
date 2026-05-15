import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
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
      'id, name, max_queue_size, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, trusted_public_ip, is_open, logo_url',
    )
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  // The IP the owner is connecting from right now — used by the anti-
  // cheat section to show "you'd register THIS IP" before they tap.
  const h = await headers()
  const xff = h.get('x-forwarded-for')
  const xri = h.get('x-real-ip')
  const currentIp =
    (xff ? xff.split(',')[0]?.trim() : null) || (xri ? xri.trim() : null) || null

  return (
    <ShopSettings shop={shop} userEmail={user.email ?? ''} currentIp={currentIp} />
  )
}
