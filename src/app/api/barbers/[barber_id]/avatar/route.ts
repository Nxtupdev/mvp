import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'

/**
 * PATCH /api/barbers/[barber_id]/avatar
 *
 * Lets the barber update their own avatar from their dashboard, which
 * isn't authenticated (no login). The "auth" here is the unguessable
 * UUID in the URL plus the same shop-WiFi presence check the state
 * endpoint uses — so a leaked URL alone isn't enough to mess with
 * someone's avatar from across the world.
 *
 * Uses the service-role client so it can bypass owner-only RLS.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params

  let body: { avatar?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Accept null (clear) or any string — the avatar list lives in app code,
  // not the DB, so we trust the client to send a valid ID. Worst case the
  // UI renders the fallback initials.
  const newAvatar: string | null = body.avatar ?? null

  const supabase = createAdminClient()

  // Presence gate — same model as /api/barbers/[id]/state. We need
  // the barber's shop_id first to look up the trusted IP. If the
  // shop has no trusted IP configured we let the request through
  // (back-compat with shops on the old schema).
  const { data: barber } = await supabase
    .from('barbers')
    .select('shop_id')
    .eq('id', barber_id)
    .single()
  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }
  const { data: shop } = await supabase
    .from('shops')
    .select('trusted_public_ip')
    .eq('id', barber.shop_id)
    .single()
  if (shop?.trusted_public_ip) {
    const clientIp = getClientIp(request)
    if (!clientIp || clientIp !== shop.trusted_public_ip) {
      return Response.json(
        {
          error: 'Conectate al WiFi de la barbería para cambiar tu ícono',
          code: 'not_in_shop',
          client_ip: clientIp,
        },
        { status: 403 },
      )
    }
  }

  const { data, error } = await supabase
    .from('barbers')
    .update({ avatar: newAvatar })
    .eq('id', barber_id)
    .select('id, avatar')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }

  return Response.json({ ok: true, avatar: data.avatar })
}
