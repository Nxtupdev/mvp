import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/tickets/split — el dueño mueve un deslizador de reparto
 * (082). Body: { barber_id?: string|null, percent: number }.
 *   * sin barber_id → default del shop (shops.barber_split_percent)
 *   * con barber_id → override individual (barbers.split_percent);
 *     percent null explícito = quitar el override (vuelve al default).
 * percent = parte del BARBERO, 0-100 en pasos de 5 (el server redondea
 * y acota: la UI ya lo garantiza, esto es el cinturón).
 */
export async function POST(request: Request) {
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

  let barberId: string | null = null
  let percent: number | null = null
  let clearOverride = false
  try {
    const body = await request.json()
    barberId = typeof body?.barber_id === 'string' ? body.barber_id : null
    if (body?.percent === null && barberId) clearOverride = true
    else percent = Number(body?.percent)
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  if (!clearOverride) {
    if (!Number.isFinite(percent!)) {
      return Response.json({ error: 'percent inválido' }, { status: 400 })
    }
    percent = Math.min(100, Math.max(0, Math.round(percent! / 5) * 5))
  }

  const admin = createAdminClient()
  if (!barberId) {
    const { error } = await admin
      .from('shops')
      .update({ barber_split_percent: percent })
      .eq('id', shop.id)
    if (error) {
      console.error('[tickets/split] shop update failed', error)
      return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
    }
  } else {
    // El barbero debe ser DEL shop del dueño.
    const { data: barber } = await admin
      .from('barbers')
      .select('id')
      .eq('id', barberId)
      .eq('shop_id', shop.id)
      .maybeSingle()
    if (!barber) return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
    const { error } = await admin
      .from('barbers')
      .update({ split_percent: clearOverride ? null : percent })
      .eq('id', barberId)
    if (error) {
      console.error('[tickets/split] barber update failed', error)
      return Response.json({ error: 'No se pudo guardar' }, { status: 500 })
    }
  }

  await admin.from('activity_log').insert({
    shop_id: shop.id,
    barber_id: barberId,
    action: 'shop_settings_changed',
    metadata: {
      setting: 'ticket_split',
      barber_id: barberId,
      percent: clearOverride ? null : percent,
    },
  })
  return Response.json({ ok: true })
}
