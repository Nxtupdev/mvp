import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'

/**
 * POST /api/queue/[entry_id]/appointment
 *
 * El barbero acoge o rechaza una cita pendiente desde su panel (066).
 * Body: { barber_id: uuid, action: 'accept' | 'reject' }
 *
 * La confirmación del barbero ES la validación de la cita — NXTUP no
 * tiene agenda contra la cual verificar; solo el barbero sabe si esa
 * cita existe. Mismo modelo de "auth" del panel: UUID inadivinable +
 * gate de WiFi del shop.
 *
 * accept → barber_id = appointment_barber_id (atómico). Con eso entra
 *          al flujo "cliente pedido" que YA existe: cuando ESTE barbero
 *          se libere, el sistema le llama su cita primero; los demás
 *          barberos la saltan (barber_id ≠ null).
 * reject → se limpia appointment_barber_id → walk-in normal del pool.
 *
 * Solo el barbero ELEGIDO puede accionar (nadie confirma citas ajenas).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entry_id: string }> },
) {
  const { entry_id } = await params

  let body: { barber_id?: string; action?: string } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  const barberId = body.barber_id
  const action = body.action
  if (!barberId || (action !== 'accept' && action !== 'reject')) {
    return Response.json(
      { error: 'barber_id y action (accept|reject) requeridos' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  const { data: entry } = await supabase
    .from('queue_entries')
    .select('id, shop_id, status, barber_id, appointment_barber_id, client_name, position')
    .eq('id', entry_id)
    .single()

  if (!entry) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }
  // Solo citas PENDIENTES: waiting, amarrada a un barbero, sin confirmar.
  if (
    entry.status !== 'waiting' ||
    !entry.appointment_barber_id ||
    entry.barber_id !== null
  ) {
    return Response.json(
      { error: 'Esta cita ya no está pendiente' },
      { status: 409 },
    )
  }
  if (entry.appointment_barber_id !== barberId) {
    return Response.json(
      { error: 'Esta cita no es contigo' },
      { status: 403 },
    )
  }

  // Gate de WiFi — mismo modelo que /state y /avatar.
  const { data: shop } = await supabase
    .from('shops')
    .select('trusted_public_ip')
    .eq('id', entry.shop_id)
    .single()
  if (shop?.trusted_public_ip) {
    const clientIp = getClientIp(request)
    if (!clientIp || clientIp !== shop.trusted_public_ip) {
      return Response.json(
        {
          error: 'Conéctate al WiFi de la barbería para gestionar tu cita',
          code: 'not_in_shop',
        },
        { status: 403 },
      )
    }
  }

  if (action === 'accept') {
    // Atómico: solo gana si sigue pendiente (guard contra doble tap /
    // expiración del cron en el mismo instante).
    const { data: updated } = await supabase
      .from('queue_entries')
      .update({ barber_id: barberId })
      .eq('id', entry_id)
      .eq('status', 'waiting')
      .is('barber_id', null)
      .not('appointment_barber_id', 'is', null)
      .select('id')
      .maybeSingle()
    if (!updated) {
      return Response.json({ error: 'Esta cita ya no está pendiente' }, { status: 409 })
    }
    await supabase.from('activity_log').insert({
      shop_id: entry.shop_id,
      barber_id: barberId,
      action: 'appointment_confirmed',
      metadata: { entry_id, client_name: entry.client_name },
    })
    return Response.json({ ok: true, action: 'accept' })
  }

  // reject → walk-in normal (el pool lo toma como cualquier cliente).
  const { data: rejected } = await supabase
    .from('queue_entries')
    .update({ appointment_barber_id: null })
    .eq('id', entry_id)
    .eq('status', 'waiting')
    .is('barber_id', null)
    .select('id')
    .maybeSingle()
  if (!rejected) {
    return Response.json({ error: 'Esta cita ya no está pendiente' }, { status: 409 })
  }
  await supabase.from('activity_log').insert({
    shop_id: entry.shop_id,
    barber_id: barberId,
    action: 'appointment_rejected',
    metadata: { entry_id, client_name: entry.client_name },
  })
  return Response.json({ ok: true, action: 'reject' })
}
