import { NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/admin-auth'

// ============================================================
// /api/admin/panel-tokens
//
// Endpoints solo para staff de NXTUP (lista ADMIN_EMAILS env var).
// El staff genera links del Centro de Mando para cualquier shop —
// no requiere que el dueño del shop tenga cuenta ni sesión.
//
//   POST  /api/admin/panel-tokens
//         Body: { shop_id, hours, label? }
//         → 201 { id, shop_id, shop_name, token, url, expires_at, label }
//
//   GET   /api/admin/panel-tokens
//         → 200 { tokens: [{ id, shop_id, shop_name, label, expires_at,
//                            created_at, revoked_at, is_active }] }
//
//   DELETE /api/admin/panel-tokens?id=<uuid>
//         → 200 { revoked: true }
//
// Auth: cookie del admin + email en ADMIN_EMAILS. Sin admin →
// 403 inmediato. La generación misma usa admin client (service
// role) para poder crear/listar tokens de cualquier shop sin RLS.
// ============================================================

const HOURS_MIN = 1
const HOURS_MAX = 24 * 30

function getBaseUrl(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https'
  const host = request.headers.get('host')
  if (host) return `${proto}://${host}`
  return process.env.NEXT_PUBLIC_SITE_URL ?? 'https://getnxtup.com'
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: Response }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false, res: Response.json({ error: 'No autenticado' }, { status: 401 }) }
  }
  if (!isAdminUser(user.email)) {
    return { ok: false, res: Response.json({ error: 'No autorizado' }, { status: 403 }) }
  }
  return { ok: true }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.res

  let body: { shop_id?: string; hours?: number; label?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const shopId = body.shop_id
  if (!shopId || typeof shopId !== 'string') {
    return Response.json({ error: 'shop_id requerido' }, { status: 400 })
  }

  const hours = Number(body.hours)
  if (!Number.isFinite(hours) || hours < HOURS_MIN || hours > HOURS_MAX) {
    return Response.json(
      { error: `Duración inválida (${HOURS_MIN}–${HOURS_MAX} horas)` },
      { status: 400 },
    )
  }

  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 80) : null

  const admin = createAdminClient()
  // Validar que el shop exista (mensaje claro si pegan un UUID malo).
  const { data: shop } = await admin
    .from('shops')
    .select('id, name')
    .eq('id', shopId)
    .maybeSingle()
  if (!shop) {
    return Response.json({ error: 'Shop no encontrado' }, { status: 404 })
  }

  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

  const { data: inserted, error } = await admin
    .from('shop_control_tokens')
    .insert({
      shop_id: shopId,
      token,
      label,
      expires_at: expiresAt,
    })
    .select('id, label, expires_at, created_at')
    .single()

  if (error) {
    console.error('[admin/panel-tokens] insert failed', error)
    return Response.json(
      { error: error.message || 'No se pudo crear el token' },
      { status: 500 },
    )
  }

  const url = `${getBaseUrl(request)}/panel/${shopId}?t=${token}`

  return Response.json(
    {
      id: inserted.id,
      shop_id: shopId,
      shop_name: shop.name,
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
  const auth = await requireAdmin()
  if (!auth.ok) return auth.res

  const admin = createAdminClient()
  // Join con shops para mostrar el nombre. Order por created_at desc
  // para que los más recientes salgan arriba.
  const { data: rows, error } = await admin
    .from('shop_control_tokens')
    .select('id, shop_id, label, expires_at, created_at, revoked_at, shops:shop_id(name)')
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  const now = Date.now()
  const tokens = (rows ?? []).map(r => {
    const row = r as {
      id: string
      shop_id: string
      label: string | null
      expires_at: string
      created_at: string
      revoked_at: string | null
      shops: { name: string } | { name: string }[] | null
    }
    // PostgREST puede devolver el join como objeto o array de uno.
    const shopName = Array.isArray(row.shops)
      ? row.shops[0]?.name ?? '(sin nombre)'
      : row.shops?.name ?? '(sin nombre)'
    return {
      id: row.id,
      shop_id: row.shop_id,
      shop_name: shopName,
      label: row.label,
      expires_at: row.expires_at,
      created_at: row.created_at,
      revoked_at: row.revoked_at,
      is_active:
        !row.revoked_at && new Date(row.expires_at).getTime() > now,
    }
  })

  return Response.json({ tokens })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.res

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) {
    return Response.json({ error: 'Falta query param id' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('shop_control_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .is('revoked_at', null)

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ revoked: true })
}
