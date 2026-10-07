import { createAdminClient } from '@/lib/supabase/admin'
import { hasActiveAccess, type BillingMode } from './billing'

/**
 * Puerta de cobro (migración 074). Un shop tiene acceso si:
 *   * billing_mode contract/comp, o suscripción Stripe trialing/active
 *     (hasActiveAccess), o
 *   * past_due — la gracia es la ventana de reintentos de Stripe:
 *     mientras Stripe reintenta el cobro no cortamos; si los agota,
 *     el webhook lo pasa a canceled/unpaid y ahí sí cierra, o
 *   * su periodo de prueba sigue vigente (shops.trial_ends_at futuro).
 *
 * Qué cierra la puerta: SOLO la entrada de clientes nuevos (kiosko
 * 402, Julie lo oye como "cerrado"). TV, dashboard y paneles siguen
 * vivos para drenar el piso — nunca dejamos clientes ya formados
 * colgados por un cobro.
 *
 * Fail-open a propósito: ante cualquier error de lectura (columna aún
 * sin migrar, DB caída, fecha corrupta) la respuesta es PERMITIR. Un
 * bug de billing jamás debe tumbar el servicio de un shop que pagó.
 */
export type ShopAccess = {
  allowed: boolean
  reason: 'subscription' | 'trial' | 'blocked' | 'unknown'
  trialEndsAt: string | null
}

const FAIL_OPEN: ShopAccess = { allowed: true, reason: 'unknown', trialEndsAt: null }

/**
 * Clasificador PURO de la regla de acceso — la única copia de la
 * lógica. getShopAccess la aplica a un shop (puerta de cobro) y
 * /admin/revenue a todos en batch; si la regla cambia, cambia aquí.
 */
export function evaluateAccess(
  sub: { status?: string | null; billing_mode?: BillingMode | null } | null,
  trialEndsAt: string | null | undefined,
  nowMs: number = Date.now(),
): ShopAccess {
  const mode = sub?.billing_mode ?? 'stripe'
  const status = sub?.status ?? null
  if (hasActiveAccess(mode, status) || status === 'past_due') {
    return { allowed: true, reason: 'subscription', trialEndsAt: null }
  }

  if (!trialEndsAt) return FAIL_OPEN

  const endMs = Date.parse(trialEndsAt)
  if (Number.isNaN(endMs)) return FAIL_OPEN

  if (endMs > nowMs) {
    return { allowed: true, reason: 'trial', trialEndsAt }
  }
  return { allowed: false, reason: 'blocked', trialEndsAt }
}

export async function getShopAccess(shopId: string): Promise<ShopAccess> {
  try {
    const supabase = createAdminClient()
    const [shopRes, subRes] = await Promise.all([
      supabase
        .from('shops')
        .select('trial_ends_at')
        .eq('id', shopId)
        .maybeSingle(),
      supabase
        .from('subscriptions')
        .select('status, billing_mode')
        .eq('shop_id', shopId)
        .maybeSingle(),
    ])

    return evaluateAccess(
      subRes.data as { status?: string | null; billing_mode?: BillingMode | null } | null,
      (shopRes.data as { trial_ends_at?: string | null } | null)?.trial_ends_at,
    )
  } catch (err) {
    console.error('[billing-access] fail-open por error', err)
    return FAIL_OPEN
  }
}
