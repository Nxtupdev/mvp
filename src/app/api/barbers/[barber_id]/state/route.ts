import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'
import { buildBarberOrder } from '@/lib/queue-order'
import { validatePanelToken } from '@/lib/panel-token'

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
  // NXT TAP devices that have no cookies) OR an x-panel-token header from
  // a Centro de Mando temporary access link (migración 043). Device and
  // panel-token requests use a service-role client to bypass RLS — they're
  // gated entirely by the token check.
  const deviceToken = request.headers.get('x-device-token')
  const expectedDeviceToken = process.env.DEVICE_API_TOKEN
  const isDeviceRequest = Boolean(
    deviceToken && expectedDeviceToken && deviceToken === expectedDeviceToken,
  )
  if (deviceToken && !isDeviceRequest) {
    return Response.json({ error: 'Token de device inválido' }, { status: 401 })
  }

  // Panel token (Centro de Mando temporal). Si está presente y es válido,
  // devuelve el shop_id al que el token da acceso. Sin este header, la
  // ruta sigue funcionando exactamente igual que antes — owner cookie o
  // device token.
  const panelTokenHeader = request.headers.get('x-panel-token')
  const panelTokenShopId = panelTokenHeader
    ? await validatePanelToken(request)
    : null
  const isPanelTokenRequest = Boolean(panelTokenShopId)
  if (panelTokenHeader && !isPanelTokenRequest) {
    return Response.json({ error: 'Token de panel inválido o expirado' }, { status: 401 })
  }

  const supabase =
    isDeviceRequest || isPanelTokenRequest
      ? createAdminClient()
      : await createClient()

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

  // ── Scope-limit del panel token al shop del barbero ─────────
  // Un token del shop A NO puede cambiar barberos del shop B aunque
  // sea técnicamente válido. Esta es la garantía clave que hace que
  // los links de Centro de Mando sean seguros para compartir.
  if (isPanelTokenRequest && panelTokenShopId !== barber.shop_id) {
    return Response.json(
      { error: 'El token no tiene acceso a este barbero' },
      { status: 403 },
    )
  }

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
      'id, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, trusted_public_ip, break_mode, owner_id',
    )
    .eq('id', barber.shop_id)
    .single()

  if (!shop) return Response.json({ error: 'Shop no encontrado' }, { status: 404 })

  // ── Owner bypass: if the request comes from the authenticated owner
  // of this shop, they have administrative authority and don't need
  // to be on the shop's WiFi. This is what powers the /dashboard/
  // barbers/control "Centro de mando" view, where the dueño can
  // remotely flip a missing barber to OFFLINE/BREAK/etc.
  //
  // Device requests already bypass — this layers an additional bypass
  // on top for cookie-authenticated owners.
  let isOwnerRequest = false
  if (!isDeviceRequest) {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user && (shop as { owner_id?: string }).owner_id === user.id) {
      isOwnerRequest = true
    }
  }

  // ── Anti-cheat: presence-claim transitions need a WiFi check ─
  //
  // History v1: we used to gate only `→ available` ("can't claim a
  // turn from outside"). That left BUSY/BREAK/OFFLINE unprotected —
  // anyone with a barber's URL could remotely sabotage them. v2 we
  // moved to "gate ALL transitions" for safety.
  //
  // v3 (current): the v2 ALL-gate broke the real-life off-shop
  // workflow. Going on break — or clocking out for the day — BY
  // DEFINITION means leaving the shop. A barber walking to lunch
  // or heading home needs to update their status from wherever they
  // are (parking lot, restaurant WiFi, cellular). Forcing them to
  // remember BEFORE they walk out is unrealistic.
  //
  // So we split the targets by what they CLAIM:
  //   * available / busy → claim presence ("I'm here, ready") → gate
  //   * break / offline  → claim absence ("I'm not here") → no gate
  //
  // The owner ALWAYS bypasses regardless of target — they may need
  // to remotely mark a missing barber offline at end of day from
  // anywhere (Centro de mando workflow). That bypass is checked
  // separately above via isOwnerRequest.
  //
  // Sabotage exposure with offline relaxed: a competitor who somehow
  // grabbed a barber's URL could mark them offline mid-day from
  // outside. Mitigation: the barber sees it instantly on their PWA
  // and taps available to undo (which IS gated, so the attacker
  // can't toggle back to keep sabotaging). The owner can also
  // reverse via Centro de mando. Net: a 3-second hiccup, not a
  // sustainable attack.
  //
  // Bypasses (in order):
  //   1. The physical NXT TAP device — its token+shop_id pair is its
  //      presence proof (the device is bolted to the shop).
  //   2. The shop hasn't configured trusted_public_ip yet (null) — we
  //      keep the legacy behavior so existing shops don't break.
  //   3. The owner (Centro de mando), authenticated by cookie.
  //   4. Target is 'break' or 'offline' (the absence claims).
  const isAbsenceClaim = newStatus === 'break' || newStatus === 'offline'
  if (
    !isDeviceRequest &&
    !isOwnerRequest &&
    !isPanelTokenRequest &&
    !isAbsenceClaim &&
    shop.trusted_public_ip
  ) {
    const clientIp = getClientIp(request)
    if (!clientIp || clientIp !== shop.trusted_public_ip) {
      return Response.json(
        {
          // Wording stays user-facing instead of mentioning sabotage —
          // most of the time this fires on a legitimate barber who
          // just walked outside or is on cellular instead of WiFi.
          // Hint at break/offline being exempt so they don't get stuck.
          error:
            'Conéctate al WiFi de la barbería para volver a disponible o marcar busy. (Break y offline sí puedes tocarlos desde donde sea.)',
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
    // Mark in-progress / called clients as done for cleanup. We don't
    // gate the toll payment on this anymore — see comment below.
    await supabase
      .from('queue_entries')
      .update({ status: 'done', completed_at: now })
      .eq('barber_id', barber_id)
      .eq('status', 'in_progress')

    if (fromStatus === 'busy') {
      await supabase
        .from('queue_entries')
        .update({ status: 'done', completed_at: now })
        .eq('barber_id', barber_id)
        .eq('status', 'called')
    }

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

    // ── Pay late-arrival toll (migration 019, revised 023, 027) ──
    //
    // CRITICAL ordering: pay must run AFTER the barber UPDATE above.
    // Earlier we ran pay first, but the bump it does on
    // available_since (to keep the existing barber above the late
    // one — migration 022) was being clobbered by the UPDATE that
    // sets available_since = nextAvailableSince. Order fixed now.
    //
    // Counts any BUSY → AVAILABLE as 1 cut (no queue_entry required).
    // Most clients in DR/USA shops are walk-ins who never check in,
    // so requiring a queue_entry made the toll never decrement.
    // Gaming concern is weak: existing barbers don't WANT to clear
    // the late's toll faster (they prefer to keep the late blocked),
    // and the late can't pay their own toll.
    if (fromStatus === 'busy') {
      const { error: payErr } = await supabase.rpc('pay_late_arrival_toll', {
        p_existing_barber_id: barber_id,
      })
      if (payErr) {
        console.error('[late_arrival_toll] pay failed', {
          barber_id,
          error: payErr.message,
        })
      }
    }

    // ── Register late arrival if applicable (migrations 019, 031) ─
    //
    // Pre-fix this only ran on offline→available. That left a hack
    // open: a tardy barber could tap busy first (offline→busy) and
    // then go available (busy→available), and neither transition
    // matched the gate, so no peaje. Now we always trigger on any
    // path INTO 'available' and the SQL function decides whether to
    // actually create the toll:
    //
    //   * Gate 1: shop has no late_arrival_threshold_time → return 0
    //   * Gate 2: barber already had a state_change to 'available'
    //             today → return 0 (no double-charging on mid-day
    //             busy→available or break→available re-entries)
    //   * Gate 3: current local time < threshold → return 0
    //
    // So a legitimate mid-day busy→available (the barber was already
    // 'available' earlier today) trips Gate 2 and exits cleanly. A
    // barber who arrived before the threshold trips Gate 3. The only
    // path that creates rows is "first available of the day, after
    // the threshold" — which is exactly the rule.
    const { error: regErr } = await supabase.rpc('register_late_arrival', {
      p_barber_id: barber_id,
    })
    if (regErr) {
      console.error('[late_arrival_toll] register failed', {
        barber_id,
        fromStatus,
        toStatus: 'available',
        error: regErr.message,
      })
    }

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

    // ── Late-arrival gate (migration 019) ──────────────────────
    // If this barber is currently paying toll, do NOT auto-assign
    // them a client — that's the whole point of the toll. They
    // stay in the FIFO visually (orange) but the rotation skips
    // them until existing barbers each complete their N cuts.
    //
    // Re-read the counter AFTER register_late_arrival ran above
    // so we see the just-created toll rows.
    const { data: tollCheck } = await supabase
      .from('barbers')
      .select('late_toll_remaining')
      .eq('id', barber_id)
      .single()
    const lateToll = (tollCheck as { late_toll_remaining?: number } | null)
      ?.late_toll_remaining ?? 0

    // Find next client: specifically requested first, then unassigned.
    // SKIP this entire block if late-blocked.
    const { data: requested } = lateToll > 0
      ? { data: null }
      : await supabase
          .from('queue_entries')
          .select('id, client_name, position')
          .eq('shop_id', barber.shop_id)
          .eq('barber_id', barber_id)
          .eq('status', 'waiting')
          .order('position', { ascending: true })
          .limit(1)
          .maybeSingle()

    let next = requested

    if (!next && lateToll === 0) {
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
    // ── Close the offline→busy late-arrival hack ──────────────
    //
    // Before this check: a tardy barber could tap 'busy' first
    // from offline, then later go available, and nothing flagged
    // them as late. Now we also trigger the late check on any
    // path INTO 'busy' that isn't a mid-day available→busy.
    //
    // The SQL function's gates still apply (threshold null /
    // already-active-today / before-threshold), so a barber who
    // taps busy at 8:00 AM with a 9:00 AM threshold creates no
    // toll. Only "first presence of the day, after threshold"
    // produces rows. See the bigger comment in the available
    // branch above for the full rationale.
    if (fromStatus !== 'available') {
      const { error: regErr } = await supabase.rpc('register_late_arrival', {
        p_barber_id: barber_id,
      })
      if (regErr) {
        console.error('[late_arrival_toll] register failed', {
          barber_id,
          fromStatus,
          toStatus: 'busy',
          error: regErr.message,
        })
      }
    }

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
    //
    // ── Reasignar clientes colgados (migración 040) ────────────
    // ANTES del UPDATE del barbero, mover sus queue_entries en
    // called/in_progress al próximo barbero disponible (o de vuelta
    // a waiting si no hay nadie libre). Sin esto, un cliente
    // asignado al barbero que se va offline quedaba en el aire —
    // 'called' eventualmente lo agarraba el cascade del 018 (tras
    // 2 min) pero 'in_progress' quedaba para siempre.
    const { error: reassignErr } = await supabase.rpc(
      'reassign_barber_clients_on_offline',
      { p_barber_id: barber_id },
    )
    if (reassignErr) {
      console.error('[state/offline] reassign failed', {
        barber_id,
        error: reassignErr.message,
      })
      // Best-effort: continuamos con el offline aunque la reasignación
      // haya fallado, para no dejar al barbero atrapado en su estado
      // actual. El cron del 018 sigue siendo un fallback para los
      // 'called' colgados.
    }

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

    // ── Clear late-arrival toll (migration 019) ────────────────
    // Going offline = "I'm out". Two cleanups happen:
    //   1. If this barber was paying toll: they give up the wait,
    //      their toll rows are deleted.
    //   2. If other barbers were waiting on THIS one to complete
    //      cuts: those obligations vanish (they unblock partially).
    // The SQL function handles both directions.
    const { error: clearErr } = await supabase.rpc('clear_late_arrival_toll', {
      p_barber_id: barber_id,
    })
    if (clearErr) {
      console.error('[late_arrival_toll] clear failed', {
        barber_id,
        error: clearErr.message,
      })
    }

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
  //
  // ── ALWAYS use admin client for activity_log inserts ──
  // The previous version used `supabase` (which is the cookie-auth
  // client for owner/PWA paths). RLS on activity_log was silently
  // rejecting those inserts — so a busy 8-barber shop generated only
  // ~10 events/day visible in the dashboard. The cron functions
  // (idle_timeout, cascade) were unaffected because they run as
  // SECURITY DEFINER and bypass RLS.
  //
  // activity_log is an audit table. It should ALWAYS get the insert,
  // regardless of which user is causing the state change. Using the
  // admin client unconditionally here matches the same model used by
  // the device RPC path.
  if (logs.length > 0) {
    const adminLogger = createAdminClient()
    const rows = logs.map(l => ({
      shop_id: barber.shop_id,
      barber_id: barber_id,
      action: l.action,
      from_status: l.from_status ?? null,
      to_status: l.to_status ?? null,
      metadata: l.metadata ?? {},
    }))
    const { error: logError } = await adminLogger.from('activity_log').insert(rows)
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
