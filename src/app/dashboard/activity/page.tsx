import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ActivityFeed from './ActivityFeed'

export default async function ActivityPage() {
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

  // "Today" = local midnight, NOT UTC midnight. For owners in UTC-offsets
  // (most of LatAm/US) a UTC cutoff would chop their morning into yesterday.
  // The client component re-fetches with the local midnight too when the
  // user keeps the default range, so SSR and CSR stay consistent.
  const sinceMidnight = new Date()
  sinceMidnight.setHours(0, 0, 0, 0)

  const [{ data: barbers }, { data: events }] = await Promise.all([
    supabase
      .from('barbers')
      .select('id, name, avatar')
      .eq('shop_id', shop.id)
      .order('name'),
    supabase
      .from('activity_log')
      .select(
        'id, barber_id, action, from_status, to_status, metadata, created_at',
      )
      .eq('shop_id', shop.id)
      .gte('created_at', sinceMidnight.toISOString())
      .order('created_at', { ascending: false })
      .limit(500),
  ])

  return (
    <ActivityFeed
      shop={shop}
      barbers={barbers ?? []}
      initialEvents={events ?? []}
    />
  )
}
