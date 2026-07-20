import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isSubscriptionActive } from '@/lib/billing'
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
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  // El dueño lee la suscripción de su shop (RLS). Si la tabla aún no existe
  // (migración 061 sin correr), la query falla y cae a "sin suscripción".
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('status, plan, current_period_end, cancel_at_period_end, trial_end')
    .eq('shop_id', shop.id)
    .maybeSingle()

  const status = (sub?.status as string | undefined) ?? 'none'
  const active = isSubscriptionActive(status)
  const hasBilling = status !== 'none'
  const periodEndRaw = sub?.current_period_end as string | null | undefined
  const periodEnd = periodEndRaw ? new Date(periodEndRaw) : null

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
                : hasBilling
                  ? 'text-nxtup-break'
                  : 'text-nxtup-muted'
            }`}
          >
            {STATUS_LABEL[status] ?? status}
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
          !hasBilling && (
            <p className="text-nxtup-dim text-sm">
              Aún no tienes una suscripción activa.
            </p>
          )
        )}
      </section>

      <BillingActions mode={hasBilling ? 'manage' : 'subscribe'} />
    </main>
  )
}
