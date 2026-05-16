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

  // SELECT * so the page survives even if a migration hasn't been run
  // yet (e.g. trusted_public_ip or timezone columns missing). Missing
  // columns are simply absent from the row and we default them below.
  const { data: shopRaw } = await supabase
    .from('shops')
    .select('*')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shopRaw) redirect('/onboarding')

  type ShopRow = {
    id: string
    name: string
    max_queue_size: number
    first_break_minutes?: number | null
    next_break_minutes?: number | null
    keep_position_on_break?: boolean | null
    break_position_grace_minutes?: number | null
    trusted_public_ip?: string | null
    timezone?: string | null
    is_open: boolean
    logo_url: string | null
  }
  const row = shopRaw as ShopRow

  // Apply defaults for any missing columns so the client component
  // always receives a fully-populated Shop.
  const shop = {
    id: row.id,
    name: row.name,
    max_queue_size: row.max_queue_size,
    first_break_minutes: row.first_break_minutes ?? 60,
    next_break_minutes: row.next_break_minutes ?? 30,
    keep_position_on_break: row.keep_position_on_break ?? false,
    break_position_grace_minutes: row.break_position_grace_minutes ?? 5,
    trusted_public_ip: row.trusted_public_ip ?? null,
    timezone: row.timezone ?? 'America/New_York',
    is_open: row.is_open,
    logo_url: row.logo_url,
  }

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
