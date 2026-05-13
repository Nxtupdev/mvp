import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BarberControl from './BarberControl'

export default async function BarberPage({
  params,
}: {
  params: Promise<{ shop_id: string; barber_id: string }>
}) {
  const { shop_id, barber_id } = await params
  const supabase = await createClient()

  const [{ data: barber }, { data: shop }, { data: peers }] = await Promise.all([
    supabase
      .from('barbers')
      .select(
        'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
      )
      .eq('id', barber_id)
      .eq('shop_id', shop_id)
      .single(),
    supabase
      .from('shops')
      .select(
        'id, name, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes',
      )
      .eq('id', shop_id)
      .single(),
    supabase
      .from('barbers')
      .select(
        'id, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
      )
      .eq('shop_id', shop_id),
  ])

  if (!barber || !shop) notFound()

  const [{ data: calledClient }, { data: currentClient }] = await Promise.all([
    supabase
      .from('queue_entries')
      .select('id, client_name, position')
      .eq('barber_id', barber_id)
      .eq('status', 'called')
      .maybeSingle(),
    supabase
      .from('queue_entries')
      .select('id, client_name, position')
      .eq('barber_id', barber_id)
      .eq('status', 'in_progress')
      .maybeSingle(),
  ])

  return (
    <BarberControl
      shopId={shop_id}
      shop={shop}
      initialBarber={barber}
      initialCalledClient={calledClient}
      initialCurrentClient={currentClient}
      initialPeers={peers ?? []}
    />
  )
}
