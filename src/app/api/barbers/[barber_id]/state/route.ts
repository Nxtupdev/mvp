import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'
import { buildBarberOrder } from '@/lib/queue-order'

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

  // Auth: either the request carries owner cookies (web flow) OR an
  // x-device-token header that matches the global DEVICE_API_TOKEN (hardware
  // NXT TAP devices that have no cookies). Device-token requests use a
  // service-role client to bypass RLS — gated entirely by the token check.
  const deviceToken = request.headers.get('x-device-token')
  const expectedDeviceToken = process.env.DEVICE_API_TOKEN
  const isDeviceRequest = Boolean(
    deviceToken && expectedDeviceToken && deviceToken === expectedDeviceToken,
  )
  if (deviceToken && !isDeviceRequest) {
    return Response.json({ error: 'Token de device inválido' }, { status: 401 })
  }
  const supabase = isDeviceRequest ? createAdminClient() : await createClient()

  // Read the barber + their shop's config in parallel so we have everything
  // needed for the keep-position-on-break logic in one round trip.
  const { data: barber } = await supabase
    .from('barbers')
    .select(
      'id, shop_id, name, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidating_barber_ids, break_invalidated',
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
      'id, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, trusted_public_ip, break_mode',
    )
    .eq('id', barber.shop_id)
    .single()

  if (!shop) return Response.json({ error: 'Shop no encontrado' }, { status: 404 })

  // ── Anti-cheat: only ACTIVE transitions need a presence check ──
  // Going TO 'available' is the cheating vector — that's how a barber
  // claims a FIFO position. Going TO busy/break/offline loses position,
  // so we let those happen from anywhere.
  //
  // Bypasses (in order):
  //   1. The physical NXT TAP device — its token+shop_id pair is its
  //      presence proof (the device is bolted to the shop).
  //   2. The shop hasn't configured trusted_public_ip yet (null) — we
  //      keep the legacy behavior so existing shops don't break.
  //
  // Otherwise: the request's public IP must match shop.trusted_public_ip
  // exactly. The owner registers that IP from inside the shop in Settings.
  if (newStatus === 'available' && !isDeviceRequest && shop.trusted_public_ip) {
    const clientIp = getClientIp(request)
    if (!clientIp || clientIp !== shop.trusted_public_ip) {
      return Response.json(
        {
          error:
            'Conectate al WiFi de la barbería para entrar a la fila',
          code: 'not_in_shop',
          client_ip: clientIp,
        },
        { status: 403 },
      )
    }
  }

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

    // ── Invalidate on-break reservations under 'not_guaranteed' ────
    // If this barber just finished a walk-in (canonical busy → available
    // transition), any other barber currently on break in the same shop
    // who had THIS barber in their below-snapshot loses their hold.
    // We don't gate on shop.break_mode here because non-not_guaranteed
    // shops never populate `break_invalidating_barber_ids` to begin
    // with — the `contains` predicate is a natural no-op for them.
    if (fromStatus === 'busy') {
      const { error: invalidateErr } = await supabase
        .from('barbers')
        .update({ break_invalidated: true })
        .eq('shop_id', barber.shop_id)
        .eq('status', 'break')
        .eq('break_invalidated', false)
        .contains('break_invalidating_barber_ids', [barber_id])
      if (invalidateErr) {
        // Soft-fail: don't block the barber's own state change just
        // because we couldn't flag others. Surface to logs so we
        // notice if the migration hasn't been run yet.
        console.error('[break_invalidated] update failed', {
          shop_id: barber.shop_id,
          completing_barber: barber_id,
          code: invalidateErr.code,
          message: invalidateErr.message,
        })
      }
    }

    // ── Returning from break: maybe restore position ──────────────
    //
    // Two ways to lose the reservation:
    //   1. Exceeded break_minutes + grace (the original rule).
    //   2. shop.break_mode = 'not_guaranteed' AND someone below took
    //      a walk-in to completion while we were away — the API set
    //      `break_invalidated = true` on this row when that happened.
    //
    // Note: we no longer gate on `shop.keep_position_on_break`. The
    // user dropped the "always-lose" mode in favour of the two modes
    // 'guaranteed' and 'not_guaranteed', so any shop on either mode
    // gives reservations by default. Existing shops with the legacy
    // toggle off will silently behave as 'guaranteed'.
    let nextAvailableSince = now
    let positionRestored = false
    let elapsedMin: number | null = null
    let allowedMin: number | null = null
    let lostReason: 'exceeded_grace' | 'invalidated_by_below' | null = null

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

      const overTime = elapsed > allowed
      const invalidatedByBelow = barber.break_invalidated === true

      if (!overTime && !invalidatedByBelow) {
        nextAvailableSince = barber.break_held_since
        positionRestored = true
      } else {
        // Prefer the more informative reason if both apply: "you got
        // bumped by a coworker who actually worked" is more actionable
        // than "you ran out the clock."
        lostReason = invalidatedByBelow ? 'invalidated_by_below' : 'exceeded_grace'
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
        // Clear the not-guaranteed bookkeeping too — these only have
        // meaning while the barber is in 'break'.
        break_invalidating_barber_ids: [],
        break_invalidated: false,
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
            break_mode: shop.break_mode,
          },
        })
      } else {
        logs.push({
          action: 'position_lost',
          metadata: {
            held_since: barber.break_held_since,
            elapsed_minutes: elapsedMin,
            allowed_minutes: allowedMin,
            reason: lostReason ?? 'exceeded_grace',
            break_mode: shop.break_mode,
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

    // Park their available_since aside in break_held_since whenever
    // they had a position. Both 'guaranteed' and 'not_guaranteed'
    // modes give reservations on entry; the difference is only in
    // whether the reservation can be invalidated by below-barbers.
    const heldSince =
      fromStatus === 'available' && barber.available_since
        ? barber.available_since
        : null

    // For 'not_guaranteed' mode: snapshot which barbers were below
    // this one in the live FIFO at this exact moment. We need to do
    // this BEFORE the status update because once we flip to 'break'
    // the barber stops appearing in the FIFO and the snapshot would
    // be ambiguous. Below = any active barber whose FIFO position is
    // greater than ours.
    let invalidatingIds: string[] = []
    if (shop.break_mode === 'not_guaranteed' && heldSince) {
      const { data: peers } = await supabase
        .from('barbers')
        .select('id, status, available_since')
        .eq('shop_id', barber.shop_id)
      if (peers) {
        const order = buildBarberOrder(
          peers as { id: string; status: string; available_since: string | null }[],
        )
        const myPos = order.get(barber_id)
        if (myPos !== undefined) {
          // Anyone with a strictly larger FIFO position is "below" us.
          invalidatingIds = Array.from(order.entries())
            .filter(([id, pos]) => id !== barber_id && pos > myPos)
            .map(([id]) => id)
        }
      }
    }

    await supabase
      .from('barbers')
      .update({
        status: 'break',
        available_since: null,
        break_started_at: now,
        break_held_since: heldSince,
        break_minutes_at_start: breakMinutes,
        breaks_taken_today: nextCount,
        // Snapshot (possibly empty) of who could bump us. Always set
        // explicitly so a previous break's stale snapshot can't leak.
        break_invalidating_barber_ids: invalidatingIds,
        break_invalidated: false,
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
        break_mode: shop.break_mode,
        invalidating_barbers_count: invalidatingIds.length,
      },
    })
  } else {
    // offline → reset the per-shift break counter and any held position.
    // Also wipe the not-guaranteed bookkeeping so an upcoming break
    // starts from a clean slate.
    await supabase
      .from('barbers')
      .update({
        status: 'offline',
        available_since: null,
        break_started_at: null,
        break_held_since: null,
        break_minutes_at_start: null,
        breaks_taken_today: 0,
        break_invalidating_barber_ids: [],
        break_invalidated: false,
      })
      .eq('id', barber_id)

    logs.push({
      action: 'state_change',
      from_status: fromStatus,
      to_status: 'offline',
      metadata: {},
    })
  }

  // Flush activity log entries. Best-effort — failure here doesn't break
  // the user-facing state change, but we surface the error to Vercel logs
  // so we can diagnose silent RLS / schema issues.
  if (logs.length > 0) {
    const rows = logs.map(l => ({
      shop_id: barber.shop_id,
      barber_id: barber_id,
      action: l.action,
      from_status: l.from_status ?? null,
      to_status: l.to_status ?? null,
      metadata: l.metadata ?? {},
    }))
    const { error: logError } = await supabase.from('activity_log').insert(rows)
    if (logError) {
      console.error('[activity_log] insert failed', {
        shop_id: barber.shop_id,
        barber_id,
        action_count: rows.length,
        code: logError.code,
        message: logError.message,
        details: logError.details,
        hint: logError.hint,
      })
    }
  }

  const { data: updated } = await supabase
    .from('barbers')
    .select(
      'id, name, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
    )
    .eq('id', barber_id)
    .single()

  return Response.json({
    barber: updated,
    next_client: nextClient,
    current_client: currentClient,
  })
}
