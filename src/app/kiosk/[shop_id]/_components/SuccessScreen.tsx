'use client'

/**
 * SuccessScreen — Screen 4 of the kiosk check-in flow.
 *
 * Celebration moment. The hard work is done; the customer just needs
 * confirmation that they're in line and how long the wait is.
 *
 * Layout (vertical center):
 *   ✓                ← SuccessCheckmark with aurora burst
 *   ¡Bienvenido, Juan!   ← gradient text, personalized
 *   ┌──────┐ ┌──────┐
 *   │  #4  │ │ 6-10 │   ← two glass stat cards (position + eta)
 *   └──────┘ └──────┘
 *   Relájate, te llamamos cuando esté tu barbero.
 *   [        Listo        ]
 *
 * Auto-reset: 30s after the screen mounts, we call onDone() to wipe
 * state and return to splash. This is critical for kiosk mode —
 * customers often walk away without tapping the button, and the next
 * person shouldn't see the previous person's name.
 *
 * Choreography:
 *   t=0.0  checkmark draws (own ~1.4s sequence)
 *   t=0.8  welcome fades up
 *   t=1.0  stat cards stagger in
 *   t=1.4  reassuring text fades in
 *   t=1.6  Listo button appears
 *
 * Reduced motion: collapses to plain fades.
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { useEffect } from 'react'

import { useLocale } from '@/lib/i18n'
import { QueueStatBlock } from './QueueStatBlock'
import { SuccessCheckmark } from './SuccessCheckmark'

const AUTO_RESET_MS = 30_000

// ────────────────────────────────────────────────────────────────────
// Types

type SuccessScreenProps = {
  /** Display name — typically firstName. */
  name: string
  /** True if the lookup found this phone in `clients` already. */
  isReturning: boolean
  /** Customer's position in the waiting queue (1-based). */
  queuePosition: number
  /** Estimated wait window in minutes. */
  etaMinutes: { min: number; max: number }
  /** Called when the user hits "Listo" OR after AUTO_RESET_MS. The
   *  parent should reset all kiosk state and return to splash. */
  onDone: () => void
}

// ────────────────────────────────────────────────────────────────────
// Animation variants

const containerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      delayChildren: 0.8, // wait for the checkmark to settle
      staggerChildren: 0.15,
    },
  },
}

const itemVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
}

const reducedContainerVariants: Variants = {
  initial: {},
  animate: { transition: { delayChildren: 0.3, staggerChildren: 0.05 } },
}

const reducedItemVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
}

// ────────────────────────────────────────────────────────────────────
// Component

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

export function SuccessScreen({
  name,
  isReturning,
  queuePosition,
  etaMinutes,
  onDone,
}: SuccessScreenProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()

  // Auto-reset timer — critical for kiosk privacy / hand-off to the
  // next customer. Cleared on unmount or manual Done so we don't fire
  // a stale reset against the next screen.
  useEffect(() => {
    const id = window.setTimeout(onDone, AUTO_RESET_MS)
    return () => window.clearTimeout(id)
  }, [onDone])

  const welcomeTemplate = isReturning
    ? t('kiosk.success.welcomeBack')
    : t('kiosk.success.welcome')
  const welcomeText = interpolate(welcomeTemplate, { name })

  const containerV = shouldReduceMotion ? reducedContainerVariants : containerVariants
  const itemV = shouldReduceMotion ? reducedItemVariants : itemVariants

  // Render eta as "6-10" or just "6" if min === max.
  const etaValue =
    etaMinutes.min === etaMinutes.max
      ? String(etaMinutes.min)
      : `${etaMinutes.min}-${etaMinutes.max}`

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-12 sm:gap-10 sm:px-12">
      {/* Checkmark animates on its own (self-contained) */}
      <SuccessCheckmark size={96} />

      {/* Stagger container — everything below the checkmark */}
      <motion.div
        initial="initial"
        animate="animate"
        variants={containerV}
        className="flex w-full max-w-2xl flex-col items-center gap-8 sm:gap-10"
      >
        {/* Personalized welcome */}
        <motion.h1
          variants={itemV}
          className="
            bg-gradient-to-br from-zinc-50 to-emerald-400/80
            bg-clip-text text-center text-4xl font-light
            tracking-tight text-transparent
            sm:text-6xl
          "
          style={{ letterSpacing: '-0.03em' }}
        >
          {welcomeText}
        </motion.h1>

        {/* Stat cards — position (primary) + ETA (neutral) */}
        <motion.div
          variants={itemV}
          className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6"
        >
          <QueueStatBlock
            label={t('kiosk.success.position')}
            value={`#${queuePosition}`}
            tone="primary"
          />
          <QueueStatBlock
            label={t('kiosk.success.eta')}
            value={etaValue}
            unit={t('kiosk.success.min')}
          />
        </motion.div>

        {/* Reassuring text */}
        <motion.p
          variants={itemV}
          className="
            max-w-md text-center text-base text-zinc-400
            sm:text-lg
          "
        >
          {t('kiosk.success.relax')}
        </motion.p>

        {/* Listo button */}
        <motion.button
          variants={itemV}
          type="button"
          onClick={onDone}
          whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
          className="
            mt-2 flex h-16 w-full max-w-md items-center justify-center
            overflow-hidden rounded-2xl text-lg font-medium text-zinc-950
            bg-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.35)]
            transition-all duration-300
            hover:bg-emerald-300
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-400 focus-visible:ring-offset-2
            focus-visible:ring-offset-[#0A0A0B]
          "
        >
          {t('kiosk.success.done')}
        </motion.button>
      </motion.div>
    </div>
  )
}
