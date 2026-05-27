'use client'

/**
 * PhoneScreen — Screen 2 of the kiosk check-in flow.
 *
 * Layout:
 *   ┌────────────────────────────────────────┐
 *   │ ← Volver           Paso 1 de 3         │
 *   │                    ●●○ (progress dots) │
 *   │                                        │
 *   │      Tu número de teléfono             │
 *   │      Te buscaremos en nuestro sistema  │
 *   │                                        │
 *   │      [ +1 │ (___) ___-____ ]           │
 *   │                                        │
 *   │      ┌──┐ ┌──┐ ┌──┐                    │
 *   │      │ 1│ │ 2│ │ 3│                    │
 *   │      └──┘ └──┘ └──┘ ... (kiosk only)   │
 *   │                                        │
 *   │      [ Continuar ]                     │
 *   └────────────────────────────────────────┘
 *
 * The on-screen numeric keypad is rendered only on tablet width
 * (≥ sm). On phones we hide it and rely on the native numeric
 * keyboard via the <input type="tel" inputMode="numeric"> in
 * PhoneInput.
 *
 * Submit is gated on 10 valid digits. Pressing Enter on the input
 * also submits — useful when this screen is reached via a customer's
 * phone QR code.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'

import { useLocale } from '@/lib/i18n'
import { NumericKeypad } from './NumericKeypad'
import { PhoneInput } from './PhoneInput'
import { ProgressDots } from './ProgressDots'

const MAX_DIGITS = 10

type PhoneScreenProps = {
  /** Current digits entered (parent owns this state so it survives
   *  back-navigation from later screens). */
  value: string
  onChange: (digits: string) => void
  /** Fired when the user submits a valid 10-digit phone. The parent
   *  is responsible for the client lookup + routing to either
   *  newCustomer or returningCustomer. */
  onSubmit: () => void
  onBack: () => void
  /** Step indicator — flexible so we can later switch totals
   *  (e.g., returning customers might be a different N). */
  currentStep?: number
  totalSteps?: number
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

export function PhoneScreen({
  value,
  onChange,
  onSubmit,
  onBack,
  currentStep = 1,
  totalSteps = 3,
}: PhoneScreenProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()
  // Tracks whether the user has tried to submit with invalid input —
  // we only show the helper "10 digits required" message after a
  // failed attempt, so it doesn't nag on first keystroke.
  const [showError, setShowError] = useState(false)

  const isValid = value.length === MAX_DIGITS

  function handleDigit(digit: string) {
    if (value.length >= MAX_DIGITS) return
    onChange(value + digit)
    if (showError) setShowError(false)
  }

  function handleBackspace() {
    if (value.length === 0) return
    onChange(value.slice(0, -1))
    if (showError) setShowError(false)
  }

  function handleSubmit() {
    if (!isValid) {
      setShowError(true)
      return
    }
    onSubmit()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div
      className="flex flex-1 flex-col px-6 pb-8 pt-6 sm:px-12 sm:pb-12 sm:pt-8"
      onKeyDown={handleKeyDown}
    >
      {/* ─── Top row: back button + step indicator ─── */}
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onBack}
          className="
            -ml-2 flex items-center gap-1 rounded-full
            px-3 py-2 text-sm font-medium text-zinc-400
            transition-colors hover:text-zinc-100
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-400 focus-visible:ring-offset-2
            focus-visible:ring-offset-[#0A0A0B]
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

      {/* ─── Center: title + hint + input + keypad ─── */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 py-8 sm:gap-10">
        {/* Title block */}
        <div className="flex flex-col items-center gap-3 text-center">
          <motion.h1
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
            className="
              bg-gradient-to-br from-zinc-50 to-emerald-400/80
              bg-clip-text text-4xl font-light tracking-tight text-transparent
              sm:text-6xl
            "
            style={{ letterSpacing: '-0.03em' }}
          >
            {t('kiosk.phone.title')}
          </motion.h1>
          <motion.p
            initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            className="text-base text-zinc-400 sm:text-lg"
          >
            {t('kiosk.phone.hint')}
          </motion.p>
        </div>

        {/* Phone input */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
          className="w-full"
        >
          <PhoneInput
            value={value}
            onChange={(digits) => {
              onChange(digits)
              if (showError) setShowError(false)
            }}
            helper={
              showError
                ? t('kiosk.phone.invalid')
                : undefined
            }
            helperTone={showError ? 'error' : 'neutral'}
          />
        </motion.div>

        {/* Numeric keypad — kiosk mode only (≥ sm). */}
        <motion.div
          initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
          className="hidden w-full max-w-xs sm:block"
        >
          <NumericKeypad onDigit={handleDigit} onBackspace={handleBackspace} />
        </motion.div>
      </div>

      {/* ─── Bottom: Continue CTA ─── */}
      <motion.div
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.5 }}
        className="mx-auto w-full max-w-md"
      >
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isValid}
          className="
            group relative flex h-16 w-full items-center justify-center
            overflow-hidden rounded-2xl text-lg font-medium
            transition-all duration-300
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-400 focus-visible:ring-offset-2
            focus-visible:ring-offset-[#0A0A0B]
            enabled:bg-emerald-400 enabled:text-zinc-950
            enabled:shadow-[0_0_40px_rgba(52,211,153,0.35)]
            enabled:hover:bg-emerald-300
            enabled:active:scale-[0.98]
            disabled:cursor-not-allowed disabled:bg-white/[0.04]
            disabled:text-zinc-600 disabled:ring-1 disabled:ring-white/[0.06]
          "
        >
          {t('kiosk.phone.continue')}
        </button>
      </motion.div>
    </div>
  )
}
