import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CheckInForm from './CheckInForm'

export default async function CheckInPage({
  params,
}: {
  params: Promise<{ shop_id: string }>
}) {
  const { shop_id } = await params
  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, is_open, max_queue_size, logo_url')
    .eq('id', shop_id)
    .single()

  if (!shop) notFound()

  const { data: barbers } = await supabase
    .from('barbers')
    .select('id, name, status, avatar, available_since')
    .eq('shop_id', shop_id)
    .neq('status', 'offline')
    .order('name')

  // queueCount = full pipeline (waiting + called + in_progress) — used to
  // enforce shop.max_queue_size.
  // waitingCount = only clients who haven't been called yet — used to
  // decide walk-in vs check-in mode.
  const [{ count: queueCount }, { count: waitingCount }] = await Promise.all([
    supabase
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shop_id)
      .in('status', ['waiting', 'called', 'in_progress']),
    supabase
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shop_id)
      .eq('status', 'waiting'),
  ])

  return (
    <CheckInForm
      shop={shop}
      barbers={barbers ?? []}
      queueCount={queueCount ?? 0}
      waitingCount={waitingCount ?? 0}
    />
  )
}
