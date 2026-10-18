import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signedMamacitaPost } from '@/lib/mamacita'

/**
 * POST /api/julie/number/verify — verificación del DESVÍO (079).
 *
 * Tras configurar el desvío en su carrier, el dueño hace una llamada de
 * prueba a su número público y toca "Verificar": esto consulta a
 * Mamacita (mamacita-number-verify, firmado) si la llamada llegó al
 * número de Julie.
 *
 * Respuesta de Mamacita:
 *   { verified: true, callerid_ok, last_from, last_call_at }
 *   { verified: false, note }
 *
 * verified=true se espeja en julie_numbers.forward_verified (la página
 * pasa de "configura el desvío" a "número activo"). callerid_ok=false
 * se devuelve al cliente como advertencia: el desvío funciona pero el
 * operador no pasa el número del cliente → las confirmaciones por
 * WhatsApp y el dedup se ven afectados; sugerir desvío condicional o
 * revisar la config del operador.
 */
export async function POST(_request: Request) {
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

  const admin = createAdminClient()
  const { data: numRow } = await admin
    .from('julie_numbers')
    .select('choice, status')
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (numRow?.choice !== 'forward' || numRow.status !== 'completed') {
    return Response.json(
      { error: 'No hay un desvío pendiente de verificar.' },
      { status: 400 },
    )
  }

  const url = process.env.MAMACITA_NUMBER_VERIFY_URL
  if (!url) {
    return Response.json(
      { error: 'La verificación del desvío aún no está conectada.' },
      { status: 503 },
    )
  }

  try {
    const res = await signedMamacitaPost(url, { shop_id: shop.id })
    const body = (res.body ?? {}) as {
      verified?: boolean
      callerid_ok?: boolean
      last_from?: string
      last_call_at?: string
      note?: string
    }
    if (res.status !== 200 || typeof body.verified !== 'boolean') {
      console.error('[julie/number/verify] mamacita respondió', res.status, res.body)
      return Response.json(
        { error: 'No se pudo verificar — intenta de nuevo.' },
        { status: 502 },
      )
    }

    if (body.verified) {
      const { error } = await admin
        .from('julie_numbers')
        .update({ forward_verified: true, updated_at: new Date().toISOString() })
        .eq('shop_id', shop.id)
      if (error) console.error('[julie/number/verify] update failed', error)
    }

    return Response.json({
      verified: body.verified,
      callerid_ok: body.callerid_ok ?? null,
      note: body.note ?? null,
    })
  } catch (err) {
    console.error('[julie/number/verify] error', err)
    return Response.json(
      { error: 'No se pudo verificar — intenta de nuevo.' },
      { status: 502 },
    )
  }
}
