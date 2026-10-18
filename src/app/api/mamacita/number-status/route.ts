import { createAdminClient } from '@/lib/supabase/admin'
import { verifyMamacitaSignature } from '@/lib/mamacita'

/**
 * POST /api/mamacita/number-status — Mamacita empuja el avance ASYNC de
 * una provisión de número de Julie (contrato 17-oct): la compra suele
 * resolverse en la misma respuesta de number_request, pero el PORTE
 * vive días (info_required → porting_in_progress → completed/failed) y
 * este endpoint es como ese avance llega al espejo de NXTUP (077).
 *
 * Body firmado (HMAC x-mamacita-signature, como los demás inbound):
 *   { shop_id, status, number?, fail_reason? }
 */

const VALID_STATUSES = new Set([
  'info_required',
  'submitted',
  'porting_in_progress',
  'completed',
  'failed',
])

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!verifyMamacitaSignature(request, rawBody)) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { shop_id?: string; status?: string; number?: string; fail_reason?: string }
  try {
    body = JSON.parse(rawBody)
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  const { shop_id, status } = body
  if (!shop_id || !status || !VALID_STATUSES.has(status)) {
    return Response.json({ error: 'shop_id y status válidos son requeridos' }, { status: 400 })
  }

  const admin = createAdminClient()

  // El shop debe existir — evita que un status huérfano cree filas basura.
  const { data: shop } = await admin
    .from('shops')
    .select('id')
    .eq('id', shop_id)
    .maybeSingle()
  if (!shop) return Response.json({ error: 'Shop no encontrado' }, { status: 404 })

  const { error } = await admin.from('julie_numbers').upsert({
    shop_id,
    status,
    number: status === 'completed' ? body.number ?? null : null,
    fail_reason: status === 'failed' ? body.fail_reason ?? null : null,
    updated_at: new Date().toISOString(),
  })
  if (error) {
    console.error('[mamacita/number-status] upsert failed', error)
    return Response.json({ error: 'No se pudo guardar el estado' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
