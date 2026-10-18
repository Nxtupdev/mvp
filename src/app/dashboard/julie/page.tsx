import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import NumberSetup from './NumberSetup'

export const metadata = { title: 'Julie — NXTUP' }

/**
 * /dashboard/julie — estado del add-on y onboarding del número que
 * contesta Julie (077). NXTUP captura la decisión y muestra el
 * progreso; la provisión real (Twilio-Softmedia + VAPI) es de Mamacita.
 */
export default async function JuliePage() {
  const { t } = await getServerI18n()
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

  // Lecturas fail-open por separado (patrón de billing): columna o tabla
  // sin migrar = Julie simplemente aparece inactiva / sin número.
  const { data: subRow } = await supabase
    .from('subscriptions')
    .select('julie_active')
    .eq('shop_id', shop.id)
    .maybeSingle()
  const julieActive = Boolean((subRow as { julie_active?: boolean } | null)?.julie_active)

  const { data: numRow } = await supabase
    .from('julie_numbers')
    .select('status, number, fail_reason')
    .eq('shop_id', shop.id)
    .maybeSingle()
  const numStatus = (numRow?.status as string | undefined) ?? 'not_started'

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-2xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">Julie</h1>
      <p className="text-nxtup-muted text-sm mb-8">{shop.name}</p>

      {!julieActive ? (
        <section className="border border-nxtup-line rounded-2xl p-6">
          <p className="text-sm text-nxtup-muted mb-4">{t('julieNum.notActive')}</p>
          <Link
            href="/dashboard/billing"
            className="inline-flex items-center gap-2 rounded-lg border border-nxtup-line px-5 py-2.5 text-sm font-bold hover:border-white transition-colors"
          >
            {t('julieNum.goBilling')} →
          </Link>
        </section>
      ) : numStatus === 'completed' && numRow?.number ? (
        <section className="border border-nxtup-active/40 rounded-2xl p-6">
          <p className="text-nxtup-active text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
            {t('julieNum.doneTitle')}
          </p>
          <p className="text-4xl font-black tracking-tight mb-2">{numRow.number}</p>
          <p className="text-sm text-nxtup-muted">{t('julieNum.doneDesc')}</p>
        </section>
      ) : numStatus === 'submitted' ||
        numStatus === 'porting_in_progress' ||
        numStatus === 'info_required' ? (
        <section className="border border-nxtup-break/40 rounded-2xl p-6">
          <p className="text-nxtup-break text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
            {t('julieNum.progressTitle')}
          </p>
          <p className="text-sm text-nxtup-muted">
            {t(`julieNum.progress.${numStatus}`)}
          </p>
        </section>
      ) : (
        <NumberSetup failReason={numRow?.fail_reason ?? null} />
      )}
    </main>
  )
}
