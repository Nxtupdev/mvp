import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { barberPercent, barberTotals, type TicketRow } from '@/lib/tickets'

/**
 * Tickets del barbero (082) — mismo modelo de acceso que su panel: el
 * link del barbero es su identidad (sin cuenta), y el daño posible es
 * mínimo porque los PRECIOS se resuelven SERVER-side de la tabla
 * services (el cliente solo manda ids) y el toggle del shop gatea todo.
 *
 * POST  { entry_id?, service_ids: uuid[] } → una línea confirmada por
 *       servicio elegido en "¿Qué le hiciste?". service_ids vacío =
 *       UNA línea 'pending' (cerró la hoja sin elegir; se completa
 *       después con PATCH o la corrige el dueño).
 * PATCH { ticket_id, service_ids } → completa UNA pending propia:
 *       primer servicio reemplaza la línea, extras crean líneas nuevas.
 * GET   ?from=ISO&to=ISO → sus líneas del rango + su % + totales
 *       ("Mi cuenta"). Solo lo SUYO: jamás números de otros barberos.
 */

async function loadBarberShop(barberId: string) {
  const admin = createAdminClient()
  const { data: barber } = await admin
    .from('barbers')
    .select('id, shop_id, name, split_percent')
    .eq('id', barberId)
    .single()
  if (!barber) return null
  const { data: shop } = await admin
    .from('shops')
    .select('id, tickets_enabled, barber_split_percent')
    .eq('id', barber.shop_id)
    .single()
  if (!shop) return null
  return { admin, barber, shop }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params
  const ctx = await loadBarberShop(barber_id)
  if (!ctx) return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  const { admin, barber, shop } = ctx
  if (!shop.tickets_enabled) {
    return Response.json({ error: 'Cuentas por porcentaje apagadas' }, { status: 400 })
  }

  let entryId: string | null = null
  let serviceIds: string[] = []
  try {
    const body = await request.json()
    entryId = typeof body?.entry_id === 'string' ? body.entry_id : null
    serviceIds = Array.isArray(body?.service_ids)
      ? body.service_ids.filter((s: unknown) => typeof s === 'string').slice(0, 10)
      : []
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Hoja cerrada sin elegir → UNA línea pendiente (badge; se completa luego).
  if (serviceIds.length === 0) {
    const { error } = await admin.from('tickets').insert({
      shop_id: shop.id,
      barber_id: barber.id,
      entry_id: entryId,
      status: 'pending',
      amount: 0,
    })
    if (error) {
      console.error('[barbers/tickets] pending insert failed', error)
      return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
    }
    return Response.json({ ok: true, pending: true })
  }

  // Precios SIEMPRE del server: los ids se resuelven contra services
  // del MISMO shop; un id ajeno o inventado simplemente no existe aquí.
  const { data: services } = await admin
    .from('services')
    .select('id, name, price')
    .eq('shop_id', shop.id)
    .in('id', serviceIds)
  if (!services || services.length === 0) {
    return Response.json({ error: 'Servicios inválidos' }, { status: 400 })
  }

  const rows = services.map(s => ({
    shop_id: shop.id,
    barber_id: barber.id,
    entry_id: entryId,
    service_id: s.id,
    service_name: s.name,
    amount: s.price ?? 0,
    status: 'confirmed',
  }))
  const { error } = await admin.from('tickets').insert(rows)
  if (error) {
    console.error('[barbers/tickets] insert failed', error)
    return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
  return Response.json({ ok: true, lines: rows.length })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params
  const ctx = await loadBarberShop(barber_id)
  if (!ctx) return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  const { admin, barber, shop } = ctx
  if (!shop.tickets_enabled) {
    return Response.json({ error: 'Cuentas por porcentaje apagadas' }, { status: 400 })
  }

  let ticketId = ''
  let serviceIds: string[] = []
  try {
    const body = await request.json()
    ticketId = String(body?.ticket_id ?? '')
    serviceIds = Array.isArray(body?.service_ids)
      ? body.service_ids.filter((s: unknown) => typeof s === 'string').slice(0, 10)
      : []
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (!ticketId || serviceIds.length === 0) {
    return Response.json({ error: 'ticket_id y service_ids requeridos' }, { status: 400 })
  }

  // Solo UNA pending PROPIA y sin liquidar — el barbero no toca
  // confirmadas (eso es del dueño) ni cuentas ajenas.
  const { data: ticket } = await admin
    .from('tickets')
    .select('id, entry_id, status, settlement_id, barber_id')
    .eq('id', ticketId)
    .eq('barber_id', barber.id)
    .maybeSingle()
  if (!ticket || ticket.status !== 'pending' || ticket.settlement_id) {
    return Response.json({ error: 'Esa línea no se puede completar' }, { status: 400 })
  }

  const { data: services } = await admin
    .from('services')
    .select('id, name, price')
    .eq('shop_id', shop.id)
    .in('id', serviceIds)
  if (!services || services.length === 0) {
    return Response.json({ error: 'Servicios inválidos' }, { status: 400 })
  }

  const [first, ...rest] = services
  const now = new Date().toISOString()
  const { error: updErr } = await admin
    .from('tickets')
    .update({
      service_id: first.id,
      service_name: first.name,
      amount: first.price ?? 0,
      status: 'confirmed',
      updated_at: now,
    })
    .eq('id', ticket.id)
    .eq('status', 'pending')
  if (updErr) {
    console.error('[barbers/tickets] pending fill failed', updErr)
    return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
  if (rest.length > 0) {
    await admin.from('tickets').insert(
      rest.map(s => ({
        shop_id: shop.id,
        barber_id: barber.id,
        entry_id: ticket.entry_id,
        service_id: s.id,
        service_name: s.name,
        amount: s.price ?? 0,
        status: 'confirmed',
      })),
    )
  }
  return Response.json({ ok: true })
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params
  const ctx = await loadBarberShop(barber_id)
  if (!ctx) return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  const { admin, barber, shop } = ctx
  if (!shop.tickets_enabled) {
    return Response.json({ error: 'Cuentas por porcentaje apagadas' }, { status: 400 })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  const fromIso = from && !Number.isNaN(Date.parse(from)) ? from : null
  const toIso = to && !Number.isNaN(Date.parse(to)) ? to : null

  let q = admin
    .from('tickets')
    .select('id, barber_id, service_name, amount, status, created_at, settlement_id')
    .eq('barber_id', barber.id)
    .order('created_at', { ascending: false })
    .limit(500)
  if (fromIso) q = q.gte('created_at', fromIso)
  if (toIso) q = q.lte('created_at', toIso)
  const { data: rows } = await q

  const pct = barberPercent(shop.barber_split_percent, barber.split_percent)
  const totals = barberTotals((rows ?? []) as TicketRow[], pct)

  // La página del barbero es anónima: los servicios para la hoja
  // "¿Qué le hiciste?" salen de aquí (admin), no de un fetch anónimo.
  const { data: services } = await admin
    .from('services')
    .select('id, name, price')
    .eq('shop_id', shop.id)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  return Response.json({
    barber: { id: barber.id, name: barber.name },
    percent: pct,
    totals,
    tickets: rows ?? [],
    services: services ?? [],
  })
}
