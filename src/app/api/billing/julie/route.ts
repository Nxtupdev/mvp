import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { JULIE_LAUNCHED, priceIdForAddon } from '@/lib/billing'
import { notifyMamacita } from '@/lib/mamacita'

/**
 * POST /api/billing/julie — activar/desactivar el add-on Julie (076).
 * Body: { action: 'activate' | 'deactivate' }
 *
 * Julie es un ITEM extra dentro de la suscripción Stripe existente del
 * shop (factura única), nunca una suscripción aparte. Reglas (17-oct):
 *
 *   * Activar = agregar el item con prorrateo FACTURADO Y COBRADO al
 *     instante (`always_invoice`) y que falla si el pago falla
 *     (`error_if_incomplete`) → Julie enciende solo tras aceptar el
 *     pago, cero días gratis (el costo de Julie es variable y real).
 *   * Desactivar = quitar el item SIN crédito (`proration_behavior:
 *     'none'`): pagó el mes, lo tiene pagado, pero el flag se apaga ya.
 *   * Requiere la suscripción del Queue ACTIVA y billing_mode 'stripe'
 *     (comp/contract se acuerdan con los socios, no con un botón).
 *
 * El webhook es la fuente de verdad del flag, pero aquí también se
 * espeja julie_active + se emite julie_enabled a Mamacita al terminar,
 * para que la UI y Julie reaccionen al instante sin esperar el webhook;
 * el guard "sin cambio" del webhook de-duplica la segunda pasada.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'No autenticado' }, { status: 401 })

  let action: string | null = null
  try {
    const body = await request.json()
    action = typeof body?.action === 'string' ? body.action : null
  } catch {
    // body inválido → cae al check de abajo
  }
  if (action !== 'activate' && action !== 'deactivate') {
    return Response.json({ error: 'action inválida' }, { status: 400 })
  }

  const juliePriceId = priceIdForAddon('julie')
  // Activar exige env + lanzamiento encendido (mismo doble candado que
  // la card). Desactivar queda SIEMPRE permitido como válvula de escape:
  // si alguien llegó a activar antes del candado, puede salirse.
  if (!juliePriceId || (action === 'activate' && !JULIE_LAUNCHED)) {
    return Response.json(
      { error: 'Julie aún no está disponible.' },
      { status: 400 },
    )
  }

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) return Response.json({ error: 'No tienes una barbería' }, { status: 404 })

  const admin = createAdminClient()
  const { data: subRow } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, status, billing_mode, julie_active')
    .eq('shop_id', shop.id)
    .maybeSingle()

  if (subRow?.billing_mode === 'contract' || subRow?.billing_mode === 'comp') {
    return Response.json(
      { error: 'Tu facturación es por acuerdo directo — escríbenos para activar Julie.' },
      { status: 400 },
    )
  }
  const subId = subRow?.stripe_subscription_id as string | null | undefined
  if (!subId || subRow?.status !== 'active') {
    return Response.json(
      { error: 'Julie requiere la suscripción de NXTUP Queue activa.' },
      { status: 400 },
    )
  }

  const stripe = getStripe()

  // Espejo local + aviso a Mamacita. Guard de "sin cambio" en AMBOS
  // lados (aquí y en el webhook): el que llegue primero escribe y avisa,
  // el segundo ve el valor ya puesto y calla — sin aviso doble.
  async function mirror(julieActive: boolean) {
    const { data: current } = await admin
      .from('subscriptions')
      .select('julie_active')
      .eq('shop_id', shop!.id)
      .maybeSingle()
    if (!current || current.julie_active === julieActive) return

    const { error } = await admin
      .from('subscriptions')
      .update({ julie_active: julieActive, updated_at: new Date().toISOString() })
      .eq('shop_id', shop!.id)
    if (error) {
      console.error('[billing/julie] mirror update failed', error)
      return
    }
    await notifyMamacita({
      event: 'shop_profile_updated',
      nxtup_shop_id: shop!.id,
      julie_enabled: julieActive,
    })
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subId)
    const julieItem = sub.items.data.find(it => it.price?.id === juliePriceId)

    if (action === 'activate') {
      if (!julieItem) {
        await stripe.subscriptions.update(subId, {
          items: [{ price: juliePriceId, quantity: 1 }],
          proration_behavior: 'always_invoice',
          payment_behavior: 'error_if_incomplete',
        })
      }
      await mirror(true)
      return Response.json({ ok: true, julie_active: true })
    }

    // deactivate
    if (julieItem) {
      await stripe.subscriptions.update(subId, {
        items: [{ id: julieItem.id, deleted: true }],
        proration_behavior: 'none',
      })
    }
    await mirror(false)
    return Response.json({ ok: true, julie_active: false })
  } catch (err) {
    console.error('[billing/julie] stripe update failed', err)
    // El caso esperable aquí es el pago rechazado en la activación
    // (error_if_incomplete revierte el item). 402 = "no se pudo cobrar".
    return Response.json(
      {
        error:
          action === 'activate'
            ? 'No se pudo cobrar la activación — revisa tu método de pago e intenta de nuevo.'
            : 'No se pudo desactivar — intenta de nuevo.',
      },
      { status: 402 },
    )
  }
}
