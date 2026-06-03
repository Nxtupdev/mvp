'use client'

/**
 * ReturningCustomerScreen — Screen 3 variant for recognized phones.
 *
 * The lookup endpoint found a client in the `clients` table matching
 * (shop_id, phone), so we already have everything we need: name,
 * total_visits, preferred_language. This screen is a confirmation —
 * just shows the customer we know them and lets them tap Continue
 * to drop into the queue.
 *
 * Layout (no scroll, fits portrait tablet):
 *   ┌────────────────────────────────────────┐
 *   │ ← Volver           Paso 2 de 3         │
 *   │                    ●●○                 │
 *   │                                        │
 *   │      ¡Bienvenido de vuelta, Juan!      │
 *   │      Visita #6 con nosotros            │
 *   │                                        │
 *   │      [        Continuar         ]      │
 *   └────────────────────────────────────────┘
 *
 * No form, no service grid, no source picker — Frank's decision after
 * removing those captures from the new-customer screen. Source is
 * first-visit-only anyway, and service is negotiated in person.
 *
 * Submitting calls the same /api/kiosk/checkin endpoint as the new
 * customer flow; the backend distinguishes new vs returning by
 * looking up the phone server-side (the kiosk doesn't need to pass
 * a hint).
 */

import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'

import { useLocale } from '@/lib/i18n'
import { ProgressDots } from './ProgressDots'

type ReturningCustomerScreenProps = {
  /** Display name from the clients table lookup. */
  name: string
  /** Total visits BEFORE this one. The screen renders #{n+1} since
   *  this check-in is about to be visit n+1. We compute on the
   *  frontend to keep the API response simple. */
  previousVisits: number
  onContinue: () => void
  onBack: () => void
  /** True while the parent's /api/kiosk/checkin call is in flight. */
  submitting?: boolean
  /** Optional error message rendered below the CTA. */
  error?: string | null
  currentStep?: number
  totalSteps?: number
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

export function ReturningCustomerScreen({
  name,
  previousVisits,
  onContinue,
  onBack,
  submitting = false,
  error = null,
  currentStep = 2,
  totalSteps = 3,
}: ReturningCustomerScreenProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()

  // Visit number we're ABOUT to record. previousVisits=0 means this
  // is the customer's first visit even though the lookup found them
  // (edge case: row created mid-flow but track_client_visit hasn't
  // bumped the counter yet). Just say "first visit" in that case.
  const upcomingVisit = previousVisits + 1
  const visitLine =
    upcomingVisit <= 1
      ? t('kiosk.returning.visit.first')
      : interpolate(t('kiosk.returning.visit.many'), { n: upcomingVisit })

  const welcomeText = interpolate(t('kiosk.returning.welcome'), { name })

  const fadeUp = (delay: number) => ({
    initial: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.5,
      ease: [0.16, 1, 0.3, 1] as const,
      delay,
    },
  })

  return (
    <div className="flex flex-1 flex-col">
      {/* ─── Top row: back + step indicator ─── */}
      <div className="flex items-center justify-between px-6 pt-6 sm:px-12 sm:pt-8">
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="
            -ml-2 flex items-center gap-1 rounded-full
            px-3 py-2 text-sm font-medium text-zinc-400
            transition-colors hover:text-zinc-100
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-400 focus-visible:ring-offset-2
            focus-visible:ring-offset-[#0A0A0B]
            disabled:opacity-40
          "
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t('kiosk.back')}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-zinc-500 sm:text-sm">
            {interpolate(t('kiosk.step'), { n: currentStep, total: totalSteps })}
          </span>
          <ProgressDots current={currentStep} total={totalSteps} />
        </div>
      </div>

      {/* ─── Center: welcome + visit count ───
          El mensaje de bienvenida queda centrado verticalmente en
          el área disponible. Si por algún motivo el viewport es muy
          chico, overflow-y-auto permite scroll interno (raro pero
          posible). El botón Confirmar NO vive aquí — está en su
          propia sección fija al fondo. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-6 overflow-y-auto px-6 py-8 sm:gap-8 sm:px-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <motion.h1
            {...fadeUp(0.1)}
            className="
              bg-gradient-to-br from-zinc-50 to-emerald-400/80
              bg-clip-text text-4xl font-light tracking-tight text-transparent
              sm:text-6xl
            "
            style={{ letterSpacing: '-0.03em' }}
          >
            {welcomeText}
          </motion.h1>
          <motion.p
            {...fadeUp(0.2)}
            className="text-base text-zinc-400 sm:text-lg"
          >
            {visitLine}
          </motion.p>
        </div>
      </div>

      {/* ─── Sticky bottom CTA ───
          Botón Confirmar fijo al fondo del viewport — siempre visible,
          nunca se corta, sin importar el tamaño del tablet. Mismo
          patrón que NewCustomerScreen para que el usuario siempre
          encuentre el botón en el mismo lugar visual. */}
      <motion.div
        {...fadeUp(0.3)}
        className="flex-shrink-0 border-t border-white/[0.04] bg-[#0A0A0B] px-6 py-4 sm:px-12 sm:py-5"
      >
        <div className="mx-auto w-full max-w-md">
          <button
            type="button"
            onClick={onContinue}
            disabled={submitting}
            className="
              flex h-16 w-full items-center justify-center
              overflow-hidden rounded-2xl text-lg font-medium
              transition-all duration-300
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-emerald-400 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#0A0A0B]
              enabled:bg-emerald-400 enabled:text-zinc-950
              enabled:shadow-[0_0_40px_rgba(52,211,153,0.35)]
              enabled:hover:bg-emerald-300
              enabled:active:scale-[0.99]
              disabled:cursor-not-allowed disabled:bg-white/[0.04]
              disabled:text-zinc-600 disabled:ring-1 disabled:ring-white/[0.06]
            "
          >
            {t('kiosk.returning.continue')}
          </button>

          {error && (
            <p className="mt-3 text-center text-sm text-rose-400">
              {error}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}
