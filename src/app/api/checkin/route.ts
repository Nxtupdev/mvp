import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { shop_id, client_name, barber_id } = body
  const rawPhone = body.client_phone

  if (!shop_id || !client_name?.trim()) {
    return Response.json({ error: 'Campos requeridos faltantes' }, { status: 400 })
  }

  // Phone is optional. If provided, normalize and validate.
  let phone: string | null = null
  if (rawPhone) {
    const digits = String(rawPhone).replace(/\D/g, '')
    if (digits.length < 10) {
      return Response.json(
        { error: 'Teléfono inválido — mínimo 10 dígitos' },
        { status: 400 },
      )
    }
    phone = digits
  }

  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('id, is_open, max_queue_size')
    .eq('id', shop_id)
    .single()

  if (!shop) return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  if (!shop.is_open) return Response.json({ error: 'La barbería está cerrada' }, { status: 409 })

  const { count: queueCount } = await supabase
    .from('queue_entries')
    .select('*', { count: 'exact', head: true })
    .eq('shop_id', shop_id)
    .in('status', ['waiting', 'called', 'in_progress'])

  if (queueCount !== null && queueCount >= shop.max_queue_size) {
    return Response.json({ error: 'La cola está llena' }, { status: 409 })
  }

  // Phone-based rate limit only applies when phone is provided.
  if (phone) {
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

  const { data: maxEntry } = await supabase
    .from('queue_entries')
    .select('position')
    .eq('shop_id', shop_id)
    .in('status', ['waiting', 'called', 'in_progress'])
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const position = (maxEntry?.position ?? 0) + 1

  const { data: entry, error } = await supabase
    .from('queue_entries')
    .insert({
      shop_id,
      client_name: client_name.trim(),
      client_phone: phone,
      barber_id: barber_id ?? null,
      position,
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'Conflicto de posición, intenta de nuevo' }, { status: 409 })
    }
    return Response.json({ error: 'Error al registrar en la cola' }, { status: 500 })
  }

  // Immediate match: if no specific barber requested AND there's an available
  // barber waiting, assign this client to them right now (FIFO of barbers).
  // This is the "tap and the first barber receives you" behavior.
  let assignedBarber: { id: string; name: string } | null = null
  if (!barber_id) {
    const { data: nextBarber } = await supabase
      .from('barbers')
      .select('id, name, available_since')
      .eq('shop_id', shop_id)
      .eq('status', 'available')
      .not('available_since', 'is', null)
      .order('available_since', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (nextBarber) {
      const now = new Date().toISOString()
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

      // Clear the barber's FIFO position — they have a client now.
      await supabase
        .from('barbers')
        .update({ available_since: null })
        .eq('id', nextBarber.id)

      if (updatedEntry) {
        return Response.json({
          entry: updatedEntry,
          assigned_barber: { id: nextBarber.id, name: nextBarber.name },
        })
      }
    }
  }

  return Response.json({ entry, assigned_barber: assignedBarber })
}
