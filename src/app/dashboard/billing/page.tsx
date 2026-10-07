import { redirect } from 'next/navigation'
import { Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { hasActiveAccess, priceIdForPlan, type BillingMode } from '@/lib/billing'
import { getStripe } from '@/lib/stripe'
import BillingActions from './BillingActions'

export const metadata = { title: 'Suscripción — NXTUP' }

const STATUS_LABEL: Record<string, string> = {
  none: 'Sin suscripción',
  trialing: 'En prueba',
  active: 'Activa',
  past_due: 'Pago pendiente',
  unpaid: 'Sin pagar',
  canceled: 'Cancelada',
  incomplete: 'Incompleta',
  incomplete_expired: 'Expirada',
  paused: 'Pausada',
}

export default async function BillingPage() {
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
    : new Date(trialEndMs).toLocaleDateString('es', {
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
      <h1 className="text-3xl font-black tracking-tight mb-2">Suscripción</h1>
      <p className="text-nxtup-muted text-sm mb-8">{shop.name}</p>

      <section className="border border-nxtup-line rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
            Estado
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
            {trialActive ? 'En prueba' : STATUS_LABEL[status] ?? status}
          </span>
        </div>
        {periodEnd ? (
          <p className="text-nxtup-muted text-sm">
            {sub?.cancel_at_period_end ? 'Termina el ' : 'Se renueva el '}
            {periodEnd.toLocaleDateString('es', {
              day: '2-digit',
              month: 'long',
              year: 'numeric',
            })}
          </p>
        ) : (
          !hasBilling &&
          (trialActive ? (
            <p className="text-nxtup-muted text-sm">
              Tu periodo de prueba termina el {trialEndLabel}. Suscríbete antes
              para que el check-in no se interrumpa.
            </p>
          ) : trialEndLabel ? (
            <p className="text-nxtup-muted text-sm">
              Tu periodo de prueba terminó el {trialEndLabel}. El check-in está
              pausado hasta que te suscribas.
            </p>
          ) : (
            <p className="text-nxtup-dim text-sm">
              Aún no tienes una suscripción activa.
            </p>
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
                    /mes
                  </span>
                </p>
              )}
              <p className="text-nxtup-muted text-sm mt-1">
                El sistema de turnos completo de tu barbería.
              </p>
            </div>
            <ul className="text-sm text-nxtup-muted space-y-1.5">
              {[
                'Kiosko de check-in',
                'TV en vivo',
                'Cola y paneles de barberos',
                'Stats e historial',
              ].map(f => (
                <li key={f} className="flex items-center gap-2">
                  <Check size={14} className="text-nxtup-active shrink-0" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
            <BillingActions mode="subscribe" label="Activar NXTUP Queue" />
            <p className="text-nxtup-dim text-xs">
              Cancela cuando quieras · paga con banco o tarjeta
            </p>
          </div>

          {/* Julie — teaser del addon de voz. Cuando lance, esta card se
              enciende con su precio y su botón. */}
          <div className="border border-nxtup-line rounded-2xl p-6 opacity-60 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
                Julie · Addon
              </p>
              <span className="text-[10px] uppercase tracking-wider font-bold border border-nxtup-line rounded-full px-2.5 py-1 text-nxtup-muted whitespace-nowrap">
                Próximamente
              </span>
            </div>
            <p className="text-sm text-nxtup-muted">
              Recepcionista con IA: contesta el teléfono de tu barbería y
              anota a los clientes en tu cola.
            </p>
          </div>
        </section>
      )}
    </main>
  )
}
