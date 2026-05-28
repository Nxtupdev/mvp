import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Kiosk check-in v2 — combined upsert-client + create-queue-entry.
 *
 * Route: POST /api/kiosk/checkin
 *
 * Replaces the legacy /api/checkin for the new kiosk flow. Differences:
 *
 *   * Phone is REQUIRED (the new flow always captures it; clients
 *     get persisted across visits).
 *   * Creates a row in `clients` if first visit; updates last_visit_at
 *     + total_visits on returning customers via the
 *     `track_client_visit` RPC.
 *   * Returns position + ETA + display_name + assigned_barber + is_returning
 *     so the SuccessScreen has everything it needs in one round-trip.
 *
 * What it preserves from the legacy endpoint:
 *   * Shop open/closed check
 *   * Queue-size cap (shop.max_queue_size)
 *   * Phone-based daily rate limit (3 check-ins per day per shop)
 *   * Immediate barber match if a free, on-time barber is waiting
 *   * Toll-aware: barbers paying late toll are skipped for auto-match
 *
 * Body:
 *   {
 *     shop_id: uuid,
 *     phone: string (10+ digits, any formatting OK),
 *     first_name?: string,     // required for new customers
 *     source?: ReferralSource, // captured only on first visit
 *     preferred_language?: 'es' | 'en'  // persisted for next time
 *   }
 *
 * Response shape:
 *   200 {
 *     entry: { id, position, status, ... },
 *     client_id: uuid,
 *     is_returning: boolean,
 *     display_name: string,          // first_name from client row
 *     queue_position: number,        // 1-based, 1 means immediately
 *                                    //   matched to a barber
 *     eta_minutes: { min, max },
 *     assigned_barber: { id, name } | null
 *   }
 */

type ReferralSource =
  | 'walk-by'
  | 'google'
  | 'instagram'
  | 'tiktok'
  | 'friend'
  | 'other'

type CheckInBody = {
  shop_id?: string
  phone?: string
  first_name?: string
  source?: ReferralSource | null
  preferred_language?: 'es' | 'en'
}

const VALID_SOURCES: ReferralSource[] = [
  'walk-by',
  'google',
  'instagram',
  'tiktok',
  'friend',
  'other',
]

/** Same heuristic as the kiosk frontend's ETA estimator. Replace
 *  later with a service-duration-aware calculation. */
function estimateEta(positionsAhead: number): { min: number; max: number } {
  if (positionsAhead <= 0) return { min: 0, max: 0 }
  return {
    min: Math.max(1, Math.floor(positionsAhead * 6)),
    max: Math.max(1, Math.ceil(positionsAhead * 10)),
  }
}

