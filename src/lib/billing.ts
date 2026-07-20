import type Stripe from 'stripe'

/**
 * Config de planes. Los Price ids se crean en Stripe (precios AÚN por
 * definir) y se inyectan por env var — el código NO cambia cuando se
 * definan. Agregar un plan = una fila aquí + su env var.
 */
export type PlanKey = 'pro'

export const PLANS: Record<PlanKey, { label: string; priceEnv: string }> = {
  pro: { label: 'NXTUP Pro', priceEnv: 'STRIPE_PRICE_PRO' },
}

export function isPlanKey(v: string): v is PlanKey {
  return Object.prototype.hasOwnProperty.call(PLANS, v)
}

/** Price id de Stripe para un plan, desde env. null si no está configurado. */
export function priceIdForPlan(plan: PlanKey): string | null {
  const env = PLANS[plan]?.priceEnv
  return env ? process.env[env] ?? null : null
}

/** Estados de Stripe que cuentan como "acceso activo". */
const ACTIVE_STATUSES = new Set(['trialing', 'active'])

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return !!status && ACTIVE_STATUSES.has(status)
}

/**
 * Fin del período actual, robusto a la versión del API: Stripe movió
 * `current_period_end` del objeto subscription al ITEM en API 2025+.
 * Leemos de ambos lados. Devuelve unix seconds o null.
 */
export function subscriptionPeriodEnd(sub: Stripe.Subscription): number | null {
  const item = sub.items?.data?.[0] as unknown as
    | { current_period_end?: number }
    | undefined
  const fromItem = item?.current_period_end
  const fromSub = (sub as unknown as { current_period_end?: number })
    .current_period_end
  return fromItem ?? fromSub ?? null
}
