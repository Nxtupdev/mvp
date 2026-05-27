'use client'

/**
 * ScreenContainer — wraps a single kiosk screen with aurora bg + the
 * shared screen-transition variants.
 *
 * Background:
 *   - "hero": full aurora (3 radial gradients + noise). Used on splash
 *     and success screens — the moments where we want depth and a
 *     little visual magic.
 *   - "flat": just bg-base. Used on phone-entry and form screens where
 *     we want focus on inputs, not background.
 *
 * Animation:
 *   The container itself uses motion.div with the standard screen
 *   variants (opacity + y-translate + blur in/out). It's designed to be
 *   used inside an <AnimatePresence mode="wait"> in the parent state
 *   machine, with a `key` prop that changes per screen.
 *
 * Reduced motion: falls back to a 200ms opacity-only fade.
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import type { ReactNode } from 'react'

type ScreenContainerProps = {
  background?: 'hero' | 'flat'
  children: ReactNode
  className?: string
}

const fullVariants: Variants = {
  initial: { opacity: 0, y: 24, filter: 'blur(8px)' },
  animate: {
    opacity: 1,
    y: 0,
    filter: 'blur(0px)',
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -24,
    filter: 'blur(8px)',
    transition: { duration: 0.3, ease: [0.7, 0, 0.84, 0] },
  },
}

const reducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
}

export function ScreenContainer({
  background = 'flat',
  children,
  className,
}: ScreenContainerProps) {
  const shouldReduceMotion = useReducedMotion()
  const variants = shouldReduceMotion ? reducedVariants : fullVariants

  return (
    <motion.div
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variants}
      className={`relative flex flex-1 flex-col overflow-hidden ${className ?? ''}`}
    >
      {/* Hero background — only rendered for splash + success */}
      {background === 'hero' && <AuroraBackground />}

      {/* Content sits above the aurora layer */}
      <div className="relative z-10 flex flex-1 flex-col">{children}</div>
    </motion.div>
  )
}

/**
 * Aurora — three radial gradients tinted with NXTUP emerald + teal +
 * indigo, plus a faint SVG noise texture to break gradient banding.
 *
 * Kept inline so the splash + success screens can opt in without
 * leaking the heavy backdrop layer into the form screens.
 */
function AuroraBackground() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0"
        style={{
          background: `
            radial-gradient(ellipse at 30% 20%, rgba(52, 211, 153, 0.15), transparent 50%),
            radial-gradient(ellipse at 70% 80%, rgba(20, 184, 166, 0.12), transparent 50%),
            radial-gradient(ellipse at 50% 50%, rgba(99, 102, 241, 0.08), transparent 60%)
          `,
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.015] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E")`,
        }}
      />
    </>
  )
}
