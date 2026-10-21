import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { JULIE_LAUNCHED, priceIdForAddon, subscriptionPeriodEnd } from '@/lib/billing'
import { buildShopProfileEvent, notifyMamacita } from '@/lib/mamacita'

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

  // Memoria de pago por ciclo (081, incidente Fade Factory): select
  // APARTE y fail-open — si la columna no existe aún, alreadyPaid=false
  // y el comportamiento es el de siempre.
  const { data: paidRow } = await admin
    .from('subscriptions')
    .select('julie_paid_until')
    .eq('shop_id', shop.id)
    .maybeSingle()
  const paidUntilRaw = (paidRow as { julie_paid_until?: string | null } | null)
    ?.julie_paid_until
  const alreadyPaid = Boolean(paidUntilRaw && Date.parse(paidUntilRaw) > Date.now())

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
    // Perfil COMPLETO + flag (078): en la activación este evento es el
    // ALTA del shop en Mamacita (upsert por nxtup_shop_id) — nace con
    // nombre/horario/servicios antes de que llegue cualquier
    // number_request. En la desactivación el perfil extra es inocuo.
    //
    // DESPUÉS de responder (incidente 20-oct): este aviso (4 queries +
    // POST con timeout de 3s) corría antes del return y alargaba el
    // botón girando — el dueño de NuevaYol creyó que murió y tocó 3
    // veces. after() lo saca de la ruta crítica; el flag local ya quedó
    // escrito arriba, así que el reload pinta "Activa" sin esperar esto.
    after(async () => {
      try {
        await notifyMamacita(
          await buildShopProfileEvent(shop!.id, { julie_enabled: julieActive }),
        )
      } catch (err) {
        // Fallback flag-only: el builder jamás debe impedir el aviso.
        console.error('[billing/julie] buildShopProfileEvent failed', err)
        await notifyMamacita({
          event: 'shop_profile_updated',
          nxtup_shop_id: shop!.id,
          julie_enabled: julieActive,
        })
      }
    })
  }

  try {
    const sub = await stripe.subscriptions.retrieve(subId)
    const julieItem = sub.items.data.find(it => it.price?.id === juliePriceId)

    if (action === 'activate') {
      if (!julieItem) {
        // Clave de idempotencia por suscripción en ventana de 1 minuto:
        // dos toques CONCURRENTES del botón creaban DOS items de Julie
        // (TOCTOU: ambos leían "no existe" antes de que el otro
        // escribiera; caso real 20-oct, cliente con doble cobro). Con
        // la clave, Stripe ejecuta UNA sola activación y al toque
        // gemelo le devuelve la misma respuesta. La ventana de 1 min
        // permite re-activar legítimamente más tarde (una clave fija
        // re-serviría la respuesta vieja sin re-agregar el item).
        const minuteBucket = Math.floor(Date.now() / 60000)
        // Ciclo ya PAGADO (081): el item vuelve SIN prorrateo — reactivar
        // dentro del periodo cubierto es gratis, cobrar dos veces el
        // mismo ciclo es imposible (incidente Fade Factory 20-oct:
        // activó en la mañana, el item se quitó al mediodía, y la
        // reactivación nocturna le cobró el prorrateo completo otra vez).
        await stripe.subscriptions.update(
          subId,
          alreadyPaid
            ? {
                items: [{ price: juliePriceId, quantity: 1 }],
                proration_behavior: 'none',
              }
            : {
                items: [{ price: juliePriceId, quantity: 1 }],
                proration_behavior: 'always_invoice',
                payment_behavior: 'error_if_incomplete',
              },
          { idempotencyKey: `julie-activate-${subId}-${minuteBucket}` },
        )
      }

      // Autocuración de carreras pasadas o de borde de ventana: si la
      // suscripción quedó con items DUPLICADOS de Julie, remover los
      // extras acreditando su tiempo no usado (create_prorations).
      const fresh = await stripe.subscriptions.retrieve(subId)
      const dupes = fresh.items.data
        .filter(it => it.price?.id === juliePriceId)
        .slice(1)
      for (const extra of dupes) {
        console.error('[billing/julie] item duplicado de Julie removido:', extra.id)
        await stripe.subscriptions.update(subId, {
          items: [{ id: extra.id, deleted: true }],
          proration_behavior: 'create_prorations',
        })
      }

      // Registrar hasta cuándo quedó pagado este ciclo de Julie (081).
      // Update APARTE y tolerante (pre-migración falla solo esto).
      const periodEnd = subscriptionPeriodEnd(fresh)
      if (periodEnd) {
        const { error: paidErr } = await admin
          .from('subscriptions')
          .update({ julie_paid_until: new Date(periodEnd * 1000).toISOString() })
          .eq('shop_id', shop.id)
        if (paidErr) console.error('[billing/julie] julie_paid_until update failed', paidErr)
      }

      await mirror(true)
      return Response.json({ ok: true, julie_active: true })
    }

    // deactivate
    // Marca forense: saber QUIÉN/CUÁNDO desactivó vale oro en incidentes
    // de cobro (el del 20-oct quedó sin autor por falta de este log).
    console.log('[billing/julie] deactivate', { shop_id: shop.id, had_item: Boolean(julieItem) })
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
