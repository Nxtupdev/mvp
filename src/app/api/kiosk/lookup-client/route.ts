import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit, rateLimited } from '@/lib/rate-limit'

/**
 * Kiosk client lookup — phase 1 of the new check-in flow.
 *
 * Route: POST /api/kiosk/lookup-client
 *
 * Body:
 *   { shop_id: uuid, phone: string (10+ digits, may include formatting) }
 *
 * Response:
 *   200 { client: ClientRow | null }
 *      - client: the matching row from `clients` (uniqued by
 *        shop_id + phone_number) or null if first-time visitor
 *
 *   400 { error } — missing/invalid input
 *   404 { error } — shop not found
 *
 * The PhoneScreen calls this right after the user enters their
 * number; the response decides whether to route to NewCustomerScreen
 * (client === null) or ReturningCustomerScreen (client present).
 *
 * Read-only. No mutation. No rate limiting needed at this layer —
 * the real cost gate is the check-in endpoint downstream.
 *
 * The shop existence check is here so a malicious caller probing
 * for valid phone numbers via a bogus shop_id gets a clean 404
 * rather than confusing them with "client not found" wording.
 */

type LookupBody = {
  shop_id?: string
  phone?: string
}

type ClientRow = {
  id: string
  first_name: string
  last_name: string | null
  preferred_language: 'es' | 'en' | null
  total_visits: number
  last_visit_at: string | null
}

export async function POST(request: NextRequest) {
  // Rate limit app-level por IP — read-only pero enumerable (floodear
  // teléfonos). Más holgado que checkin (30/min). Ver rate-limit.ts.
  const rl = await checkRateLimit(request, 'lookup', { limit: 30, windowSeconds: 60 })
  if (!rl.ok) return rateLimited(rl.retryAfter)

  let body: LookupBody
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { shop_id } = body
  const rawPhone = body.phone

  if (!shop_id || !rawPhone) {
    return Response.json({ error: 'shop_id y phone son requeridos' }, { status: 400 })
  }

  const phone = String(rawPhone).replace(/\D/g, '')
  if (phone.length < 10) {
    return Response.json(
      { error: 'Teléfono inválido — mínimo 10 dígitos' },
      { status: 400 },
    )
  }

  // Migración 050 (seguridad): usamos el admin client (service role)
  // en vez del cliente anónimo. Razón: la tabla `clients` dejó de
  // tener lectura pública vía RLS (antes cualquiera con la anon key
  // podía bajar todos los teléfonos por el REST API de Supabase).
  // Ahora el ÚNICO acceso a `clients` es por este endpoint server-side,
  // que valida shop_id y formato de teléfono antes de leer. El admin
  // client bypassa RLS de forma controlada — la seguridad vive en
  // este código, no en una policy pública.
  const supabase = createAdminClient()

  // Cheap existence check so a malicious caller can't enumerate
  // phone numbers against arbitrary shop_ids — gets a clear 404
  // instead of getting different shapes for valid/invalid shops.
  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('id', shop_id)
    .single()

  if (!shop) {
    return Response.json({ error: 'Barbería no encontrada' }, { status: 404 })
  }

  const { data: client } = await supabase
    .from('clients')
    .select(
      'id, first_name, last_name, preferred_language, total_visits, last_visit_at',
    )
    .eq('shop_id', shop_id)
    .eq('phone_number', phone)
    .maybeSingle()

  return Response.json({ client: (client as ClientRow | null) ?? null })
}
