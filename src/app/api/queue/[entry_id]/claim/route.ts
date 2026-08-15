import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'

/**
 * POST /api/queue/[entry_id]/claim
 *
 * "Tomar yo" — rediseñado en la migración 063 (auto-BUSY).
 *
 * Antes: reclamable mientras la entrada estaba 'called' con ≥60s (el
 * timer adivinaba ausencia). Ahora la ventana 0-2 min es EXCLUSIVA del
 * barbero llamado; a los 2 min el cascade pone AUTO-BUSY (asume que
 * está trabajando) y es AHÍ cuando se abre el reclamo: una entrada
 * in_progress con auto_busy=true es una silla sin confirmar, y el
 * siguiente barbero del piso — que VE si el cliente está varado — puede
 * reclamarla. El reclamo ES la confirmación humana de la ausencia.
 *
 * Al reclamar:
 *   - El cliente pasa DIRECTO a la silla del reclamante (in_progress,
 *     auto_busy=false, called_at=now para que su timer de silla arranque
 *     limpio). Sin countdown nuevo: reclamar = lo estoy agarrando ya.
 *   - El ausente va a BREAK (decisión de Francisco, ago 2026): sin
 *     posición retenida, contando el break del día, con el timer normal
 *     — si no vuelve, el cron de break vencido (028) lo baja a offline
 *     solo. + no_show en la bitácora.
 *
 * Guards (in order):
 *   1. Entry in_progress con auto_busy=true (la ÚNICA ventana de reclamo).
 *   2. El reclamante debe estar ACTIVO (available + available_since).
 *   3. Sancionados no reclaman (misma regla de siempre, migración 047).
 *   4. El reclamante debe ser el SIGUIENTE disponible en FIFO
 *      (excluyendo al ausente) — #3 no puede saltarse a #2.
 *   5. WiFi presence (mismo gate que el resto de mutaciones).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ entry_id: string }> },
) {
  const { entry_id } = await params

  let body: { barber_id?: string } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }
  const claimerId = body.barber_id
  if (!claimerId) {
    return Response.json({ error: 'barber_id requerido' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data: entry } = await supabase
    .from('queue_entries')
    .select('id, shop_id, status, auto_busy, barber_id, client_name, called_at, position')
    .eq('id', entry_id)
    .single()

  if (!entry) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }
  // Solo se reclama la silla SIN CONFIRMAR (auto-BUSY del cascade). Una
  // entrada 'called' sigue en la ventana exclusiva del barbero llamado;
  // una in_progress confirmada (el barbero tocó BUSY) jamás se toca.
  if (entry.status !== 'in_progress' || entry.auto_busy !== true) {
    return Response.json(
      { error: 'El cliente ya no está disponible para tomar' },
      { status: 409 },
    )
  }

  const absentBarberId: string = entry.barber_id
  const shopId: string = entry.shop_id

  if (claimerId === absentBarberId) {
    return Response.json(
      { error: 'Es tu propio cliente — si lo estás atendiendo, ya está contigo' },
      { status: 400 },
    )
  }

  // Verify claimer is ACTIVE in this shop, fetch peers in one shot.
  const { data: peers } = await supabase
    .from('barbers')
    .select('id, shop_id, status, available_since, sanctioned_until, breaks_taken_today')
    .eq('shop_id', shopId)

  const claimer = peers?.find(p => p.id === claimerId)
  if (!claimer) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }
  if (claimer.status !== 'available' || !claimer.available_since) {
    return Response.json(
      { error: 'Tienes que estar DISPONIBLE para tomar este cliente' },
      { status: 403 },
    )
  }

  // Sanction-aware (migración 047): un barbero sancionado no puede
  // "Tomar yo" — sería la forma más obvia de saltarse la sanción.
  const nowMs = Date.now()
  const isClaimerSanctioned =
    claimer.sanctioned_until !== null &&
    new Date(claimer.sanctioned_until!).getTime() > nowMs
  if (isClaimerSanctioned) {
    return Response.json(
      {
        error:
          'Estás sancionado por llegada tarde. No puedes tomar walk-ins hasta que termine la sanción.',
        code: 'sanctioned',
      },
      { status: 403 },
    )
  }

  // El reclamante debe ser el SIGUIENTE disponible en FIFO, excluyendo
  // al ausente y a los sancionados.
  const fifoCandidates = (peers ?? [])
    .filter(
      p =>
        p.id !== absentBarberId &&
        p.status === 'available' &&
        p.available_since &&
        (p.sanctioned_until === null ||
          new Date(p.sanctioned_until).getTime() <= nowMs),
    )
    .sort(
      (a, b) =>
        new Date(a.available_since!).getTime() -
        new Date(b.available_since!).getTime(),
    )

  if (fifoCandidates.length === 0 || fifoCandidates[0].id !== claimerId) {
    return Response.json(
      {
        error:
          'No eres el siguiente disponible — espera a que sea tu turno',
        code: 'not_next',
      },
      { status: 403 },
    )
  }

  // WiFi presence — misma regla que el resto de mutaciones de cola. El
  // shop select trae también next_break_minutes para el break penal.
  const { data: shop } = await supabase
    .from('shops')
    .select('trusted_public_ip, next_break_minutes')
    .eq('id', shopId)
    .single()
  if (shop?.trusted_public_ip) {
    const clientIp = getClientIp(request)
    if (!clientIp || clientIp !== shop.trusted_public_ip) {
      return Response.json(
        {
          error:
            'Conéctate al WiFi de la barbería para tomar este cliente',
          code: 'not_in_shop',
        },
        { status: 403 },
      )
    }
  }

  const now = new Date().toISOString()

  // ── Mutations (best-effort sequence — si un paso posterior falla se
  // loguea pero el take ya está reconocido). ──
  //
  // 1. El cliente pasa DIRECTO a la silla del reclamante. auto_busy se
  //    limpia: el reclamo ES la confirmación (lo está agarrando ya).
  //    called_at=now para que el timer de silla (stats de duración)
  //    arranque desde este momento.
  await supabase
    .from('queue_entries')
    .update({
      barber_id: claimerId,
      status: 'in_progress',
      auto_busy: false,
      called_at: now,
    })
    .eq('id', entry_id)

  // 2. El reclamante queda ocupado con su cliente nuevo.
  await supabase
    .from('barbers')
    .update({ status: 'busy', available_since: null })
    .eq('id', claimerId)

  // 3. El ausente → BREAK penal (regla de Francisco, 063): sin posición
  //    retenida (break_held_since null — no se premia al que no estaba),
  //    contando el break del día, con el timer normal para que el cron
  //    de break vencido (028) lo baje a offline si nunca regresa.
  const absent = peers?.find(p => p.id === absentBarberId)
  await supabase
    .from('barbers')
    .update({
      status: 'break',
      available_since: null,
      break_started_at: now,
      break_held_since: null,
      break_minutes_at_start: shop?.next_break_minutes ?? 15,
      breaks_taken_today: (absent?.breaks_taken_today ?? 0) + 1,
      break_invalidating_barber_ids: [],
      break_invalidated: false,
    })
    .eq('id', absentBarberId)

  // 4. Audit — dos filas: el no_show del ausente (a break, no a offline)
  //    y el client_assigned del reclamante con claimed_from.
  await supabase.from('activity_log').insert([
    {
      shop_id: shopId,
      barber_id: absentBarberId,
      action: 'no_show',
      from_status: 'busy',
      to_status: 'break',
      metadata: {
        entry_id,
        client_name: entry.client_name,
        called_at: entry.called_at,
        released_by: 'peer_claim_after_auto_busy',
        claimed_by_barber_id: claimerId,
      },
    },
    {
      shop_id: shopId,
      barber_id: claimerId,
      action: 'client_assigned',
      metadata: {
        entry_id,
        client_name: entry.client_name,
        queue_position: entry.position,
        claimed_from_barber_id: absentBarberId,
        via: 'claim_after_auto_busy',
      },
    },
  ])

  return Response.json({
    ok: true,
    entry_id,
    client_name: entry.client_name,
    queue_position: entry.position,
  })
}
