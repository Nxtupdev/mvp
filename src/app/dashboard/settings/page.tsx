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

  // Two-step fetch so that if `timezone` column hasn't been added yet
  // (migration 012 not run), the page still loads with a default
  // timezone instead of crashing back to /onboarding.
  const { data: shopBase } = await supabase
    .from('shops')
    .select(
      'id, name, max_queue_size, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, trusted_public_ip, is_open, logo_url',
    )
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shopBase) redirect('/onboarding')

  let timezone = 'America/New_York'
  try {
    const { data: tzRow } = await supabase
      .from('shops')
      .select('timezone')
      .eq('id', shopBase.id)
      .maybeSingle()
    if (tzRow && typeof (tzRow as { timezone?: string }).timezone === 'string') {
      timezone = (tzRow as { timezone: string }).timezone
    }
  } catch {
    // Column doesn't exist yet — keep default.
  }
  const shop = { ...shopBase, timezone }

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
