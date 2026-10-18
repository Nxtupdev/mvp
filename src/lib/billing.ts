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

// ── Add-ons (076) ────────────────────────────────────────────────────
// APARTE de PLANS a propósito: un add-on es un item extra dentro de la
// suscripción existente, nunca una suscripción propia — si viviera en
// PLANS, /api/billing/checkout dejaría crear una suscripción de SOLO
// Julie sin el Queue, que es justo lo que el modelo prohíbe.
// Sin la env configurada el add-on no existe para la app (la card de
// billing muestra "Próximamente" y la ruta de activación rechaza).
export type AddonKey = 'julie'

export const ADDONS: Record<AddonKey, { label: string; priceEnv: string }> = {
  julie: { label: 'Julie', priceEnv: 'STRIPE_PRICE_JULIE' },
}

/** Price id de Stripe para un add-on, desde env. null = add-on apagado. */
export function priceIdForAddon(addon: AddonKey): string | null {
  const env = ADDONS[addon]?.priceEnv
  return env ? process.env[env] ?? null : null
}

/** Estados de Stripe que cuentan como "acceso activo". */
const ACTIVE_STATUSES = new Set(['trialing', 'active'])

export function isSubscriptionActive(status: string | null | undefined): boolean {
  return !!status && ACTIVE_STATUSES.has(status)
}

// ── billing_mode (migración 073, port del dealer) ───────────────────
// Quién manda sobre el acceso del shop:
//   'stripe'   → el webhook (lo normal: paga por checkout).
//   'contract' → facturado por fuera (acuerdo directo); activo sin Stripe.
//   'comp'     → cortesía de los socios; activo sin Stripe.
export type BillingMode = 'stripe' | 'contract' | 'comp'

export function hasActiveAccess(
  mode: BillingMode | null | undefined,
  status: string | null | undefined,
): boolean {
  if (mode === 'contract' || mode === 'comp') return true
  return isSubscriptionActive(status)
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
