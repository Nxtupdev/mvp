import Stripe from 'stripe'

/**
 * Cliente de Stripe (SERVER-ONLY). Lazy init para que importar este módulo
 * no explote en build si la env no está todavía. Usa STRIPE_SECRET_KEY
 * (test o live según el entorno). NUNCA exponer al browser.
 *
 * Omitimos `apiVersion` a propósito → el SDK usa su versión fijada, y el
 * código lee campos de forma defensiva (ver subscriptionPeriodEnd en
 * lib/billing.ts) para sobrevivir cambios de versión del API.
 */
let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (_stripe) return _stripe
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new Error('Missing STRIPE_SECRET_KEY')
  _stripe = new Stripe(key)
  return _stripe
}
