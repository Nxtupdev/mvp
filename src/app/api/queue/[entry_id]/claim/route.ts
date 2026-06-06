import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'

/**
 * POST /api/queue/[entry_id]/claim
 *
 * "Tomar yo" — lets the next-available barber pre-empt the 5-min
 * auto-release when the originally called barber walks off the floor.
 * The negligent barber gets bumped to offline + activity log entry,
 * the entry is reassigned to the caller (re-calling them so they
 * can immediately go BUSY with the client).
 *
 * Body: { barber_id: uuid }   // the claimer
 *
 * Guards (in order):
 *   1. Entry must still be 'called' (race against the original barber
 *      finally tapping BUSY, or against another claimer).
 *   2. The 'called' must be at least 60s old. The grace window stops
 *      barbers from racing to steal each other's freshly-called clients.
 *   3. The claimer must be ACTIVE (status='available') with a valid
 *      FIFO position.
 *   4. The claimer must in fact be the NEXT-available barber in FIFO
 *      order, excluding the negligent one. So #3 can't jump #2.
 *   5. WiFi presence check (same trusted_public_ip gate as state).
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

  // Fetch the entry and its current state in one round trip.
  const { data: entry } = await supabase
    .from('queue_entries')
    .select('id, shop_id, status, barber_id, client_name, called_at, position')
    .eq('id', entry_id)
    .single()

  if (!entry) {
    return Response.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }
  if (entry.status !== 'called') {
    return Response.json(
      { error: 'El cliente ya no está disponible' },
      { status: 409 },
    )
  }
  if (!entry.called_at) {
    return Response.json({ error: 'Estado inválido' }, { status: 409 })
  }

  const negligentBarberId: string = entry.barber_id
  const shopId: string = entry.shop_id
  const calledAtMs = new Date(entry.called_at).getTime()
  const ageSec = (Date.now() - calledAtMs) / 1000

  if (ageSec < 60) {
    return Response.json(
      {
        error: 'Esperá un poco — el barbero podría estar caminando todavía',
        code: 'too_soon',
        seconds_until_claimable: Math.ceil(60 - ageSec),
      },
      { status: 403 },
    )
  }

  if (claimerId === negligentBarberId) {
    return Response.json(
      { error: 'No puedes tomar tu propio cliente — toca BUSY' },
      { status: 400 },
    )
  }

  // Verify claimer is ACTIVE in this shop, fetch peers in one shot.
  const { data: peers } = await supabase
    .from('barbers')
    .select('id, shop_id, status, available_since, sanctioned_until')
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
  // "Tomar yo" — esa sería la forma más obvia de saltarse la sanción.
  // El cliente abandonado se considera walk-in (originalmente fue
  // auto-asignado al negligente), y los sancionados no reciben walk-ins.
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

  // Compute "next available" — anyone ACTIVE with a FIFO position,
  // excluding the negligent barber and sancionados. The smallest
  // available_since (earliest into the queue) is the rightful next claimer.
  const fifoCandidates = (peers ?? [])
    .filter(
      p =>
        p.id !== negligentBarberId &&
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

  // WiFi presence — same gate as /api/barbers/[id]/state. Even though
  // the claimer is presumably IN the shop (they're ACTIVE), we honor
  // the rule consistently: any meaningful queue mutation requires the
  // shop's WiFi.
  const { data: shop } = await supabase
    .from('shops')
    .select('trusted_public_ip')
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

  // ── Mutations (best-effort sequence — if a later step errors we
  // log it but still acknowledge the take, because the client has
  // already swapped barbers visually). ──
  //
  // 1. Reassign the entry to the claimer + reset called_at so the
  //    5-min countdown restarts from this moment for the new barber.
  await supabase
    .from('queue_entries')
    .update({ barber_id: claimerId, called_at: now })
    .eq('id', entry_id)

  // 2. Negligent barber → offline + cleared break state.
  await supabase
    .from('barbers')
    .update({
      status: 'offline',
      available_since: null,
      break_started_at: null,
      break_held_since: null,
      break_minutes_at_start: null,
      break_invalidating_barber_ids: [],
      break_invalidated: false,
    })
    .eq('id', negligentBarberId)

  // 3. Claimer no longer has a FIFO position (they have a called
  //    client now). Mirrors the same treatment in state/route.ts.
  await supabase
    .from('barbers')
    .update({ available_since: null })
    .eq('id', claimerId)

  // 4. Audit. Two rows: one no_show against the negligent barber,
  //    one client_assigned to the claimer with `claimed_from` so
  //    the activity log tells the full story.
  await supabase.from('activity_log').insert([
    {
      shop_id: shopId,
      barber_id: negligentBarberId,
      action: 'no_show',
      from_status: 'available',
      to_status: 'offline',
      metadata: {
        entry_id,
        client_name: entry.client_name,
        called_at: entry.called_at,
        minutes_elapsed: Math.round(ageSec / 60),
        released_by: 'peer_claim',
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
        claimed_from_barber_id: negligentBarberId,
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
