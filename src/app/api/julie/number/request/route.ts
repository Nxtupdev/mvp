import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { JULIE_PORT_ENABLED } from '@/lib/billing'
import { signedMamacitaPost } from '@/lib/mamacita'

/**
 * POST /api/julie/number/request — pide a Mamacita la provisión del
 * número de Julie (contrato 17-oct). v1 = COMPRA; el PORTE es fase 2
 * del lado Mamacita y aquí se rechaza hasta que exista.
 *
 * Body: { choice: 'buy', requested_number: '+1919...' } (el E.164
 * exacto que el dueño eligió de la lista de /search — Twilio no
 * reserva, así que si se vendió en la ventana Mamacita responde
 * failed/number_taken con alternativas frescas y la UI pide elegir de
 * nuevo; NUNCA se compra un sustituto por cuenta de nadie).
 *
 * Respuesta esperada de Mamacita:
 *   { status: 'completed', number: '+1...' }   ← comprado + conectado a
 *                                                VAPI + asociado al shop
 *   { status: 'failed', fail_reason: 'number_taken', numbers: [...] }
 *   { status: 'submitted' }                    ← provisión async; el
 *     avance llega después por /api/mamacita/number-status.
 *
 * El resultado se espeja en julie_numbers (077) para la UI.
 */
/** 10 u 11 dígitos tecleados → E.164, o '' si no es usable. */
function normalizeE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return ''
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) return Response.json({ error: 'No tienes una barbería' }, { status: 404 })

  const admin = createAdminClient()
  const { data: subRow } = await admin
    .from('subscriptions')
    .select('julie_active')
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (!subRow?.julie_active) {
    return Response.json(
      { error: 'Activa Julie primero — el número se configura después del pago.' },
      { status: 400 },
    )
  }

  let choice = ''
  let requestedNumber = ''
  let currentNumber = ''
  let ownerPhone = ''
  let titular = false
  try {
    const body = await request.json()
    choice = String(body?.choice ?? '')
    requestedNumber = String(body?.requested_number ?? '').trim()
    currentNumber = normalizeE164(String(body?.current_number ?? ''))
    ownerPhone = normalizeE164(String(body?.owner_phone ?? ''))
    titular = body?.titular === true
  } catch {
    // cae a las validaciones de abajo
  }
  if (choice === 'port' && !JULIE_PORT_ENABLED) {
    return Response.json(
      { error: 'Portar tu número llega pronto — por ahora compra uno nuevo.' },
      { status: 400 },
    )
  }
  if (choice === 'buy' && !/^\+1\d{10}$/.test(requestedNumber)) {
    return Response.json({ error: 'Pedido inválido' }, { status: 400 })
  }
  // Porte (contrato 17-oct): NXTUP solo captura lo NO sensible — número a
  // portar, titularidad y el WhatsApp de contacto (Mamacita pide por ahí
  // los documentos del carrier en info_required; las credenciales del
  // carrier jamás pasan por NXTUP).
  if (choice === 'port' && (!currentNumber || !ownerPhone || !titular)) {
    return Response.json(
      { error: 'Faltan datos del porte (número actual, WhatsApp de contacto y titularidad).' },
      { status: 400 },
    )
  }
  if (choice !== 'buy' && choice !== 'port') {
    return Response.json({ error: 'Pedido inválido' }, { status: 400 })
  }

  // Idempotencia: con un número ya activo no se compra otro (cambiarlo
  // sería una decisión de soporte, no un botón).
  const { data: existing } = await admin
    .from('julie_numbers')
    .select('status, number')
    .eq('shop_id', shop.id)
    .maybeSingle()
  if (existing?.status === 'completed' && existing.number) {
    return Response.json(
      { error: `Tu número de Julie ya está activo: ${existing.number}` },
      { status: 409 },
    )
  }

  const url = process.env.MAMACITA_NUMBER_REQUEST_URL
  if (!url) {
    return Response.json(
      { error: 'La compra de números aún no está conectada.' },
      { status: 503 },
    )
  }

  try {
    const payload =
      choice === 'buy'
        ? {
            shop_id: shop.id,
            choice: 'buy',
            requested_number: requestedNumber,
            owner_name: shop.name,
          }
        : {
            shop_id: shop.id,
            choice: 'port',
            current_number: currentNumber,
            owner_name: shop.name,
            owner_phone: ownerPhone,
          }
    const res = await signedMamacitaPost(url, payload)
    const body = (res.body ?? {}) as {
      status?: string
      number?: string
      fail_reason?: string
      numbers?: string[]
    }
    if (res.status !== 200 || !body.status) {
      console.error('[julie/number/request] mamacita respondió', res.status, res.body)
      return Response.json(
        { error: 'No se pudo completar la compra — intenta de nuevo.' },
        { status: 502 },
      )
    }

    // Espejo de estado para la UI (service role; el dueño solo lee).
    // owner_phone NO se guarda: solo viaja a Mamacita para el contacto.
    await admin.from('julie_numbers').upsert({
      shop_id: shop.id,
      choice,
      requested_number: choice === 'buy' ? requestedNumber : null,
      current_number: choice === 'port' ? currentNumber : null,
      status: body.status,
      number: body.status === 'completed' ? body.number ?? null : null,
      fail_reason: body.status === 'failed' ? body.fail_reason ?? null : null,
      updated_at: new Date().toISOString(),
    })

    return Response.json({
      status: body.status,
      number: body.number ?? null,
      fail_reason: body.fail_reason ?? null,
      numbers: body.numbers ?? null, // alternativas frescas si number_taken
    })
  } catch (err) {
    console.error('[julie/number/request] error', err)
    return Response.json(
      { error: 'No se pudo completar la compra — intenta de nuevo.' },
      { status: 502 },
    )
  }
}
