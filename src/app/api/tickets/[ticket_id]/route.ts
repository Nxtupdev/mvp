import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Corrección de una línea de ticket — SOLO el dueño (082, decisión de
 * Francisco: el barbero corrige antes de Terminar; después, el dueño).
 * Sin tachados en la UI: PATCH cambia el servicio, DELETE la quita;
 * ambos dejan rastro en activity_log para disputas.
 *
 * Solo líneas SIN liquidar: un comprobante cerrado no se reescribe.
 */

async function ownerContext(ticketId: string) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 401 as const }

  const admin = createAdminClient()
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, shop_id, barber_id, service_name, amount, status, settlement_id')
    .eq('id', ticketId)
    .maybeSingle()
  if (!ticket) return { error: 404 as const }

  const { data: shop } = await admin
    .from('shops')
    .select('id, owner_id')
    .eq('id', ticket.shop_id)
    .single()
  if (!shop || shop.owner_id !== user.id) return { error: 403 as const }
  if (ticket.settlement_id) return { error: 409 as const }

  return { admin, ticket }
}

const ERRORS: Record<number, string> = {
  401: 'No autenticado',
  403: 'No autorizado',
  404: 'Línea no encontrada',
  409: 'Esa línea ya está liquidada en un cierre — no se puede tocar.',
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ ticket_id: string }> },
) {
  const { ticket_id } = await params
  const ctx = await ownerContext(ticket_id)
  if ('error' in ctx) {
    const code = ctx.error ?? 500
    return Response.json({ error: ERRORS[code] ?? 'Error' }, { status: code })
  }
  const { admin, ticket } = ctx

  let serviceId = ''
  try {
    const body = await request.json()
    serviceId = String(body?.service_id ?? '')
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  // Precio SIEMPRE del server, igual que en la captura del barbero.
  const { data: service } = await admin
    .from('services')
    .select('id, name, price')
    .eq('id', serviceId)
    .eq('shop_id', ticket.shop_id)
    .maybeSingle()
  if (!service) return Response.json({ error: 'Servicio inválido' }, { status: 400 })

  const { error } = await admin
    .from('tickets')
    .update({
      service_id: service.id,
      service_name: service.name,
      amount: service.price ?? 0,
      status: 'confirmed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id)
  if (error) {
    console.error('[tickets] owner patch failed', error)
    return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
  }

  await admin.from('activity_log').insert({
    shop_id: ticket.shop_id,
    barber_id: ticket.barber_id,
    action: 'ticket_corrected',
    metadata: {
      ticket_id: ticket.id,
      from: { service: ticket.service_name, amount: ticket.amount },
      to: { service: service.name, amount: service.price ?? 0 },
    },
  })
  return Response.json({ ok: true })
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ticket_id: string }> },
) {
  const { ticket_id } = await params
  const ctx = await ownerContext(ticket_id)
  if ('error' in ctx) {
    const code = ctx.error ?? 500
    return Response.json({ error: ERRORS[code] ?? 'Error' }, { status: code })
  }
  const { admin, ticket } = ctx

  const { error } = await admin.from('tickets').delete().eq('id', ticket.id)
  if (error) {
    console.error('[tickets] owner delete failed', error)
    return Response.json({ error: 'No se pudo eliminar' }, { status: 500 })
  }
  await admin.from('activity_log').insert({
    shop_id: ticket.shop_id,
    barber_id: ticket.barber_id,
    action: 'ticket_deleted',
    metadata: {
      ticket_id: ticket.id,
      was: { service: ticket.service_name, amount: ticket.amount, status: ticket.status },
    },
  })
  return Response.json({ ok: true })
}
