import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import {
  hasActiveAccess,
  JULIE_LAUNCHED,
  priceIdForAddon,
  priceIdForPlan,
  type BillingMode,
} from '@/lib/billing'
import { getStripe } from '@/lib/stripe'
import BillingActions from './BillingActions'
import JulieActions from './JulieActions'

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
  // Reactivación (18-oct, caso Prueba Barber): una suscripción MUERTA
  // (canceled/unpaid/incomplete/paused) dejaba la página sin camino de
  // vuelta — solo "Gestionar", sin botón de suscribirse. Con billing
  // por Stripe y sin acceso activo, las cards de producto se muestran
  // SIEMPRE (reactivar = un checkout nuevo).
  const canSubscribe = mode === 'stripe' && !active
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

  // Add-on Julie (076): lectura APARTE y fail-open, como el trial — si
  // la columna aún no existe, Julie simplemente aparece apagada. Sin la
  // env STRIPE_PRICE_JULIE la card queda en "Próximamente" (interruptor
  // de lanzamiento del add-on).
  const { data: julieRow } = await supabase
    .from('subscriptions')
    .select('julie_active')
    .eq('shop_id', shop.id)
    .maybeSingle()
  const julieActive = Boolean(
    (julieRow as { julie_active?: boolean } | null)?.julie_active,
  )
  // Doble candado: env presente Y lanzamiento encendido. La env ya está
  // en Vercel, así que hasta el flip de JULIE_LAUNCHED la card sigue en
  // "Próximamente" aunque el price exista.
  const julieConfigured = JULIE_LAUNCHED && Boolean(priceIdForAddon('julie'))

  // Precio del Queue leído de Stripe (del price live configurado por
  // env): si mañana cambian el precio en Stripe, la card se actualiza
  // sola — nunca queda un número viejo pintado en el código. Si Stripe
  // no responde, la card sale sin el número y el checkout lo muestra.
  let priceLabel: string | null = null
  if (canSubscribe) {
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

  // Precio de Julie (misma lógica): solo hace falta en la card de
  // activación — con Julie ya activa o sin env no se consulta.
  let juliePriceLabel: string | null = null
  if (hasBilling && mode === 'stripe' && julieConfigured && !julieActive) {
    try {
      const price = await getStripe().prices.retrieve(priceIdForAddon('julie')!)
      if (typeof price.unit_amount === 'number') {
        const amount = price.unit_amount / 100
        juliePriceLabel = `$${Number.isInteger(amount) ? amount : amount.toFixed(2)}`
      }
    } catch (err) {
      console.error('[billing] no se pudo leer el precio de Julie', err)
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

      {hasBilling && (
        <>
          <BillingActions mode="manage" />

          {/* Add-on Julie (076) — solo con suscripción Stripe ACTIVA:
              comp y contract se acuerdan con los socios, y una
              suscripción muerta primero se reactiva (cards de abajo). */}
          {mode === 'stripe' &&
            active &&
            (julieActive ? (
              <section className="border border-nxtup-active/40 rounded-2xl p-6 mt-6 flex flex-col gap-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-nxtup-active text-[10px] uppercase tracking-[0.3em] font-bold">
                    {t('billing.julie.label')}
                  </p>
                  <span className="text-[10px] uppercase tracking-wider font-bold border border-nxtup-active/40 rounded-full px-2.5 py-1 text-nxtup-active whitespace-nowrap">
                    {t('billing.julie.activeBadge')}
                  </span>
                </div>
                <p className="text-sm text-nxtup-muted">{t('billing.julie.activeNote')}</p>
                {/* Desactivar ya NO vive aquí (pedido de Francisco 20-oct:
                    demasiado fácil tocarlo por error) — está al fondo de
                    /dashboard/julie, pequeño y con confirmación. */}
                <Link
                  href="/dashboard/julie"
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition"
                >
                  {t('julieNum.manageLink')} →
                </Link>
              </section>
            ) : julieConfigured && status === 'active' ? (
              <section className="border border-nxtup-line rounded-2xl p-6 mt-6 flex flex-col gap-4">
                <div>
                  <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
                    {t('billing.julie.label')}
                  </p>
                  {juliePriceLabel && (
                    <p className="text-4xl font-black tracking-tight">
                      {juliePriceLabel}
                      <span className="text-base font-bold text-nxtup-muted">
                        {' '}
                        {t('billing.queue.perMonth')}
                      </span>
                    </p>
                  )}
                  <p className="text-nxtup-muted text-sm mt-1">{t('billing.julie.desc')}</p>
                </div>
                <JulieActions mode="activate" />
                {juliePriceLabel && (
                  <p className="text-nxtup-dim text-xs">
                    {t('billing.julie.prorationNote', { price: juliePriceLabel })}
                  </p>
                )}
              </section>
            ) : !julieConfigured ? (
              <section className="border border-nxtup-line rounded-2xl p-6 mt-6 opacity-60 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
                    {t('billing.julie.label')}
                  </p>
                  <span className="text-[10px] uppercase tracking-wider font-bold border border-nxtup-line rounded-full px-2.5 py-1 text-nxtup-muted whitespace-nowrap">
                    {t('billing.julie.badge')}
                  </span>
                </div>
                <p className="text-sm text-nxtup-muted">{t('billing.julie.desc')}</p>
              </section>
            ) : null)}
        </>
      )}

      {canSubscribe && (
        <section className={`grid gap-4 sm:grid-cols-2 items-start ${hasBilling ? 'mt-6' : ''}`}>
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
