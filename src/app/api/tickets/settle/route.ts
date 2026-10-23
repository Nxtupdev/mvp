import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { barberPercent, splitAmount } from '@/lib/tickets'

/**
 * POST /api/tickets/settle — "Cerrar cuentas" (082). El cierre es una
 * ACCIÓN, no un calendario: toma TODAS las líneas confirmadas sin
 * liquidar del shop, congela los totales por barbero (total, parte del
 * barbero con SU % vigente, parte de la casa) en un comprobante
 * (settlements) y marca las líneas con el settlement_id. El que paga
 * diario lo toca diario; el semanal, el domingo. Las 'pending' NO
 * entran (la UI avisa si existen).
 */
export async function POST() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) return Response.json({ error: 'No tienes una barbería' }, { status: 404 })

  const admin = createAdminClient()
  const { data: shopCfg } = await admin
    .from('shops')
    .select('tickets_enabled, barber_split_percent')
    .eq('id', shop.id)
    .single()
  if (!shopCfg?.tickets_enabled) {
    return Response.json({ error: 'Cuentas por porcentaje apagadas' }, { status: 400 })
  }

  const { data: unsettled } = await admin
    .from('tickets')
    .select('id, barber_id, amount, created_at')
    .eq('shop_id', shop.id)
    .eq('status', 'confirmed')
    .is('settlement_id', null)
    .order('created_at', { ascending: true })
    .limit(2000)
  if (!unsettled || unsettled.length === 0) {
    return Response.json({ error: 'No hay líneas por liquidar.' }, { status: 400 })
  }

  const { data: barbers } = await admin
    .from('barbers')
    .select('id, name, split_percent')
    .eq('shop_id', shop.id)

  // Totales por barbero con SU % vigente al momento del cierre.
  const byBarber = new Map<string, { total: number; count: number }>()
  for (const t of unsettled) {
    const acc = byBarber.get(t.barber_id) ?? { total: 0, count: 0 }
    acc.total += Number(t.amount)
    acc.count += 1
    byBarber.set(t.barber_id, acc)
  }
  const totals = Array.from(byBarber.entries()).map(([barberId, acc]) => {
    const b = (barbers ?? []).find(x => x.id === barberId)
    const pct = barberPercent(shopCfg.barber_split_percent, b?.split_percent ?? null)
    const total = Math.round(acc.total * 100) / 100
    const { barber, house } = splitAmount(total, pct)
    return {
      barber_id: barberId,
      name: b?.name ?? '—',
      percent: pct,
      count: acc.count,
      total,
      barber_part: barber,
      house_part: house,
    }
  })

  const rangeStart = unsettled[0].created_at
  const rangeEnd = unsettled[unsettled.length - 1].created_at

  const { data: settlement, error: insErr } = await admin
    .from('settlements')
    .insert({ shop_id: shop.id, range_start: rangeStart, range_end: rangeEnd, totals })
    .select('id, created_at')
    .single()
  if (insErr || !settlement) {
    console.error('[tickets/settle] insert failed', insErr)
    return Response.json({ error: 'No se pudo cerrar — intenta de nuevo.' }, { status: 500 })
  }

  // Marcar EXACTAMENTE las líneas sumadas (por id, no por rango: una
  // línea que entre justo durante el cierre queda para el próximo). El
  // `.is(null)` + select hacen el reclamo ATÓMICO: si otro cierre ganó
  // la carrera (doble clic), aquí se marca 0 y este comprobante se
  // deshace en vez de duplicar totales.
  const ids = unsettled.map(t => t.id)
  const { data: marked, error: markErr } = await admin
    .from('tickets')
    .update({ settlement_id: settlement.id, updated_at: new Date().toISOString() })
    .in('id', ids)
    .is('settlement_id', null)
    .select('id')
  if (markErr) {
    console.error('[tickets/settle] mark failed', markErr)
    return Response.json({ error: 'Cierre incompleto — revisa antes de reintentar.' }, { status: 500 })
  }
  if (!marked || marked.length === 0) {
    await admin.from('settlements').delete().eq('id', settlement.id)
    return Response.json(
      { error: 'Esas líneas ya fueron liquidadas en otro cierre.' },
      { status: 409 },
    )
  }

  await admin.from('activity_log').insert({
    shop_id: shop.id,
    action: 'tickets_settled',
    metadata: { settlement_id: settlement.id, lines: ids.length, totals },
  })

  return Response.json({ ok: true, settlement_id: settlement.id, totals })
}
