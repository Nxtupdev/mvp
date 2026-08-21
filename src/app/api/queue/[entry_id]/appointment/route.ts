import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'

/**
 * POST /api/queue/[entry_id]/appointment
 *
 * Rediseño ago-2026 (sin confirmación obligatoria): las citas se asignan
 * o amarran DIRECTO en el check-in. Este endpoint queda solo como botón
 * de DEFENSA del barbero: "No es mi cita ✗" — despina un cliente que
 * quedó amarrado a él por dedazo del kiosko o por un colado que inventó
 * la cita. El cliente vuelve al pool como walk-in normal.
 *
 * Body: { barber_id: uuid, action: 'reject' }
 * Solo aplica a citas AMARRADAS en espera (waiting, barber_id =
 * appointment_barber_id = este barbero). Un 'called'/'in_progress' ya no
 * se despina por aquí (eso es el flujo normal de silla).
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
  if (!barberId || body.action !== 'reject') {
    return Response.json(
      { error: 'barber_id y action=reject requeridos (la confirmación ya no existe — las citas entran directo)' },
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
  if (
    entry.status !== 'waiting' ||
    entry.appointment_barber_id !== barberId ||
    entry.barber_id !== barberId
  ) {
    return Response.json(
      { error: 'Esta cita ya no está amarrada a ti' },
      { status: 409 },
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

  // Despinar (atómico): vuelve al pool como walk-in normal.
  const { data: rejected } = await supabase
    .from('queue_entries')
    .update({ barber_id: null, appointment_barber_id: null })
    .eq('id', entry_id)
    .eq('status', 'waiting')
    .eq('barber_id', barberId)
    .select('id')
    .maybeSingle()
  if (!rejected) {
    return Response.json({ error: 'Esta cita ya no está amarrada a ti' }, { status: 409 })
  }
  await supabase.from('activity_log').insert({
    shop_id: entry.shop_id,
    barber_id: barberId,
    action: 'appointment_rejected',
    metadata: { entry_id, client_name: entry.client_name },
  })
  return Response.json({ ok: true, action: 'reject' })
}
