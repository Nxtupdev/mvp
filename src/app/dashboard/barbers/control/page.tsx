import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ControlPanel from './ControlPanel'

// ============================================================
// /dashboard/barbers/control — "Centro de mando"
//
// The owner's remote-control view over the shop's barbers. From
// here they can flip any barber's state to ACTIVE / BUSY / BREAK /
// OFFLINE without being on the shop's WiFi. Backs onto the regular
// /api/barbers/[id]/state endpoint, which has an owner bypass that
// skips the trusted_public_ip gate when the request is authenticated
// as the shop owner.
//
// Designed for the common "Carlos walked off the floor without
// tapping BREAK" scenario — the dueño can fix the queue state in
// 1 tap from wherever they are.
// ============================================================

export default async function ControlPanelPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, first_break_minutes, next_break_minutes, break_position_grace_minutes, break_mode')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  // Fetch barbers + their current called/in_progress clients so the
  // panel can show meaningful context next to each barber (e.g.
  // "Pedro · BUSY con Juan", "Carlos · BREAK 12:34").
  const [{ data: barbers }, { data: entries }] = await Promise.all([
    supabase
      .from('barbers')
      .select(
        'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
      )
      .eq('shop_id', shop.id)
      .order('name'),
    supabase
      .from('queue_entries')
      .select('id, barber_id, client_name, status, position')
      .eq('shop_id', shop.id)
      .in('status', ['called', 'in_progress']),
  ])

  // Defensive default for break_mode in case migration 014 hasn't run.
  const shopWithMode = {
    ...shop,
    break_mode:
      ((shop as { break_mode?: string }).break_mode as
        | 'guaranteed'
        | 'not_guaranteed'
        | undefined) ?? 'guaranteed',
  }

  return (
    <ControlPanel
      shop={shopWithMode}
      initialBarbers={barbers ?? []}
      initialEntries={entries ?? []}
    />
  )
}
