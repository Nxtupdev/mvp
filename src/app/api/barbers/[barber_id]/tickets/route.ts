import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { barberPercent, barberTotals, type TicketRow } from '@/lib/tickets'
import { isMissingColumn, normalizeCustomName, parseAmount } from '@/lib/ticket-items'

/**
 * Tickets del barbero (082) — mismo modelo de acceso que su panel: el
 * link del barbero es su identidad (sin cuenta) y el toggle del shop
 * gatea todo.
 *
 * Precio LIBRE desde la 085 (decisión de Francisco + dueños, 25-oct):
 * el barbero manda el monto de cada línea. El servidor valida el tope
 * por línea (MAX_LINE_AMOUNT) y guarda el precio de lista como
 * snapshot (list_price) para que Cuentas marque "revisar" lo que se
 * aleje; el dueño corrige antes del cierre.
 *
 * POST  { entry_id?, items: [{ service_id, amount } | { name, amount }] }
 *       → una línea confirmada por item. items vacío = UNA línea
 *       'pending' (cerró la hoja sin elegir; se completa después con
 *       PATCH o la corrige el dueño). Acepta también el formato viejo
 *       { service_ids } con el precio de lista (PWA en caché).
 * PATCH { ticket_id, items } → completa UNA pending propia: el primer
 *       item reemplaza la línea, los demás crean líneas nuevas.
 * GET   ?from=ISO&to=ISO → sus líneas del rango + su % + totales
 *       ("Mi cuenta"). Solo lo SUYO: jamás números de otros barberos.
 */

type LineDraft = {
  service_id: string | null
  service_name: string
  amount: number
  list_price: number | null
}

/**
 * Body → líneas listas para guardar, o un error para el barbero. Los
 * servicios se resuelven contra el MISMO shop (un id ajeno no existe
 * aquí) y de ahí salen el nombre y el precio de lista.
 */
async function resolveItems(
  admin: ReturnType<typeof createAdminClient>,
  shopId: string,
  body: unknown,
): Promise<{ lines: LineDraft[] } | { error: string }> {
  const b = (body ?? {}) as { items?: unknown; service_ids?: unknown }
  type Raw = { service_id?: unknown; name?: unknown; amount?: unknown }
  let raw: Raw[]
  if (Array.isArray(b.items)) {
    raw = (b.items as Raw[]).slice(0, 10)
  } else if (Array.isArray(b.service_ids)) {
    raw = (b.service_ids as unknown[])
      .filter((s): s is string => typeof s === 'string')
      .slice(0, 10)
      .map(id => ({ service_id: id }))
  } else {
    raw = []
  }
  if (raw.length === 0) return { lines: [] }

  const ids = raw.map(r => r.service_id).filter((s): s is string => typeof s === 'string')
  const byId = new Map<string, { id: string; name: string; price: number | null }>()
  if (ids.length > 0) {
    const { data: services } = await admin
      .from('services')
      .select('id, name, price')
      .eq('shop_id', shopId)
      .in('id', ids)
    for (const s of services ?? []) byId.set(s.id, s)
  }

  const lines: LineDraft[] = []
  for (const r of raw) {
    if (typeof r.service_id === 'string') {
      const s = byId.get(r.service_id)
      if (!s) return { error: 'Servicio inválido' }
      const listPrice = s.price == null ? null : Number(s.price)
      // Formato viejo (sin amount) = precio de lista.
      const amount = r.amount === undefined ? parseAmount(listPrice) : parseAmount(r.amount)
      if (amount == null) return { error: `Revisa el precio de ${s.name}` }
      lines.push({ service_id: s.id, service_name: s.name, amount, list_price: listPrice })
    } else {
      const name = normalizeCustomName(typeof r.name === 'string' ? r.name : '')
      if (!name) return { error: 'Ponle nombre al servicio' }
      const amount = parseAmount(r.amount)
      if (amount == null) return { error: `Revisa el precio de ${name}` }
      lines.push({ service_id: null, service_name: name, amount, list_price: null })
    }
  }
  return { lines }
}

