import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyMamacitaBearer } from '@/lib/mamacita'

/**
 * GET /api/mamacita/availability?shop_id=<uuid>
 *
 * Live shop state for Mamacita's voice agent to answer "is anyone free?"
 * / "how long is the wait?" during a phone call. Must be fast (<500ms) —
 * it's in the conversational critical path.
 *
 * Auth: Authorization: Bearer <MAMACITA_SHARED_SECRET>
 *
 * Response 200:
 *   {
 *     shop_id, is_open,
 *     professionals_available, professionals_busy,
 *     queue_waiting, estimated_wait_minutes
 *   }
 *
 * Mapping notes:
 *   - "available" barbers = status 'available' (the ones who can take the
 *     next walk-in). Sanctioned barbers still count as available capacity
 *     for the wait estimate but the agent doesn't need that nuance.
 *   - "busy" = status 'busy' (mid-cut). 'break'/'offline' don't count as
 *     capacity.
 *   - queue_waiting = entries in 'waiting' or 'called' (called = summoned
 *     but not yet in the chair, still effectively ahead of new arrivals).
 *   - ETA mirrors the kiosk heuristic: ~6-10 min per person ahead, divided
 *     across the barbers who can serve (available + busy), min 1 if anyone
 *     is working.
 */
export async function GET(request: NextRequest) {
  if (!verifyMamacitaBearer(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const shopId = request.nextUrl.searchParams.get('shop_id')
  if (!shopId) {
    return Response.json({ error: 'shop_id requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('id, is_open')
    .eq('id', shopId)
    .maybeSingle()

  if (!shop) {
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  }

  const [{ data: barbers }, { count: queueWaiting }] = await Promise.all([
    supabase.from('barbers').select('status').eq('shop_id', shopId),
    supabase
      .from('queue_entries')
      .select('*', { count: 'exact', head: true })
      .eq('shop_id', shopId)
      .in('status', ['waiting', 'called']),
  ])

  const available = (barbers ?? []).filter(b => b.status === 'available').length
  const busy = (barbers ?? []).filter(b => b.status === 'busy').length

  const waiting = queueWaiting ?? 0
  const servingCapacity = Math.max(1, available + busy)
  // Per-person 6-10 min midpoint = 8, spread across working barbers.
  const estimatedWaitMinutes =
    available > 0 && waiting === 0
      ? 0
      : Math.round((waiting * 8) / servingCapacity)

  return Response.json({
    shop_id: shopId,
    is_open: shop.is_open,
    professionals_available: available,
    professionals_busy: busy,
    queue_waiting: waiting,
    estimated_wait_minutes: estimatedWaitMinutes,
  })
}
