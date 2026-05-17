import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BarberControl from '../BarberControl'

/**
 * Fullscreen NXTUP kiosk view — designed for a tablet mounted at the
 * barber's station. Identical state-machine + 3-button layout as the
 * physical NXT TAP device.
 *
 * The plain `/barber/[shop_id]/[barber_id]` URL now serves a smaller
 * dashboard with stats and queue context for the barber's phone.
 */
export default async function BarberKioskPage({
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
        'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
      )
      .eq('id', barber_id)
      .eq('shop_id', shop_id)
      .single(),
    supabase
      .from('shops')
      .select(
        'id, name, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, break_mode',
      )
      .eq('id', shop_id)
      .single(),
    supabase
      .from('barbers')
      .select(
        'id, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
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
