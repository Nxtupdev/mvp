import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStripe } from '@/lib/stripe'

/**
 * POST /api/billing/portal
 *
 * Abre el Stripe Billing Portal para que el dueño gestione/cancele su
 * suscripción o actualice el método de pago. Devuelve { url }.
 */
export async function POST(request: Request) {
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
  const { data: subRow } = await admin
    .from('subscriptions')
    .select('stripe_customer_id')
    .eq('shop_id', shop.id)
    .maybeSingle()

  const customerId = subRow?.stripe_customer_id as string | null | undefined
  if (!customerId) {
    return Response.json(
      { error: 'Todavía no tienes facturación configurada.' },
      { status: 400 },
    )
  }

  const stripe = getStripe()
  const origin = request.headers.get('origin') ?? new URL(request.url).origin
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${origin}/dashboard/billing`,
  })

  return Response.json({ url: session.url })
}
