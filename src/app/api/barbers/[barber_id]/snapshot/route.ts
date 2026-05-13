import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildBarberOrder, buildHeldPositions } from '@/lib/queue-order'

/**
 * Device-friendly snapshot of a single barber's state.
 *
 * Designed for the NXT TAP hardware to poll every ~2s. Returns the smallest
 * payload the device needs to render its 3-button screen without any further
 * round trips.
 *
 * Auth: either owner cookies (web simulator) OR x-device-token header.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params

  const deviceToken = request.headers.get('x-device-token')
  const expectedDeviceToken = process.env.DEVICE_API_TOKEN
  const isDeviceRequest = Boolean(
    deviceToken && expectedDeviceToken && deviceToken === expectedDeviceToken,
  )
  if (deviceToken && !isDeviceRequest) {
    return Response.json({ error: 'Token de device inválido' }, { status: 401 })
  }
  const supabase = isDeviceRequest ? createAdminClient() : await createClient()

  // Pull the barber + every peer in the shop so we can compute FIFO and
  // held positions. The peers query is small (≤ a few dozen rows in any
  // real shop) and lets us return the position in a single round trip.
  const { data: barber } = await supabase
    .from('barbers')
    .select(
      'id, shop_id, name, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
    )
    .eq('id', barber_id)
    .single()

  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }

  const [
    { data: shop },
    { data: peers },
    { data: calledRow },
    { data: currentRow },
  ] = await Promise.all([
    supabase
      .from('shops')
      .select(
        'first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes',
      )
      .eq('id', barber.shop_id)
      .single(),
    supabase
      .from('barbers')
      .select('id, status, available_since, break_held_since')
      .eq('shop_id', barber.shop_id),
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

  if (!shop) {
    return Response.json({ error: 'Shop no encontrado' }, { status: 404 })
  }

  // Ensure the barber's own row is in the peers list with the freshest
  // status, then compute positions.
  const peersList = (peers ?? []).map(p =>
    p.id === barber.id
      ? {
          id: barber.id,
          status: barber.status,
          available_since: barber.available_since,
          break_held_since: barber.break_held_since,
        }
      : p,
  )
  const fifoPosition = buildBarberOrder(peersList).get(barber.id) ?? null
  const heldPosition = buildHeldPositions(peersList).get(barber.id) ?? null

  return Response.json({
    barber: {
      id: barber.id,
      name: barber.name,
      status: barber.status,
      breaks_taken_today: barber.breaks_taken_today ?? 0,
      break_started_at: barber.break_started_at,
      break_minutes_at_start: barber.break_minutes_at_start,
    },
    shop: {
      first_break_minutes: shop.first_break_minutes,
      next_break_minutes: shop.next_break_minutes,
      keep_position_on_break: shop.keep_position_on_break,
      break_position_grace_minutes: shop.break_position_grace_minutes,
    },
    fifo_position: fifoPosition,
    held_position: heldPosition,
    called_client: calledRow
      ? { name: calledRow.client_name, position: calledRow.position }
      : null,
    current_client: currentRow
      ? { name: currentRow.client_name, position: currentRow.position }
      : null,
    server_time: new Date().toISOString(),
  })
}
