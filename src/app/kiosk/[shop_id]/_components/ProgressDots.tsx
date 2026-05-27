'use client'

/**
 * ProgressDots — animated step indicator for the check-in flow.
 *
 * Renders a row of dots; dots up to and including `current` are
 * "active" (filled with NXTUP emerald), the rest are dim.
 *
 * Transition uses Framer Motion so newly-active dots animate the
 * background color + a subtle 1.15× scale bump (feels like a small
 * victory each step). Reduced-motion users get an instant color
 * swap.
 *
 * Indices are 1-based to match human-readable "Step X of N".
 *
 * @example
 *   <ProgressDots current={2} total={4} />   // ●●○○
 */

import { motion, useReducedMotion } from 'framer-motion'

type ProgressDotsProps = {
  /** 1-based index of the current step. */
  current: number
  total: number
  className?: string
}

const ACTIVE_COLOR = '#34D399' // matches --accent-emerald
const INACTIVE_COLOR = 'rgba(255, 255, 255, 0.1)'

export function ProgressDots({ current, total, className }: ProgressDotsProps) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <div
      role="progressbar"
      aria-valuenow={current}
      aria-valuemin={1}
      aria-valuemax={total}
      aria-label={`Step ${current} of ${total}`}
      className={`flex items-center gap-2 ${className ?? ''}`}
    >
      {Array.from({ length: total }).map((_, idx) => {
        const isActive = idx < current
        return (
          <motion.span
            key={idx}
            aria-hidden
            initial={false}
            animate={{
              backgroundColor: isActive ? ACTIVE_COLOR : INACTIVE_COLOR,
              scale: shouldReduceMotion ? 1 : isActive ? 1.15 : 1,
            }}
            transition={{
              duration: shouldReduceMotion ? 0 : 0.4,
              ease: [0.16, 1, 0.3, 1],
            }}
            className="block h-2 w-2 rounded-full"
          />
        )
      })}
    </div>
  )
}
