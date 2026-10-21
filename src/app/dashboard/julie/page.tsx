import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import NumberSetup from './NumberSetup'
import ForwardVerify from './ForwardVerify'
import JulieActions from '../billing/JulieActions'
import { syncPortStatus } from '@/lib/julie-port'

export const metadata = { title: 'Julie — NXTUP' }

/**
 * /dashboard/julie — estado del add-on y onboarding del número que
 * contesta Julie (077). NXTUP captura la decisión y muestra el
 * progreso; la provisión real (Twilio-Softmedia + VAPI) es de Mamacita.
 */
export default async function JuliePage() {
  const { locale, t } = await getServerI18n()
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

  // Desvío (079) en select APARTE y fail-open: pre-migración falla solo
  // esto y la página sigue tratando el número como compra normal.
  const { data: fwdRow } = await supabase
    .from('julie_numbers')
    .select('choice, forward_verified, instructions')
    .eq('shop_id', shop.id)
    .maybeSingle()
  type FwdInstructions = {
    forward_to?: string
    recommended?: string
    es?: { title?: string; steps?: string[]; note?: string }
    en?: { title?: string; steps?: string[]; note?: string }
  }
  const fwd = fwdRow as {
    choice?: string
    forward_verified?: boolean
    instructions?: FwdInstructions | null
  } | null
  const forwardPending =
    numStatus === 'completed' &&
    fwd?.choice === 'forward' &&
    fwd.forward_verified !== true
  const instr =
    (locale === 'en' ? fwd?.instructions?.en : fwd?.instructions?.es) ??
    fwd?.instructions?.es ??
    null

  // Porte (080): enlace seguro + fecha de corte, en select APARTE y
  // fail-open (pre-migración la página sigue). El estado del porte lo
  // AVANZA ops del lado Mamacita, así que al cargar se consulta su
  // port-status y se refresca el espejo (best-effort).
  const { data: portRow } = await supabase
    .from('julie_numbers')
    .select('intake_url, foc_date')
    .eq('shop_id', shop.id)
    .maybeSingle()
  let intakeUrl = (portRow as { intake_url?: string | null } | null)?.intake_url ?? null
  let focDate = (portRow as { foc_date?: string | null } | null)?.foc_date ?? null

  let displayStatus = numStatus
  let displayNumber = (numRow?.number as string | null | undefined) ?? null
  let failReason = (numRow?.fail_reason as string | null | undefined) ?? null
  if (
    fwd?.choice === 'port' &&
    ['info_required', 'submitted', 'porting_in_progress'].includes(numStatus)
  ) {
    const fresh = await syncPortStatus(shop.id)
    if (fresh) {
      displayStatus = fresh.status
      focDate = fresh.focDate ?? focDate
      if (fresh.rejectReason) failReason = fresh.rejectReason
      if (fresh.number) displayNumber = fresh.number
      if (fresh.status === 'completed' || fresh.status === 'failed') intakeUrl = null
    }
  }
  const focDateLabel = focDate
    ? new Date(`${focDate}T12:00:00`).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
      })
    : null

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
      ) : forwardPending && numRow?.number ? (
        <section className="border border-nxtup-break/40 rounded-2xl p-6 flex flex-col gap-4">
          <div>
            <p className="text-nxtup-break text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
              {t('julieNum.fwd.pendingTitle')}
            </p>
            <p className="text-4xl font-black tracking-tight mb-2">{numRow.number}</p>
            <p className="text-sm text-nxtup-muted">{instr?.title ?? t('julieNum.fwd.verifyIntro')}</p>
          </div>
          {instr?.steps && instr.steps.length > 0 && (
            <ol className="text-sm text-nxtup-muted space-y-2 list-decimal list-inside">
              {instr.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          {instr?.note && <p className="text-xs text-nxtup-dim">{instr.note}</p>}
          <p className="text-sm text-nxtup-muted">{t('julieNum.fwd.verifyIntro')}</p>
          <ForwardVerify />
        </section>
      ) : displayStatus === 'completed' && displayNumber ? (
        <section className="border border-nxtup-active/40 rounded-2xl p-6">
          <p className="text-nxtup-active text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
            {t('julieNum.doneTitle')}
          </p>
          <p className="text-4xl font-black tracking-tight mb-2">{displayNumber}</p>
          <p className="text-sm text-nxtup-muted">
            {fwd?.choice === 'forward' ? t('julieNum.fwd.doneDesc') : t('julieNum.doneDesc')}
          </p>
        </section>
      ) : fwd?.choice === 'port' &&
        (displayStatus === 'info_required' ||
          displayStatus === 'submitted' ||
          displayStatus === 'porting_in_progress') ? (
        <section className="border border-nxtup-break/40 rounded-2xl p-6 flex flex-col gap-4">
          <p className="text-nxtup-break text-[10px] uppercase tracking-[0.3em] font-bold">
            {t('julieNum.portFlow.title')}
          </p>
          {displayStatus === 'info_required' && intakeUrl ? (
            <>
              <p className="text-sm text-nxtup-muted">{t('julieNum.portFlow.intakeIntro')}</p>
              <a
                href={intakeUrl}
                target="_blank"
                rel="noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition"
              >
                {t('julieNum.portFlow.intakeCta')} →
              </a>
              <p className="text-xs text-nxtup-dim">{t('julieNum.portFlow.intakeNote')}</p>
            </>
          ) : displayStatus === 'porting_in_progress' && focDateLabel ? (
            <p className="text-sm text-nxtup-muted">
              {t('julieNum.portFlow.scheduled', { date: focDateLabel })}
            </p>
          ) : (
            <p className="text-sm text-nxtup-muted">{t('julieNum.portFlow.submitted')}</p>
          )}
          <p className="text-xs text-nxtup-dim">{t('julieNum.portFlow.lineNote')}</p>
        </section>
      ) : displayStatus === 'submitted' ||
        displayStatus === 'porting_in_progress' ||
        displayStatus === 'info_required' ? (
        <section className="border border-nxtup-break/40 rounded-2xl p-6">
          <p className="text-nxtup-break text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
            {t('julieNum.progressTitle')}
          </p>
          <p className="text-sm text-nxtup-muted">
            {t(`julieNum.progress.${displayStatus}`)}
          </p>
        </section>
      ) : (
        <NumberSetup failReason={failReason} />
      )}

      {/* Desactivar vive AQUÍ abajo (pedido de Francisco 20-oct), lejos
          del flujo normal: en la card de billing era muy fácil tocarlo
          por error. Pequeño, apagado y con confirmación. */}
      {julieActive && (
        <div className="mt-12 pt-6 border-t border-nxtup-line flex justify-end">
          <JulieActions mode="deactivate" />
        </div>
      )}
    </main>
  )
}
