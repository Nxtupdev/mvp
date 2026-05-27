import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { KioskApp } from './KioskApp'

/**
 * NXTUP Check-In Kiosk — Server entrypoint.
 *
 * Route: /kiosk/[shop_id]
 *
 * Loaded by the tablet mounted at the shop entrance, and also reachable
 * by customers scanning the QR code on their phone (responsive). Keeps
 * the legacy /q/[shop_id] flow intact while we roll out the redesign.
 *
 * Only shop metadata + the current waiting count are fetched here. All
 * subsequent state (selected language, phone, name, service, source)
 * lives in the client component KioskApp.
 *
 * Design spec: planning/design/checkin-kiosk-spec.md
 * Sample reference: planning/design/samples/splash-screen.tsx
 */
export default async function KioskPage({
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

  // Three queries in parallel:
  //   1. waiting count for the persistent header
  //   2. services catalog (filtered to active, ordered by sort_order)
  //      — drives the service grid on the new/returning customer screens
  //   3. (future) realtime channel for live header updates
  const [{ count: waitingCount }, { data: services }] = await Promise.all([
    supabase
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shop_id)
      .eq('status', 'waiting'),
    supabase
      .from('services')
      .select('id, name, duration_minutes')
      .eq('shop_id', shop_id)
      .eq('active', true)
      .order('sort_order', { ascending: true }),
  ])

  return (
    <KioskApp
      shop={shop}
      services={services ?? []}
      initialWaitingCount={waitingCount ?? 0}
    />
  )
}
