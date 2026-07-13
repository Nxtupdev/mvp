import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimited } from '@/lib/rate-limit'

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
  // Rate limit app-level por IP (abuso/flood casual). El límite es
  // generoso: un shop entero sale por la IP del WiFi del kiosco, así que
  // 20/min cubre un shop lleno pero corta un flood real. Ver rate-limit.ts.
  const rl = await checkRateLimit(request, 'checkin', { limit: 20, windowSeconds: 60 })
  if (!rl.ok) return rateLimited(rl.retryAfter)

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

  let phone = String(rawPhone).replace(/\D/g, '')
  // Normalizar a 10 dígitos: quitar el "1" del país si tecleó 11. Mantiene un
  // solo formato en la cola → coincide con las entradas de voz de Mamacita
  // (que llegan con el caller ID +1...), para que el check-in las active.
  if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1)
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

  // Migración 050 (seguridad): admin client en vez del anónimo. La
  // tabla `clients` y los UPDATE/INSERT de `queue_entries` dejaron de
  // ser públicos en RLS — el kiosko anónimo ya no tiene policy abierta.
  // Todas las validaciones (shop existe, is_open, cupo, rate limit
  // 3/día, campos requeridos) viven en ESTE código más abajo, así que
  // mover a admin no afecta ningún guarda: la seguridad sigue intacta
  // en la capa de aplicación, solo dejó de depender de policies
  // públicas que cualquiera podía explotar por el REST API directo.
  const supabase = createAdminClient()

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

  // Source is required on first visit (server-side gate that mirrors
  // the frontend gating in NewCustomerScreen). For returning clients
  // we ignore whatever they send — the column is first-visit-only.
  if (!isReturning && !source) {
    return Response.json(
      { error: 'source es requerido para nuevos clientes' },
      { status: 400 },
    )
  }

  // ── Daily rate limit per phone per shop (3 max) ─────────────
  // Re-implemented against the new client_id linkage. Falls back
  // to phone match for any legacy entries pre-migration 032.
  //
  // EXCEPCIÓN (presencia de voz): si este teléfono tiene una reserva de VOZ
  // pendiente (Mamacita: mamacita_entry_id no null, arrived_at null, waiting),
  // este check-in la ACTIVA en vez de crear una entrada nueva, así que NO
  // cuenta contra el límite diario. El cliente ya reservó por teléfono y solo
  // confirma que llegó — bloquearlo aquí lo dejaría fuera de su propio lugar.
  const { data: pendingVoiceForLimit } = await supabase
    .from('queue_entries')
    .select('id')
    .eq('shop_id', shop_id)
    .eq('client_phone', phone)
    .not('mamacita_entry_id', 'is', null)
    .is('arrived_at', null)
    .eq('status', 'waiting')
    .limit(1)
    .maybeSingle()

  if (!pendingVoiceForLimit) {
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

  // ── Voice reservation activation (voice-presence-spec.md) ───
  // Si este cliente reservó por teléfono con Mamacita y ahora llegó
  // físicamente, ya tiene una queue_entry pendiente (mamacita_entry_id
  // no nulo, arrived_at nulo, status waiting). En vez de crear una
  // SEGUNDA entrada, activamos esa: marcamos arrived_at = now y la
  // vinculamos al client_id. Conserva su posición original (la reservó
  // al llamar). Recién activada, entra al match inmediato de abajo igual
  // que un walk-in presente.
  const { data: pendingVoice } = await supabase
    .from('queue_entries')
    .select('*')
    .eq('shop_id', shop_id)
    .eq('client_phone', phone)
    .not('mamacita_entry_id', 'is', null)
    .is('arrived_at', null)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  const nowIso = new Date().toISOString()
  let entry: Record<string, unknown> & { id: string; position: number }

  if (pendingVoice) {
    const { data: activated, error: activateErr } = await supabase
      .from('queue_entries')
      .update({ arrived_at: nowIso, client_id: clientId })
      .eq('id', pendingVoice.id)
      .select()
      .single()
    if (activateErr || !activated) {
      console.error('[kiosk/checkin] voice activation failed', activateErr)
      return Response.json(
        { error: 'Error al activar tu reserva' },
        { status: 500 },
      )
    }
    entry = activated
  } else {
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

    const { data: created, error: entryErr } = await supabase
      .from('queue_entries')
      .insert({
        shop_id,
        client_id: clientId,
        client_name: displayName, // legacy column — TV display still reads it
        client_phone: phone, // legacy column — keeps daily rate limit working
        service_id: null, // service capture removed from the flow
        position,
        arrived_at: nowIso, // walk-ins are present at check-in time
      })
      .select()
      .single()

    if (entryErr || !created) {
      if (entryErr?.code === '23505') {
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
    entry = created
  }

  // Bump visit counters (best-effort — doesn't fail the request).
  await supabase.rpc('track_client_visit', { p_client_id: clientId })

  // ── Immediate match: assign to next free on-time barber ─────
  // Same logic as the legacy /api/checkin. Por defecto salta barberos
  // sancionados (sanctioned_until > now) — siguen visibles en FIFO pero
  // no reciben walk-ins durante la sanción (migración 047).
  //
  // EXCEPCIÓN (refinamiento operativo): si el único disponible es un
  // sancionado, igual le asignamos el walk-in. La sanción es disciplina
  // contra el barbero, no contra el cliente — no tiene sentido hacer
  // esperar al cliente cuando hay alguien literalmente sentado libre.
  // La sanción NO se levanta, solo deja de penalizar al cliente en
  // este caso específico.
  let assignedBarber: { id: string; name: string } | null = null
  let finalEntry = entry

  const matchNowIso = new Date().toISOString()
  let { data: nextBarber } = await supabase
    .from('barbers')
    .select('id, name, available_since')
    .eq('shop_id', shop_id)
    .eq('status', 'available')
    .not('available_since', 'is', null)
    .or(`sanctioned_until.is.null,sanctioned_until.lte.${matchNowIso}`)
    .order('available_since', { ascending: true })
    .limit(1)
    .maybeSingle()

  // Fallback a sancionado si nadie no-sancionado está disponible.
  // Solo afecta el caso "todos los no-sancionados están busy/break/offline
  // y solo queda el sancionado en available" — el resto del tiempo el
  // sancionado sigue saltado por la regla principal.
  if (!nextBarber) {
    const fallback = await supabase
      .from('barbers')
      .select('id, name, available_since')
      .eq('shop_id', shop_id)
      .eq('status', 'available')
      .not('available_since', 'is', null)
      .order('available_since', { ascending: true })
      .limit(1)
      .maybeSingle()
    nextBarber = fallback.data
  }

  if (nextBarber) {
    const now = new Date().toISOString()

    // Reclamo ATÓMICO del BARBERO: sacarlo de la fila SOLO si sigue libre
    // (available_since no null). Si dos check-ins concurrentes apuntan al
    // mismo barbero, la base serializa los updates: el primero gana
    // (available_since pasa a null), el segundo ya no lo encuentra libre y
    // NO lo reclama → ese cliente queda 'waiting'. Evita asignar dos
    // clientes al mismo barbero. Reclamamos el barbero ANTES de asignar el
    // cliente para no marcar al cliente como 'called' de un barbero que no
    // ganamos.
    const { data: claimedBarber } = await supabase
      .from('barbers')
      .update({ available_since: null })
      .eq('id', nextBarber.id)
      .not('available_since', 'is', null)
      .select('id')
      .maybeSingle()

    if (claimedBarber) {
      // Ganamos al barbero: asignar este cliente.
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

      if (updatedEntry) {
        finalEntry = updatedEntry
        assignedBarber = { id: nextBarber.id, name: nextBarber.name }
      }
    }
    // Si NO ganamos al barbero (otro check-in lo tomó primero), el cliente
    // queda 'waiting' (assignedBarber null) y la lógica de abajo lo reporta
    // como "en cola" — el siguiente barbero que se libere lo tomará.
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

  // ── Lista pública de clientes en cola ───────────────────────
  // Devolvemos los nombres (solo primer nombre — eso es lo que se
  // guarda en queue_entries.client_name desde el kiosk) en el orden
  // en que serán llamados. La SuccessScreen del kiosk muestra esta
  // lista como columna lateral para que el cliente recién registrado
  // vea su lugar entre los demás.
  //
  // Incluimos status='waiting' Y status='called' (los que ya fueron
  // llamados pero aún no se sientan en la silla). Excluimos
  // 'in_progress' porque esos ya están siendo atendidos — no son
  // "esperando". `position` lo recalculamos como 1-based del orden
  // visible (no usamos la columna position de la DB porque esa va
  // creciendo monótona durante el día y no representa "lugar en cola").
  const { data: queueListRows } = await supabase
    .from('queue_entries')
    .select('id, client_name, status')
    .eq('shop_id', shop_id)
    .in('status', ['waiting', 'called'])
    .order('position', { ascending: true })

  const queueList = (queueListRows ?? []).map((row, idx) => ({
    id: row.id,
    name: row.client_name,
    status: row.status,
    position: idx + 1,
  }))

  return Response.json({
    entry: finalEntry,
    client_id: clientId,
    is_returning: isReturning,
    display_name: displayName,
    queue_position: queuePosition,
    eta_minutes: etaMinutes,
    assigned_barber: assignedBarber,
    queue_list: queueList,
  })
}
