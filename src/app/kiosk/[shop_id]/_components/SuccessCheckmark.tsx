'use client'

/**
 * SuccessCheckmark — animated SVG checkmark with an aurora burst.
 *
 * Choreography (total ~1.4s):
 *   t=0.0  burst starts: emerald radial pulse expanding from center,
 *          fading 0 → 0.6 → 0 while scaling 0.5× → 3×
 *   t=0.2  ring stroke draws (0.5s)
 *   t=0.6  check path draws (0.5s) — slight overlap with ring for a
 *          continuous gesture
 *
 * The checkmark itself uses `pathLength` (Framer Motion's
 * SVG-friendly equivalent of `stroke-dashoffset`) so the path "draws"
 * from invisible to whole. GPU-cheap; works at any size.
 *
 * Reduced motion: skips the burst and snaps the marks in via opacity.
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'

type SuccessCheckmarkProps = {
  /** Pixel size. 96px default — matches Screen 4 hero specs. */
  size?: number
  className?: string
}

const burstVariants: Variants = {
  initial: { opacity: 0, scale: 0.5 },
  animate: {
    opacity: [0, 0.6, 0],
    scale: [0.5, 2, 3],
    transition: { duration: 1.2, ease: 'easeOut' },
  },
}

const ringVariants: Variants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 0.5, ease: [0.65, 0, 0.35, 1], delay: 0.2 },
      opacity: { duration: 0.2, delay: 0.2 },
    },
  },
}

const checkVariants: Variants = {
  initial: { pathLength: 0, opacity: 0 },
  animate: {
    pathLength: 1,
    opacity: 1,
    transition: {
      pathLength: { duration: 0.5, ease: [0.65, 0, 0.35, 1], delay: 0.6 },
      opacity: { duration: 0.2, delay: 0.6 },
    },
  },
}

const reducedRingVariants: Variants = {
  initial: { pathLength: 1, opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
}

const reducedCheckVariants: Variants = {
  initial: { pathLength: 1, opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, delay: 0.1 } },
}

export function SuccessCheckmark({
  size = 96,
  className,
}: SuccessCheckmarkProps) {
  const shouldReduceMotion = useReducedMotion()

  const ringV = shouldReduceMotion ? reducedRingVariants : ringVariants
  const checkV = shouldReduceMotion ? reducedCheckVariants : checkVariants

  return (
    <div
      aria-hidden
      className={`relative flex items-center justify-center ${className ?? ''}`}
      style={{ width: size, height: size }}
    >
      {/* Aurora burst — only on full-motion */}
      {!shouldReduceMotion && (
        <motion.div
          initial="initial"
          animate="animate"
          variants={burstVariants}
          className="absolute inset-0 rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(52, 211, 153, 0.55) 0%, rgba(52, 211, 153, 0.0) 70%)',
          }}
        />
      )}

      {/* Checkmark SVG */}
      <motion.svg
        viewBox="0 0 64 64"
        className="relative h-full w-full"
        initial={false}
      >
        {/* Faint emerald disc behind the marks for legibility on light
            backgrounds — barely visible on the dark kiosk theme but
            keeps the checkmark grounded. */}
        <circle
          cx="32"
          cy="32"
          r="28"
          fill="rgba(52, 211, 153, 0.08)"
        />

        {/* Ring */}
        <motion.circle
          cx="32"
          cy="32"
          r="28"
          fill="none"
          stroke="#34D399"
          strokeWidth="3.5"
          strokeLinecap="round"
          initial="initial"
          animate="animate"
          variants={ringV}
        />

        {/* Check */}
        <motion.path
          d="M19 33 L28 42 L45 24"
          fill="none"
          stroke="#34D399"
          strokeWidth="4.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          initial="initial"
          animate="animate"
          variants={checkV}
        />
      </motion.svg>
    </div>
  )
}