/**
 * Inserta tolerando migraciones sin correr (columna
 * inexistente): la línea vale más que sus extras, así que se reintenta
 * sin list_price (085) y luego sin client_name (083).
 */
async function insertLines(
  admin: ReturnType<typeof createAdminClient>,
  rows: Record<string, unknown>[],
) {
  let { error } = await admin.from('tickets').insert(rows)
  if (isMissingColumn(error)) {
    console.error('[barbers/tickets] list_price sin migrar (085), guardando sin él')
    const noList = rows.map(({ list_price: _l, ...r }) => r)
    ;({ error } = await admin.from('tickets').insert(noList))
    if (isMissingColumn(error)) {
      console.error('[barbers/tickets] client_name sin migrar (083), guardando sin nombre')
      ;({ error } = await admin
        .from('tickets')
        .insert(noList.map(({ client_name: _c, ...r }) => r)))
    }
  }
  return error
}

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
  let body: unknown
  // Nombre opcional (083): solo para líneas registradas a mano desde
  // "Mis clientes" (citas que no pasaron por la cola).
  let clientName: string | null = null
  try {
    body = await request.json()
    const b = body as { entry_id?: unknown; client_name?: unknown }
    entryId = typeof b?.entry_id === 'string' ? b.entry_id : null
    const rawName = typeof b?.client_name === 'string' ? b.client_name.trim() : ''
    clientName = rawName ? rawName.slice(0, 40) : null
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  const resolved = await resolveItems(admin, shop.id, body)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: 400 })

  // Un turno de la cola solo se vincula si es de ESTE barbero y shop; si
  // no, la línea queda como manual (nunca se cuelga de un turno ajeno).
  if (entryId) {
    const { data: entry } = await admin
      .from('queue_entries')
      .select('id')
      .eq('id', entryId)
      .eq('barber_id', barber.id)
      .eq('shop_id', shop.id)
      .maybeSingle()
    if (!entry) entryId = null
  }

  // Hoja cerrada sin elegir → UNA línea pendiente (badge; se completa luego).
  if (resolved.lines.length === 0) {
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

  const rows = resolved.lines.map(l => ({
    shop_id: shop.id,
    barber_id: barber.id,
    entry_id: entryId,
    ...l,
    status: 'confirmed',
    ...(clientName ? { client_name: clientName } : {}),
  }))
  const error = await insertLines(admin, rows)
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
  let body: unknown
  try {
    body = await request.json()
    ticketId = String((body as { ticket_id?: unknown })?.ticket_id ?? '')
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  const resolved = await resolveItems(admin, shop.id, body)
  if ('error' in resolved) return Response.json({ error: resolved.error }, { status: 400 })
  if (!ticketId || resolved.lines.length === 0) {
    return Response.json({ error: 'ticket_id e items requeridos' }, { status: 400 })
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

  const [first, ...rest] = resolved.lines
  const now = new Date().toISOString()
  const fill = { ...first, status: 'confirmed', updated_at: now }
  let { error: updErr } = await admin
    .from('tickets')
    .update(fill)
    .eq('id', ticket.id)
    .eq('status', 'pending')
  if (isMissingColumn(updErr)) {
    console.error('[barbers/tickets] list_price sin migrar (085), completando sin él')
    const { list_price: _l, ...noList } = fill
    ;({ error: updErr } = await admin
      .from('tickets')
      .update(noList)
      .eq('id', ticket.id)
      .eq('status', 'pending'))
  }
  if (updErr) {
    console.error('[barbers/tickets] pending fill failed', updErr)
    return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
  }
  if (rest.length > 0) {
    const error = await insertLines(
      admin,
      rest.map(l => ({
        shop_id: shop.id,
        barber_id: barber.id,
        entry_id: ticket.entry_id,
        ...l,
        status: 'confirmed',
      })),
    )
    if (error) console.error('[barbers/tickets] pending extras failed', error)
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
