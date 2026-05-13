import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const VALID = ['available', 'busy', 'break', 'offline'] as const
type Status = (typeof VALID)[number]

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params
  const body = await request.json()
  const newStatus: Status = body.status

  if (!VALID.includes(newStatus)) {
    return Response.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const supabase = await createClient()

  // Read the barber + their shop's config in parallel so we have everything
  // needed for the keep-position-on-break logic in one round trip.
  const { data: barber } = await supabase
    .from('barbers')
    .select(
      'id, shop_id, name, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
    )
    .eq('id', barber_id)
    .single()

  if (!barber) return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })

  // Idempotent guard: if the barber is already in the requested state,
  // do nothing. Prevents accidental double-taps from re-firing side
  // effects like resetting the break countdown, clearing break_held_since,
  // or auto-assigning the next client a second time.
  if (barber.status === newStatus) {
    return Response.json({
      barber,
      next_client: null,
      current_client: null,
      noop: true,
    })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select(
      'id, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes',
    )
    .eq('id', barber.shop_id)
    .single()

  if (!shop) return Response.json({ error: 'Shop no encontrado' }, { status: 404 })

  let nextClient: { id: string; client_name: string; position: number } | null = null
  let currentClient: { id: string; client_name: string; position: number } | null = null
  const now = new Date().toISOString()
  const fromStatus = barber.status as Status

  // Activity-log accumulator — flushed at the end so we don't insert
  // log rows for failed transitions.
  type LogEntry = {
    action:
      | 'state_change'
      | 'client_assigned'
      | 'position_kept'
      | 'position_lost'
      | 'shop_settings_changed'
    from_status?: string | null
    to_status?: string | null
    metadata?: Record<string, unknown>
  }
  const logs: LogEntry[] = []

  if (newStatus === 'available') {
    // Complete any in-progress client (barber finishing a cut). When
    // transitioning specifically from BUSY → AVAILABLE we ALSO sweep up
    // any stale 'called' entries still pointing to this barber — those
    // should have moved to 'in_progress' when they tapped BUSY, so if
    // they're still 'called' it means a transition was missed and the
    // client would otherwise stick visually.
    const statusesToComplete =
      fromStatus === 'busy' ? ['in_progress', 'called'] : ['in_progress']
    await supabase
      .from('queue_entries')
      .update({ status: 'done', completed_at: now })
      .eq('barber_id', barber_id)
      .in('status', statusesToComplete)

    // ── Returning from break: maybe restore position ──────────────
    let nextAvailableSince = now
    let positionRestored = false
    let elapsedMin: number | null = null
    let allowedMin: number | null = null

    if (fromStatus === 'break' && barber.break_held_since && barber.break_started_at) {
      const elapsedMs = Date.now() - new Date(barber.break_started_at).getTime()
      const elapsed = Math.floor(elapsedMs / 60000)
      // The break duration that applied at the moment break started (snapshot)
      // — falls back to the shop's first/next config if the column isn't set.
      const baseBreakMin =
        barber.break_minutes_at_start ??
        ((barber.breaks_taken_today ?? 1) <= 1
          ? shop.first_break_minutes
          : shop.next_break_minutes)
      const allowed = baseBreakMin + (shop.break_position_grace_minutes ?? 5)
      elapsedMin = elapsed
      allowedMin = allowed

      if (shop.keep_position_on_break && elapsed <= allowed) {
        nextAvailableSince = barber.break_held_since
        positionRestored = true
      }
    }

    await supabase
      .from('barbers')
      .update({
        status: 'available',
        available_since: nextAvailableSince,
        break_started_at: null,
        break_held_since: null,
        break_minutes_at_start: null,
      })
      .eq('id', barber_id)

    logs.push({
      action: 'state_change',
      from_status: fromStatus,
      to_status: 'available',
      metadata: { available_since: nextAvailableSince },
    })

    // Specifically log the position outcome when returning from break — this
    // is the single most useful signal in the activity log for resolving
    // "why did Carlos lose his spot?" disputes.
    if (fromStatus === 'break' && barber.break_held_since) {
      if (positionRestored) {
        logs.push({
          action: 'position_kept',
          metadata: {
            held_since: barber.break_held_since,
            elapsed_minutes: elapsedMin,
            allowed_minutes: allowedMin,
          },
        })
      } else if (shop.keep_position_on_break) {
        // Only log "lost" when the rule was enabled — otherwise there was
        // no position to keep, so "lost" is meaningless.
        logs.push({
          action: 'position_lost',
          metadata: {
            held_since: barber.break_held_since,
            elapsed_minutes: elapsedMin,
            allowed_minutes: allowedMin,
            reason: 'exceeded_grace',
          },
        })
      }
    }

    // Find next client: specifically requested first, then unassigned.
    const { data: requested } = await supabase
      .from('queue_entries')
      .select('id, client_name, position')
      .eq('shop_id', barber.shop_id)
      .eq('barber_id', barber_id)
      .eq('status', 'waiting')
      .order('position', { ascending: true })
      .limit(1)
      .maybeSingle()

    let next = requested

    if (!next) {
      const { data: unassigned } = await supabase
        .from('queue_entries')
        .select('id, client_name, position')
        .eq('shop_id', barber.shop_id)
        .is('barber_id', null)
        .eq('status', 'waiting')
        .order('position', { ascending: true })
        .limit(1)
        .maybeSingle()
      next = unassigned
    }

    if (next) {
      await supabase
        .from('queue_entries')
        .update({ status: 'called', barber_id, called_at: now })
        .eq('id', next.id)

      // Clear the barber's FIFO position — they have a called client now,
      // so they're out of the queue until that client sits down. Mirrors
      // the same behavior in /api/checkin so both auto-match paths produce
      // a consistent (status, available_since) state.
      await supabase
        .from('barbers')
        .update({ available_since: null })
        .eq('id', barber_id)

      nextClient = next
      logs.push({
        action: 'client_assigned',
        metadata: {
          client_name: next.client_name,
          queue_position: next.position,
          entry_id: next.id,
        },
      })
    }
  } else if (newStatus === 'busy') {
    const { data: called } = await supabase
      .from('queue_entries')
      .select('id, client_name, position')
      .eq('barber_id', barber_id)
      .eq('status', 'called')
      .maybeSingle()

    if (called) {
      await supabase
        .from('queue_entries')
        .update({ status: 'in_progress' })
        .eq('id', called.id)
      currentClient = called
    }

    await supabase
      .from('barbers')
      .update({ status: 'busy', available_since: null })
      .eq('id', barber_id)

    logs.push({
      action: 'state_change',
      from_status: fromStatus,
      to_status: 'busy',
      metadata: called
        ? { client_name: called.client_name, queue_position: called.position }
        : {},
    })
  } else if (newStatus === 'break') {
    const nextCount = (barber.breaks_taken_today ?? 0) + 1
    // Snapshot which break duration applies to THIS break — first or next.
    const breakMinutes =
      nextCount <= 1 ? shop.first_break_minutes : shop.next_break_minutes

    // If the rule is on AND the barber currently has a FIFO position,
    // park their available_since aside in break_held_since. Otherwise null.
    const heldSince =
      shop.keep_position_on_break &&
      fromStatus === 'available' &&
      barber.available_since
        ? barber.available_since
        : null

    await supabase
      .from('barbers')
      .update({
        status: 'break',
        available_since: null,
        break_started_at: now,
        break_held_since: heldSince,
        break_minutes_at_start: breakMinutes,
        breaks_taken_today: nextCount,
      })
      .eq('id', barber_id)

    logs.push({
      action: 'state_change',
      from_status: fromStatus,
      to_status: 'break',
      metadata: {
        break_number: nextCount,
        break_minutes: breakMinutes,
        held_position_since: heldSince,
      },
    })
  } else {
    // offline → reset the per-shift break counter and any held position
    await supabase
      .from('barbers')
      .update({
        status: 'offline',
        available_since: null,
        break_started_at: null,
        break_held_since: null,
        break_minutes_at_start: null,
        breaks_taken_today: 0,
      })
      .eq('id', barber_id)

    logs.push({
      action: 'state_change',
      from_status: fromStatus,
      to_status: 'offline',
      metadata: {},
    })
  }

  // Flush activity log entries. Best-effort — if logging fails for any
  // reason (RLS, network) we don't fail the user-facing operation.
  if (logs.length > 0) {
    const rows = logs.map(l => ({
      shop_id: barber.shop_id,
      barber_id: barber_id,
      action: l.action,
      from_status: l.from_status ?? null,
      to_status: l.to_status ?? null,
      metadata: l.metadata ?? {},
    }))
    await supabase.from('activity_log').insert(rows)
  }

  const { data: updated } = await supabase
    .from('barbers')
    .select(
      'id, name, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today',
    )
    .eq('id', barber_id)
    .single()

  return Response.json({
    barber: updated,
    next_client: nextClient,
    current_client: currentClient,
  })
}
