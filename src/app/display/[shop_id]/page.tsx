import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DisplayBoard from './DisplayBoard'

export default async function DisplayPage({
  params,
}: {
  params: Promise<{ shop_id: string }>
}) {
  const { shop_id } = await params
  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select(
      'id, name, is_open, logo_url, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes',
    )
    .eq('id', shop_id)
    .single()

  if (!shop) notFound()

  const { data: entries } = await supabase
    .from('queue_entries')
    .select('id, position, client_name, status, barber_id, created_at')
    .eq('shop_id', shop_id)
    .in('status', ['waiting', 'called', 'in_progress'])
    .order('position', { ascending: true })

  const { data: barbers } = await supabase
    .from('barbers')
    .select(
      'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
    )
    .eq('shop_id', shop_id)
    .neq('status', 'offline')
    .order('name')

  return (
    <DisplayBoard
      shop={shop}
      initialEntries={entries ?? []}
      initialBarbers={barbers ?? []}
    />
  )
}
