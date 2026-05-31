import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'

// ============================================================
// /api/dashboard/panel-tokens
//
// Owner-only endpoints para manejar tokens del Centro de Mando
// temporal (migración 043). Cookie de dueño es la única auth —
// solo el dueño del shop puede generar/listar/revocar tokens
// que dan acceso a SU shop. RLS de la tabla shop_control_tokens
// garantiza la separación entre shops.
//
//   POST  /api/dashboard/panel-tokens
//         Body: { hours: number, label?: string }
//         → 201 { id, token, url, expires_at, label }
//
//   GET   /api/dashboard/panel-tokens
//         → 200 { tokens: [{ id, label, expires_at, created_at,
//                            revoked_at, is_active }] }
//
//   DELETE /api/dashboard/panel-tokens?id=<uuid>
//         → 200 { revoked: true }
//
// El POST devuelve el `token` plano una sola vez — el frontend lo
// muestra al dueño con un botón "Copiar link". En el GET solo se
// devuelve el id (no el token), porque el token plano no debe
// volver a leerse después de la creación.
// ============================================================

const HOURS_MIN = 1
const HOURS_MAX = 24 * 30 // 30 días

function getBaseUrl(request: NextRequest): string {
  // Preferir el host del request para que el link generado matchee
  // el ambiente desde el que se genera (prod, preview, localhost).
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('host')
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getnxtup.com'
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: { hours?: number; label?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const hours = Number(body.hours)
  if (!Number.isFinite(hours) || hours < HOURS_MIN || hours > HOURS_MAX) {
    return Response.json(
      { error: `Duración inválida (${HOURS_MIN}–${HOURS_MAX} horas)` },
      { status: 400 },
    )
  }

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : null

  // Resolve owner's shop. NXTUP es one-shop-per-owner por ahora —
  // si en el futuro se permiten múltiples shops, este endpoint
  // tendrá que aceptar un shop_id explícito y validar ownership.
  const { data: shop } = await supabase
    .from('shops')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) {
    return Response.json({ error: 'No hay shop asociado a este usuario' }, { status: 404 })
  }

  // Token URL-safe de 32 bytes → ~43 chars base64url. Suficiente entropía
  // para hacer brute-force inviable. unique constraint en la tabla.
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

  const { data: inserted, error } = await supabase
    .from('shop_control_tokens')
    .insert({
      shop_id: shop.id,
      token,
      label,
      expires_at: expiresAt,
    })
    .select('id, label, expires_at, created_at')
    .single()

  if (error) {
    console.error('[panel-tokens] insert failed', error)
    return Response.json(
      { error: error.message || 'No se pudo crear el token' },
      { status: 500 },
    )
  }

  const url = `${getBaseUrl(request)}/panel/${shop.id}?t=${token}`

  return Response.json(
    {
      id: inserted.id,
      token,
      url,
      label: inserted.label,
      expires_at: inserted.expires_at,
      created_at: inserted.created_at,
    },
    { status: 201 },
  )
}

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  // RLS scope esto al owner. Listamos sin el `token` plano — solo
  // metadata para que el dueño pueda revocar.
  const { data: rows, error } = await supabase
    .from('shop_control_tokens')
    .select('id, label, expires_at, created_at, revoked_at')
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const now = Date.now()
  const tokens = (rows ?? []).map(r => ({
    id: r.id,
    label: r.label,
    expires_at: r.expires_at,
    created_at: r.created_at,
    revoked_at: r.revoked_at,
    is_active:
      !r.revoked_at && new Date(r.expires_at).getTime() > now,
  }))

  return Response.json({ tokens })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'Falta query param id' }, { status: 400 })
  }

  // RLS asegura que solo se actualicen tokens del owner autenticado.
  const { error } = await supabase
    .from('shop_control_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ revoked: true })
}
