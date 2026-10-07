import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import { hasActiveAccess, priceIdForPlan, type BillingMode } from '@/lib/billing'
import { getStripe } from '@/lib/stripe'
import BillingActions from './BillingActions'

export const metadata = { title: 'Suscripción — NXTUP' }

// Estados de Stripe con label traducido (billing.status.*). Uno fuera
// de esta lista se muestra crudo — mejor feo que inventado.
const KNOWN_STATUSES = new Set([
  'none',
  'trialing',
  'active',
  'past_due',
  'unpaid',
  'canceled',
  'incomplete',
  'incomplete_expired',
  'paused',
])

export default async function BillingPage() {
  const { locale, t } = await getServerI18n()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, timezone')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  // Lectura APARTE del trial (074): si la columna aún no existe, falla
  // solo esta query y la página sigue — no arrastra el select del shop.
  const { data: trialRow } = await supabase
    .from('shops')
    .select('trial_ends_at')
    .eq('id', shop.id)
    .maybeSingle()

  // El dueño lee la suscripción de su shop (RLS). Si la tabla aún no existe
  // (migración 061 sin correr), la query falla y cae a "sin suscripción".
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end, cancel_at_period_end, trial_end, billing_mode')
    .eq('shop_id', shop.id)
    .maybeSingle()

  const status = (sub?.status as string | undefined) ?? 'none'
  // contract/comp (073): activo sin Stripe — facturación directa o
  // cortesía de socios. Sin botón de pago en esos modos.
  const mode = ((sub as { billing_mode?: BillingMode } | null)?.billing_mode ?? 'stripe') as BillingMode
  const active = hasActiveAccess(mode, status)
  const hasBilling = mode !== 'stripe' || status !== 'none'
  const periodEndRaw = sub?.current_period_end as string | null | undefined
  const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null

  // Prueba NXTUP (074) — distinta del 'trialing' de Stripe: corre sin
  // tarjeta, por fecha en shops. Solo importa cuando NO hay suscripción.
  const trialEndsRaw = (trialRow as { trial_ends_at?: string | null } | null)
    ?.trial_ends_at
  const trialEndMs = trialEndsRaw ? Date.parse(trialEndsRaw) : NaN
  const trialActive = !hasBilling && !Number.isNaN(trialEndMs) && trialEndMs > Date.now()
  const trialEndLabel = Number.isNaN(trialEndMs)
    ? null
    : new Date(trialEndMs).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        timeZone: shop.timezone ?? 'America/New_York',
      })

  // Precio del Queue leído de Stripe (del price live configurado por
  // env): si mañana cambian el precio en Stripe, la card se actualiza
  // sola — nunca queda un número viejo pintado en el código. Si Stripe
  // no responde, la card sale sin el número y el checkout lo muestra.
  let priceLabel: string | null = null
  if (!hasBilling) {
    try {
      const priceId = priceIdForPlan('pro')
      if (priceId) {
        const price = await getStripe().prices.retrieve(priceId)
        if (typeof price.unit_amount === 'number') {
          const amount = price.unit_amount / 100
          priceLabel = `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
        }
      }
    } catch (err) {
      console.error('[billing] no se pudo leer el precio de Stripe', err)
    }
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-2xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">{t('billing.title')}</h1>
      <p className="text-nxtup-muted text-sm mb-8">{shop.name}</p>

      <section className="border border-nxtup-line rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
            {t('billing.state')}
          </span>
          <span
            className={`text-sm font-bold ${
              active
                ? 'text-nxtup-active'
                : hasBilling || trialActive
                  ? 'text-nxtup-break'
                  : 'text-nxtup-muted'
            }`}
          >
            {trialActive
              ? t('billing.trialBadge')
              : KNOWN_STATUSES.has(status)
                ? t(`billing.status.${status}`)
                : status}
          </span>
        </div>
        {periodEnd ? (
          <p className="text-nxtup-muted text-sm">
            {t(sub?.cancel_at_period_end ? 'billing.endsOn' : 'billing.renewsOn', {
              date: periodEnd.toLocaleDateString(locale, {
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              }),
            })}
          </p>
        ) : (
          !hasBilling &&
          (trialActive && trialEndLabel ? (
            <p className="text-nxtup-muted text-sm">
              {t('billing.trialUntil', { date: trialEndLabel })}
            </p>
          ) : trialEndLabel ? (
            <p className="text-nxtup-muted text-sm">
              {t('billing.trialEnded', { date: trialEndLabel })}
            </p>
          ) : (
            <p className="text-nxtup-dim text-sm">{t('billing.noSub')}</p>
          ))
        )}
      </section>

      {hasBilling ? (
        <BillingActions mode="manage" />
      ) : (
        <section className="grid gap-4 sm:grid-cols-2 items-start">
          {/* NXTUP Queue — el producto que se vende hoy */}
          <div className="border border-nxtup-active/40 rounded-2xl p-6 flex flex-col gap-4">
            <div>
              <p className="text-nxtup-active text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
                NXTUP Queue
              </p>
              {priceLabel && (
                <p className="text-4xl font-black tracking-tight">
                  {priceLabel}
                  <span className="text-base font-bold text-nxtup-muted">
                    {' '}
                    {t('billing.queue.perMonth')}
                  </span>
                </p>
              )}
              <p className="text-nxtup-muted text-sm mt-1">
                {t('billing.queue.tagline')}
              </p>
            </div>
            <ul className="text-sm text-nxtup-muted space-y-1.5">
              {(['f1', 'f2', 'f3', 'f4'] as const).map(k => (
                <li key={k} className="flex items-center gap-2">
                  <Check size={14} className="text-nxtup-active shrink-0" aria-hidden />
                  {t(`billing.queue.${k}`)}
                </li>
              ))}
            </ul>
            <BillingActions mode="subscribe" />
            <p className="text-nxtup-dim text-xs">{t('billing.queue.note')}</p>
          </div>

          {/* Julie — teaser del addon de voz. Cuando lance, esta card se
              enciende con su precio y su botón. */}
          <div className="border border-nxtup-line rounded-2xl p-6 opacity-60 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
                {t('billing.julie.label')}
              </p>
              <span className="text-[10px] uppercase tracking-wider font-bold border border-nxtup-line rounded-full px-2.5 py-1 text-nxtup-muted whitespace-nowrap">
                {t('billing.julie.badge')}
              </span>
            </div>
            <p className="text-sm text-nxtup-muted">{t('billing.julie.desc')}</p>
          </div>
        </section>
      )}
    </main>
  )
}
