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

  // We do NOT filter by date on the server because Vercel runs in UTC and
  // would chop a Caribbean/US owner's morning into "yesterday". The client
  // component knows the real local timezone and re-fetches with the right
  // local-midnight cutoff on mount, so the initial paint is just the most
  // recent N events as a quick preview.
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
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  return (
    <ActivityFeed
      shop={shop}
      barbers={barbers ?? []}
      initialEvents={events ?? []}
    />
  )
}
