import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'
import { isPlanKey, priceIdForPlan, type PlanKey } from '@/lib/billing'

/**
 * POST /api/billing/checkout
 *
 * Crea una sesión de Stripe Checkout (modo suscripción) para el shop del
 * dueño logueado. Body opcional: { plan?: 'pro' }. Devuelve { url } para
 * redirigir. El estado real de la suscripción lo escribe el webhook, no
 * esta ruta.
 */
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

  let planRaw = 'pro'
  try {
    const body = await request.json()
    if (body?.plan) planRaw = String(body.plan)
  } catch {
    // sin body → usa el default
  }
  if (!isPlanKey(planRaw)) {
    return Response.json({ error: 'Plan inválido' }, { status: 400 })
  }
  const plan: PlanKey = planRaw
  const priceId = priceIdForPlan(plan)
  if (!priceId) {
    return Response.json(
      { error: 'Plan no configurado — falta el price id de Stripe en la env.' },
      { status: 400 },
    )
  }

  const stripe = getStripe()
  const admin = createAdminClient()

  // get-or-create del Customer (guardado en subscriptions).
  const { data: subRow } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('shop_id', shop.id)
    .maybeSingle()

  let customerId = subRow?.stripe_customer_id as string | null | undefined
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email ?? undefined,
      name: shop.name,
      metadata: { shop_id: shop.id, owner_id: user.id },
    })
    customerId = customer.id
    await admin.from('subscriptions').upsert({
      shop_id: shop.id,
      stripe_customer_id: customerId,
      updated_at: new Date().toISOString(),
    })
  }

  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    allow_promotion_codes: true,
    success_url: `${origin}/dashboard/billing?success=1`,
    cancel_url: `${origin}/dashboard/billing?canceled=1`,
    metadata: { shop_id: shop.id, plan },
    subscription_data: { metadata: { shop_id: shop.id, plan } },
  })

  return Response.json({ url: session.url })
}
