import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BarberDashboard from './BarberDashboard'

export default async function BarberPage({
  params,
}: {
  params: Promise<{ shop_id: string; barber_id: string }>
}) {
  const { shop_id, barber_id } = await params
  const supabase = await createClient()

  // Today (local midnight) — used for the "cortes hoy" counter.
  const sinceMidnight = new Date()
  sinceMidnight.setHours(0, 0, 0, 0)

  const [{ data: barber }, { data: shop }, { data: peers }, { count: cutsToday }] =
    await Promise.all([
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
          'id, name, logo_url, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes',
        )
        .eq('id', shop_id)
        .single(),
      supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
        )
        .eq('shop_id', shop_id)
        .neq('status', 'offline')
        .order('name'),
      supabase
        .from('queue_entries')
        .select('*', { count: 'exact', head: true })
        .eq('barber_id', barber_id)
        .eq('status', 'done')
        .gte('completed_at', sinceMidnight.toISOString()),
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
    <BarberDashboard
      shopId={shop_id}
      shop={shop}
      initialBarber={barber}
      initialPeers={peers ?? []}
      initialCalledClient={calledClient}
      initialCurrentClient={currentClient}
      initialCutsToday={cutsToday ?? 0}
    />
  )
}
