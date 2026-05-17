import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import BarberDashboard from './BarberDashboard'

/**
 * Per-page metadata override. Two reasons we need this on the barber
 * page specifically:
 *
 * 1. PWA manifest: points at /api/manifest/barber/[shop]/[id] so the
 *    installed home-screen icon opens DIRECTLY into the barber's
 *    dashboard instead of falling through to the global landing
 *    via the default manifest's start_url.
 *
 * 2. apple-mobile-web-app-title: iOS Safari reads this for the label
 *    under the icon after "Add to Home Screen". Showing the shop
 *    name makes the icon feel like a real app for that shop, not a
 *    generic NXTUP install.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shop_id: string; barber_id: string }>
}): Promise<Metadata> {
  const { shop_id, barber_id } = await params

  // Best-effort lookup so the install prompt and icon label show the
  // shop name. If anything errors we fall back to plain "NXTUP" — the
  // dashboard still functions.
  let shopName = 'NXTUP'
  try {
    const supabase = await createClient()
    const { data } = await supabase
      .from('shops')
      .select('name')
      .eq('id', shop_id)
      .maybeSingle()
    if (data?.name) shopName = data.name
  } catch {
    // ignore — defaults are fine
  }

  return {
    title: `${shopName} — Mi panel`,
    manifest: `/api/manifest/barber/${shop_id}/${barber_id}`,
    appleWebApp: {
      capable: true,
      title: shopName,
      statusBarStyle: 'black-translucent',
    },
  }
}

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

  const [
    { data: barber },
    { data: shop },
    { data: peers },
    { count: cutsToday },
    { data: shopAvatars },
  ] = await Promise.all([
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
      // break_mode is read from the new migration 014 column. Older
      // rows that haven't migrated yet return null — handled below.
      .select(
        'id, name, logo_url, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, break_mode',
      )
      .eq('id', shop_id)
      .single(),
    supabase
      .from('barbers')
      .select(
        'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
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
    // shop_avatars (migration 015). Returns empty if the table is
    // missing on older deploys — falls through to generics-only.
    supabase
      .from('shop_avatars')
      .select('id, label, image_url, sort_order')
      .eq('shop_id', shop_id)
      .order('sort_order', { ascending: true }),
  ])

  if (!barber || !shop) notFound()

  // Defensive default for shops that haven't run migration 014 yet —
  // keeps the dashboard rendering correctly with the safest behavior
  // ('guaranteed' = current/legacy semantics).
  const shopWithMode = {
    ...shop,
    break_mode:
      ((shop as { break_mode?: string }).break_mode as
        | 'guaranteed'
        | 'not_guaranteed'
        | undefined) ?? 'guaranteed',
  }

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
      shop={shopWithMode}
      initialBarber={barber}
      initialPeers={peers ?? []}
      initialCalledClient={calledClient}
      initialCurrentClient={currentClient}
      initialCutsToday={cutsToday ?? 0}
      shopAvatars={shopAvatars ?? []}
    />
  )
}
