import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { verifyMamacitaSignature } from '@/lib/mamacita'

/**
 * POST /api/mamacita/queue-entries
 *
 * Mamacita's voice agent pushes a caller into the NXTUP queue after they
 * confirm on the phone that they're coming in. The caller is NOT yet
 * physically present — they're about to travel to the shop.
 *
 * Auth: Bearer <MAMACITA_SHARED_SECRET> + HMAC (see lib/mamacita.ts).
 *
 * Body:
 *   {
 *     external_id: uuid,      // queue_entries.id in Mamacita's DB
 *     shop_id: uuid,          // NXTUP shop id
 *     customer_name: string,
 *     customer_phone: string,
 *     source: 'voice',
 *     check_in_code: string,  // 4 chars Mamacita already sent via WhatsApp
 *     eta_at?: string         // ISO/UTC; hora estimada de llegada (se guarda + se muestra en el TV)
 *   }
 *
 * Response 200: { nxtup_entry_id, position }
 *
 * ── DECISIÓN DE PRODUCTO PENDIENTE (presencia) ──────────────────────
 * A diferencia del kiosk check-in, este endpoint NO hace match inmediato
 * a un barbero libre y NO promueve la entrada a 'called'. Razón: el cliente
 * de Mamacita todavía NO está en la barbería — acaba de colgar el teléfono
 * y viene en camino. Si lo asignáramos a 'called' como el kiosk, el cron
 * de no-show (cascade) lo sacaría de la cola antes de que llegue.
 *
 * La entrada queda en 'waiting' con su mamacita_entry_id + check_in_code.
 * FALTA DEFINIR (con Francisco) cómo se maneja la presencia:
 *   Opción A: el cliente llega y hace check-in en el kiosk con su teléfono;
 *             el kiosk reconoce la entrada de Mamacita existente y la marca
 *             presente en vez de crear una nueva.
 *   Opción B: el cron de promoción de NXTUP NO promueve entradas con
 *             mamacita_entry_id no-null a 'called' hasta que un evento de
 *             "arrived" las active.
 * Hasta resolver esto, la entrada cuenta para la posición/espera pero el
 * comportamiento de promoción usa el flujo estándar de NXTUP. Ver
 * planning/integration/mamacita-nxtup-integration.md.
 * ────────────────────────────────────────────────────────────────────
 */

type Body = {
  external_id?: string
  shop_id?: string
  customer_name?: string
  customer_phone?: string
  source?: string
  check_in_code?: string
  eta_at?: string
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text()
  if (!verifyMamacitaSignature(request, rawBody)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { external_id, shop_id, customer_name, check_in_code } = body
  let phone = String(body.customer_phone ?? '').replace(/\D/g, '')
  // Normalizar a 10 dígitos (formato del kiosk de NXTUP): quitar el "1" del
  // código de país si Mamacita lo manda en 11 dígitos (caller ID +1...). Así el
  // check-in por teléfono en el kiosk encuentra esta entrada de voz (mismo
  // formato) y la ACTIVA en vez de crear un duplicado walk-in.
  if (phone.length === 11 && phone.startsWith('1')) phone = phone.slice(1)

  if (!external_id || !shop_id || !customer_name || phone.length < 10) {
    return Response.json(
      { error: 'external_id, shop_id, customer_name y customer_phone (10+ dígitos) son requeridos' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // ── Idempotency: same Mamacita entry already pushed → return it ─────
  const { data: existing } = await supabase
    .from('queue_entries')
    .select('id, position')
    .eq('mamacita_entry_id', external_id)
    .maybeSingle()
  if (existing) {
    return Response.json({ nxtup_entry_id: existing.id, position: existing.position })
  }

  // ── Shop gates ──────────────────────────────────────────────────────
  const { data: shop } = await supabase
    .from('shops')
    .select('id, is_open, max_queue_size')
    .eq('id', shop_id)
    .maybeSingle()
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

  // ── Upsert client (by shop_id + phone). first_name only, like kiosk.
  //    referral_source stays null — "voice" isn't a walk-in source and we
  //    don't want to pollute that analytics column. The voice origin is
  //    recorded on the queue_entry via mamacita_entry_id. ──────────────
  let clientId: string | null = null
  const { data: existingClient } = await supabase
    .from('clients')
    .select('id')
    .eq('shop_id', shop_id)
    .eq('phone_number', phone)
    .maybeSingle()

  if (existingClient) {
    clientId = existingClient.id
  } else {
    const { data: newClient, error: clientErr } = await supabase
      .from('clients')
      .insert({
        shop_id,
        phone_number: phone,
        first_name: customer_name.trim().split(/\s+/)[0], // first token
      })
      .select('id')
      .single()
    if (clientErr?.code === '23505') {
      // Race: another insert won. Re-fetch.
      const { data: raceClient } = await supabase
        .from('clients')
        .select('id')
        .eq('shop_id', shop_id)
        .eq('phone_number', phone)
        .single()
      clientId = raceClient?.id ?? null
    } else if (clientErr) {
      console.error('[mamacita/queue-entries] client insert failed', clientErr)
    } else {
      clientId = newClient?.id ?? null
    }
  }

  // ── Create the queue_entry in 'waiting' (no immediate match — see the
  //    presence note in the header). position = max+1 in active pipeline.
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
      client_name: customer_name.trim(),
      client_phone: phone,
      service_id: null,
      position,
      mamacita_entry_id: external_id,
      check_in_code: check_in_code ?? null,
      // ETA que el cliente le dio a Julie por voz. Se muestra en el TV
      // junto al badge "En camino" (migración 058). Validamos que sea una
      // fecha parseable antes de guardar; si no, NULL.
      eta_at:
        body.eta_at && !Number.isNaN(Date.parse(body.eta_at))
          ? new Date(body.eta_at).toISOString()
          : null,
    })
    .select('id, position')
    .single()

  if (entryErr) {
    if (entryErr.code === '23505') {
      // Either the unique mamacita_entry_id (concurrent retry) or position.
      const { data: raceEntry } = await supabase
        .from('queue_entries')
        .select('id, position')
        .eq('mamacita_entry_id', external_id)
        .maybeSingle()
      if (raceEntry) {
        return Response.json({ nxtup_entry_id: raceEntry.id, position: raceEntry.position })
      }
      return Response.json({ error: 'Conflicto, reintenta' }, { status: 409 })
    }
    console.error('[mamacita/queue-entries] entry insert failed', entryErr)
    return Response.json({ error: 'No se pudo registrar en la cola' }, { status: 500 })
  }

  if (clientId) {
    await supabase.rpc('track_client_visit', { p_client_id: clientId })
  }

  return Response.json({ nxtup_entry_id: entry.id, position: entry.position })
}
