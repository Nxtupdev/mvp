import type Stripe from 'stripe'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { subscriptionPeriodEnd } from '@/lib/billing'

/**
 * POST /api/stripe/webhook
 *
 * Recibe eventos de Stripe, verifica la firma con el RAW body, y sincroniza
 * el estado de la suscripción a Supabase (tabla subscriptions) usando el
 * admin client (service role). Fuente de verdad del billing → esto.
 *
 * Configurar en Stripe → Developers → Webhooks apuntando a
 * https://www.getnxtup.com/api/stripe/webhook con el secret en
 * STRIPE_WEBHOOK_SECRET. Eventos: customer.subscription.* +
 * checkout.session.completed.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) {
    return Response.json({ error: 'Webhook no configurado' }, { status: 500 })
  }
  const sig = request.headers.get('stripe-signature')
  if (!sig) return Response.json({ error: 'Sin firma' }, { status: 400 })

  const body = await request.text()
  const stripe = getStripe()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(body, sig, secret)
  } catch (err) {
    console.error(
      '[stripe/webhook] firma inválida:',
      err instanceof Error ? err.message : err,
    )
    return Response.json({ error: 'Firma inválida' }, { status: 400 })
  }

  const admin = createAdminClient()

  async function syncSubscription(
    sub: Stripe.Subscription,
    fallbackShopId?: string | null,
  ) {
    const customerId =
      typeof sub.customer === 'string' ? sub.customer : sub.customer.id
    const shopId =
      (sub.metadata?.shop_id as string | undefined) ?? fallbackShopId ?? null
    const periodEnd = subscriptionPeriodEnd(sub)
    const patch = {
      stripe_customer_id: customerId,
      stripe_subscription_id: sub.id,
      status: sub.status,
      price_id: sub.items?.data?.[0]?.price?.id ?? null,
      plan: (sub.metadata?.plan as string | undefined) ?? null,
      current_period_end: periodEnd
        ? new Date(periodEnd * 1000).toISOString()
        : null,
      cancel_at_period_end: sub.cancel_at_period_end ?? false,
      trial_end: sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    if (shopId) {
      await admin.from('subscriptions').upsert({ shop_id: shopId, ...patch })
    } else {
      // Sin shop_id en metadata → ubicar por el customer ya guardado.
      await admin
        .from('subscriptions')
        .update(patch)
        .eq('stripe_customer_id', customerId)
    }
  }

  try {
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription)
        break
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id
          const sub = await stripe.subscriptions.retrieve(subId)
          await syncSubscription(sub, session.metadata?.shop_id ?? null)
        }
        break
      }
      default:
        break
    }
  } catch (err) {
    console.error(
      '[stripe/webhook] error procesando',
      event.type,
      err instanceof Error ? err.message : err,
    )
    return Response.json({ error: 'Error procesando el evento' }, { status: 500 })
  }

  return Response.json({ received: true })
}