export async function POST(request: NextRequest) {
  let body: CheckInBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { shop_id, first_name, source, preferred_language } = body
  const rawPhone = body.phone

  if (!shop_id || !rawPhone) {
    return Response.json({ error: 'shop_id y phone son requeridos' }, { status: 400 })
  }

  const phone = String(rawPhone).replace(/\D/g, '')
  if (phone.length < 10) {
    return Response.json(
      { error: 'Teléfono inválido — mínimo 10 dígitos' },
      { status: 400 },
    )
  }

  if (source && !VALID_SOURCES.includes(source)) {
    return Response.json({ error: 'source inválido' }, { status: 400 })
  }

  const lang =
    preferred_language === 'es' || preferred_language === 'en'
      ? preferred_language
      : 'es'

  const supabase = await createClient()

  // ── Shop existence + open/cap gates ─────────────────────────
  const { data: shop } = await supabase
    .from('shops')
    .select('id, is_open, max_queue_size')
    .eq('id', shop_id)
    .single()

  if (!shop) return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  if (!shop.is_open) {
    return Response.json({ error: 'La barbería está cerrada' }, { status: 409 })
  }

  const { count: queueCount } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shop_id)
    .in('status', ['waiting', 'called', 'in_progress'])

  if (queueCount !== null && queueCount >= shop.max_queue_size) {
    return Response.json({ error: 'La cola está llena' }, { status: 409 })
  }

  // ── Look up existing client to decide new vs returning ──────
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id, first_name')
    .eq('shop_id', shop_id)
    .eq('phone_number', phone)
    .maybeSingle()

  const isReturning = Boolean(existingClient)

  if (!isReturning && (!first_name || !first_name.trim())) {
    return Response.json(
      { error: 'first_name es requerido para nuevos clientes' },
      { status: 400 },
    )
  }

  // ── Daily rate limit per phone per shop (3 max) ─────────────
  // Re-implemented against the new client_id linkage. Falls back
  // to phone match for any legacy entries pre-migration 032.
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const { count: todayCount } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shop_id)
    .eq('client_phone', phone)
    .gte('created_at', todayStart.toISOString())

  if (todayCount !== null && todayCount >= 3) {
    return Response.json(
      { error: 'Máximo 3 check-ins por día en esta barbería' },
      { status: 429 },
    )
  }

  // ── Upsert client ────────────────────────────────────────────
  // For new customers: insert with first_name + source + lang.
  // For returning customers: only refresh preferred_language (the
  // owner explicitly decided source is first-visit-only, so we
  // don't overwrite it). track_client_visit increments visit
  // counters and refreshes last_visit_at separately, after the
  // queue_entry is created.
  let clientId: string
  let displayName: string

  if (isReturning) {
    clientId = existingClient!.id
    displayName = existingClient!.first_name

    // Touch preferred_language in case the customer picked a
    // different language this visit. Doesn't fail the request if
    // the update fails (best-effort).
    await supabase
      .from('clients')
      .update({ preferred_language: lang, updated_at: new Date().toISOString() })
      .eq('id', clientId)
  } else {
    const trimmedName = first_name!.trim()
    const { data: newClient, error: insertErr } = await supabase
      .from('clients')
      .insert({
        shop_id,
        phone_number: phone,
        first_name: trimmedName,
        preferred_language: lang,
        referral_source: source ?? null,
      })
      .select('id, first_name')
      .single()

    if (insertErr || !newClient) {
      // 23505 = unique violation — race condition where another
      // request created the same (shop_id, phone) row between our
      // lookup and insert. Re-fetch the existing row and proceed
      // as if returning customer.
      if (insertErr?.code === '23505') {
        const { data: raceClient } = await supabase
          .from('clients')
          .select('id, first_name')
          .eq('shop_id', shop_id)
          .eq('phone_number', phone)
          .single()
        if (!raceClient) {
          return Response.json(
            { error: 'No se pudo crear el cliente' },
            { status: 500 },
          )
        }
        clientId = raceClient.id
        displayName = raceClient.first_name
      } else {
        console.error('[kiosk/checkin] client insert failed', insertErr)
        return Response.json(
          { error: 'No se pudo crear el cliente' },
          { status: 500 },
        )
      }
    } else {
      clientId = newClient.id
      displayName = newClient.first_name
    }
  }

  // ── Create queue_entry ──────────────────────────────────────
  // Calculate position as max+1 within the active pipeline
  // (matching the legacy /api/checkin behavior).
  const { data: maxEntry } = await supabase
    .from('queue_entries')
    .select('position')
    .eq('shop_id', shop_id)
    .in('status', ['waiting', 'called', 'in_progress'])
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (maxEntry?.position ?? 0) + 1

  const { data: entry, error: entryErr } = await supabase
    .from('queue_entries')
    .insert({
      shop_id,
      client_id: clientId,
      client_name: displayName, // legacy column — TV display still reads it
      client_phone: phone, // legacy column — keeps daily rate limit working
      service_id: null, // service capture removed from the flow
      position,
    })
    .select()
    .single()

  if (entryErr) {
    if (entryErr.code === '23505') {
      return Response.json(
        { error: 'Conflicto de posición, intenta de nuevo' },
        { status: 409 },
      )
    }
    console.error('[kiosk/checkin] queue_entry insert failed', entryErr)
    return Response.json(
      { error: 'Error al registrar en la cola' },
      { status: 500 },
    )
  }

  // Bump visit counters (best-effort — doesn't fail the request).
  await supabase.rpc('track_client_visit', { p_client_id: clientId })

  // ── Immediate match: assign to next free on-time barber ─────
  // Same logic as the legacy /api/checkin. Skips barbers paying
  // late toll (late_toll_remaining > 0) — they show in FIFO but
  // don't receive walk-ins until they've worked off the toll.
  let assignedBarber: { id: string; name: string } | null = null
  let finalEntry = entry

  const { data: nextBarber } = await supabase
    .from('barbers')
    .select('id, name, available_since')
    .eq('shop_id', shop_id)
    .eq('status', 'available')
    .not('available_since', 'is', null)
    .eq('late_toll_remaining', 0)
    .order('available_since', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (nextBarber) {
    const now = new Date().toISOString()
    const { data: updatedEntry } = await supabase
      .from('queue_entries')
      .update({
        status: 'called',
        barber_id: nextBarber.id,
        called_at: now,
      })
      .eq('id', entry.id)
      .select()
      .single()

    await supabase
      .from('barbers')
      .update({ available_since: null })
      .eq('id', nextBarber.id)

    if (updatedEntry) {
      finalEntry = updatedEntry
      assignedBarber = { id: nextBarber.id, name: nextBarber.name }
    }
  }

  // ── Compute final position + ETA returned to the kiosk ──────
  // If we just matched a barber, the customer is "next" (effectively
  // position 1 with ~0 wait). Otherwise their wait is proportional
  // to how many are ahead of them.
  const queuePosition = assignedBarber
    ? 1
    : (queueCount ?? 0) + 1 // includes their own freshly-inserted row
  const positionsAhead = assignedBarber ? 0 : queueCount ?? 0
  const etaMinutes = estimateEta(positionsAhead)

  return Response.json({
    entry: finalEntry,
    client_id: clientId,
    is_returning: isReturning,
    display_name: displayName,
    queue_position: queuePosition,
    eta_minutes: etaMinutes,
    assigned_barber: assignedBarber,
  })
}
