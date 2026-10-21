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
  let carrierName = ''
  let authorizedName = ''
  let titular = false
  try {
    const body = await request.json()
    choice = String(body?.choice ?? '')
    requestedNumber = String(body?.requested_number ?? '').trim()
    currentNumber = normalizeE164(String(body?.current_number ?? ''))
    carrierName = String(body?.carrier_name ?? '').trim().slice(0, 80)
    authorizedName = String(body?.authorized_name ?? '').trim().slice(0, 120)
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
  // Porte (contrato FINAL 19-oct, opción A de Francisco): NXTUP captura
  // SOLO lo no sensible — número a portar, operador, nombre del titular
  // y el checkbox de titularidad. Cuenta/PIN/factura/LOA van DIRECTO al
  // enlace seguro de Mamacita (intake_url) y jamás tocan NXTUP.
  if (choice === 'port' && (!currentNumber || !titular)) {
    return Response.json(
      { error: 'Faltan datos del porte (número actual y titularidad).' },
      { status: 400 },
    )
  }
  // Desvío (079): número nuevo elegido de la lista + el número público
  // actual del dueño (sus clientes lo siguen marcando; el carrier
  // desvía hacia el de Julie). Sin titularidad: no se transfiere nada.
  if (
    choice === 'forward' &&
    (!/^\+1\d{10}$/.test(requestedNumber) || !currentNumber)
  ) {
    return Response.json(
      { error: 'Faltan datos del desvío (número elegido y tu número actual).' },
      { status: 400 },
    )
  }
  if (choice !== 'buy' && choice !== 'port' && choice !== 'forward') {
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

  // ── PORTE: endpoint y contrato propios (mamacita-port-request) ────
  // Respuesta: { status:'collecting', port_request_id, intake_url } —
  // el enlace seguro donde el dueño mete lo sensible. Se espeja como
  // info_required + intake_url y la página lo muestra hasta completar.
  if (choice === 'port') {
    const portUrl = process.env.MAMACITA_PORT_REQUEST_URL
    if (!portUrl) {
      return Response.json(
        { error: 'El porte de números aún no está conectado.' },
        { status: 503 },
      )
    }
    try {
      const res = await signedMamacitaPost(portUrl, {
        shop_id: shop.id,
        phone_number: currentNumber,
        ...(carrierName ? { carrier_name: carrierName } : {}),
        ...(authorizedName ? { authorized_name: authorizedName } : {}),
      })
      const body = (res.body ?? {}) as { status?: string; intake_url?: string }
      if (res.status !== 200 || body.status !== 'collecting' || !body.intake_url) {
        console.error('[julie/number/request] port-request respondió', res.status, res.body)
        return Response.json(
          { error: 'No se pudo iniciar el porte — intenta de nuevo.' },
          { status: 502 },
        )
      }
      const { error: upsertErr } = await admin.from('julie_numbers').upsert({
        shop_id: shop.id,
        choice: 'port',
        requested_number: null,
        current_number: currentNumber,
        status: 'info_required', // = "collecting" del lado Mamacita
        intake_url: body.intake_url,
        fail_reason: null,
        updated_at: new Date().toISOString(),
      })
      if (upsertErr) {
        console.error('[julie/number/request] port upsert failed', upsertErr)
        return Response.json(
          { error: 'No se pudo guardar el estado del porte — intenta de nuevo.' },
          { status: 500 },
        )
      }
      return Response.json({ status: 'info_required', intake_url: body.intake_url })
    } catch (err) {
      console.error('[julie/number/request] port error', err)
      return Response.json(
        { error: 'No se pudo iniciar el porte — intenta de nuevo.' },
        { status: 502 },
      )
    }
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
            choice: 'forward',
            requested_number: requestedNumber,
            current_number: currentNumber,
            owner_name: shop.name,
          }
    const res = await signedMamacitaPost(url, payload)
    const body = (res.body ?? {}) as {
      status?: string
      number?: string
      fail_reason?: string
      numbers?: string[]
      // Desvío (079): pasos de configuración bilingües que la UI
      // muestra al dueño hasta que verifique la llamada de prueba.
      setup?: string
      forward_to?: string
      instructions?: unknown
    }
    if (res.status !== 200 || !body.status) {
      console.error('[julie/number/request] mamacita respondió', res.status, res.body)
      return Response.json(
        { error: 'No se pudo completar la compra — intenta de nuevo.' },
        { status: 502 },
      )
    }
    // Un failed viaja en un 200 "exitoso" y sin esto queda invisible en
    // los logs (incidente NuevaYol 21-oct: primera compra real fallida y
    // hubo que pedirle el motivo al otro lado a ciegas).
    if (body.status === 'failed') {
      console.error('[julie/number/request] compra FALLIDA', {
        shop_id: shop.id,
        choice,
        fail_reason: body.fail_reason ?? null,
      })
    }

    // Espejo de estado para la UI (service role; el dueño solo lee).
    // owner_phone NO se guarda: solo viaja a Mamacita para el contacto.
    await admin.from('julie_numbers').upsert({
      shop_id: shop.id,
      choice,
      requested_number: requestedNumber,
      current_number: choice === 'forward' ? currentNumber : null,
      status: body.status,
      number: body.status === 'completed' ? body.number ?? null : null,
      fail_reason: body.status === 'failed' ? body.fail_reason ?? null : null,
      ...(choice === 'forward'
        ? { instructions: body.instructions ?? null, forward_verified: false }
        : {}),
      updated_at: new Date().toISOString(),
    })

    return Response.json({
      status: body.status,
      number: body.number ?? null,
      fail_reason: body.fail_reason ?? null,
      numbers: body.numbers ?? null, // alternativas frescas si number_taken
      instructions: choice === 'forward' ? body.instructions ?? null : null,
    })
  } catch (err) {
    console.error('[julie/number/request] error', err)
    return Response.json(
      { error: 'No se pudo completar la compra — intenta de nuevo.' },
      { status: 502 },
    )
  }
}
