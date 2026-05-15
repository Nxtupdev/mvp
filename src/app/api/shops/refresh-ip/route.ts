import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/client-ip'

/**
 * POST /api/shops/refresh-ip
 *
 * Captures the public IP of the current request and saves it as the
 * shop's trusted_public_ip. The owner must be authenticated; the shop
 * is resolved from `owner_id = auth.uid()` via RLS.
 *
 * Intended UX: owner walks into the shop, opens Settings on their phone
 * connected to the shop WiFi, taps "Registrar IP de la barbería". The
 * server saves whatever IP it sees on that request.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  const ip = getClientIp(request)
  if (!ip) {
    return Response.json(
      { error: 'No se pudo determinar tu IP. Probá desde Wi-Fi (no datos móviles).' },
      { status: 400 },
    )
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!shop) {
    return Response.json({ error: 'No tenés un shop asociado' }, { status: 404 })
  }

  const { error: updateErr } = await supabase
    .from('shops')
    .update({ trusted_public_ip: ip })
    .eq('id', shop.id)

  if (updateErr) {
    return Response.json({ error: updateErr.message }, { status: 500 })
  }

  return Response.json({ ok: true, trusted_public_ip: ip })
}

/**
 * DELETE /api/shops/refresh-ip
 *
 * Clears the trusted IP — disables the anti-cheat check entirely for
 * this shop. Useful while debugging or for shops that don't care.
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!shop) {
    return Response.json({ error: 'No tenés un shop asociado' }, { status: 404 })
  }

  const { error } = await supabase
    .from('shops')
    .update({ trusted_public_ip: null })
    .eq('id', shop.id)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
