import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeCustomName, parseAmount } from '@/lib/ticket-items'

/**
 * Corrección de una línea de ticket — SOLO el dueño (082, decisión de
 * Francisco: el barbero corrige antes de Terminar; después, el dueño).
 * Sin tachados en la UI: PATCH corrige, DELETE la quita; ambos dejan
 * rastro en activity_log para disputas.
 *
 * PATCH { amount?, service_id?, name? } (085, precio libre): conciliar
 * con el barbero el 650 que era 65. service_id cambia el servicio (y su
 * precio de lista); name lo vuelve categoría propia; amount ausente con
 * service_id = precio de lista del servicio nuevo. Marca corrected_at.
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

  let body: { amount?: unknown; service_id?: unknown; name?: unknown }
  try {
    body = (await request.json()) ?? {}
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const update: Record<string, unknown> = { status: 'confirmed', updated_at: now }

  if (typeof body.service_id === 'string' && body.service_id) {
    const { data: service } = await admin
      .from('services')
      .select('id, name, price')
      .eq('id', body.service_id)
      .eq('shop_id', ticket.shop_id)
      .maybeSingle()
    if (!service) return Response.json({ error: 'Servicio inválido' }, { status: 400 })
    update.service_id = service.id
    update.service_name = service.name
    update.list_price = service.price == null ? null : Number(service.price)
    update.amount = parseAmount(service.price)
  } else if (typeof body.name === 'string') {
    const name = normalizeCustomName(body.name)
    if (!name) return Response.json({ error: 'Ponle nombre al servicio' }, { status: 400 })
    update.service_id = null
    update.service_name = name
    update.list_price = null
  }

  if (body.amount !== undefined) {
    const amount = parseAmount(body.amount)
    if (amount == null) return Response.json({ error: 'Monto inválido' }, { status: 400 })
    update.amount = amount
  }
  if (update.amount == null) {
    // Una pendiente necesita servicio + monto; una confirmada conserva el suyo.
    if (ticket.status === 'pending') {
      return Response.json({ error: 'Ponle el precio' }, { status: 400 })
    }
    delete update.amount
  }
  if (update.service_name === undefined && ticket.status === 'pending') {
    return Response.json({ error: 'Elige el servicio' }, { status: 400 })
  }

  let { error } = await admin
    .from('tickets')
    .update({ ...update, corrected_at: now })
    .eq('id', ticket.id)
  // 42703: la 085 no corre aún — se corrige igual, sin las marcas.
  if (error?.code === '42703') {
    console.error('[tickets] 085 sin migrar, corrigiendo sin list_price/corrected_at')
    const { list_price: _l, ...rest } = update
    ;({ error } = await admin.from('tickets').update(rest).eq('id', ticket.id))
  }
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
      to: {
        service: update.service_name ?? ticket.service_name,
        amount: update.amount ?? ticket.amount,
      },
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
