import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import DeviceGrid from './DeviceGrid'

export default async function DevicesPage({
  params,
}: {
  params: Promise<{ shop_id: string }>
}) {
  const { shop_id } = await params
  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select(
      'id, name, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, break_mode, logo_url',
    )
    .eq('id', shop_id)
    .single()
  if (!shop) notFound()

  const { data: barbers } = await supabase
    .from('barbers')
    .select(
      'id, name, avatar, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
    )
    .eq('shop_id', shop_id)
    .order('name')

  const { data: entries } = await supabase
    .from('queue_entries')
    .select('id, client_name, position, status, barber_id, created_at')
    .eq('shop_id', shop_id)
    .in('status', ['called', 'in_progress'])

  return (
    <DeviceGrid
      shop={shop}
      initialBarbers={barbers ?? []}
      initialEntries={entries ?? []}
    />
  )
}
