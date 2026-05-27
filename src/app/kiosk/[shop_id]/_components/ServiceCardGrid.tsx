'use client'

/**
 * ServiceCardGrid — grid of selectable service cards.
 *
 * Radio-style: exactly one service is selected at a time. Selected card
 * gets an emerald ring + glow. Cards stagger in on mount via Framer
 * Motion (subtle — 60ms between, no overdesign).
 *
 * Layout:
 *   - 2 columns on phone (sm and below)
 *   - 3 columns on tablet (sm+)
 *   - Each card: name (text-xl semibold) + duration ("30 min", muted)
 *
 * Empty state: shop hasn't configured services yet → renders a soft
 * message. The new-customer screen will still allow Continue if it
 * accepts a null selection (caller's choice).
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'

import { useLocale } from '@/lib/i18n'
import type { Service } from '../_types'

type ServiceCardGridProps = {
  services: Service[]
  /** Currently selected service id, or null if none. */
  selectedId: string | null
  onSelect: (serviceId: string) => void
}

const containerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.06 } },
}

const cardVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] },
  },
}

const reducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
}

export function ServiceCardGrid({
  services,
  selectedId,
  onSelect,
}: ServiceCardGridProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()

  if (services.length === 0) {
    return (
      <p className="text-center text-base text-zinc-500">
        {t('kiosk.new.noServices')}
      </p>
    )
  }

  const containerV = shouldReduceMotion ? reducedVariants : containerVariants
  const cardV = shouldReduceMotion ? reducedVariants : cardVariants

  return (
    <motion.div
      role="radiogroup"
      aria-label="Service"
      initial="initial"
      animate="animate"
      variants={containerV}
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
    >
      {services.map((service) => {
        const isSelected = service.id === selectedId
        return (
          <motion.button
            key={service.id}
            type="button"
            variants={cardV}
            role="radio"
            aria-checked={isSelected}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
            onClick={() => onSelect(service.id)}
            className={`
              group flex h-28 flex-col items-start justify-between
              rounded-2xl p-4 text-left
              backdrop-blur-xl transition-all duration-300
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-emerald-400 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#0A0A0B]
              sm:h-32 sm:p-5
              ${
                isSelected
                  ? 'bg-emerald-400/[0.08] ring-2 ring-emerald-400/70 shadow-[0_0_30px_rgba(52,211,153,0.2)]'
                  : 'bg-white/[0.04] ring-1 ring-white/[0.08] hover:bg-white/[0.08] hover:ring-white/[0.16]'
              }
            `}
          >
            <span
              className={`
                text-base font-semibold tracking-tight sm:text-xl
                ${isSelected ? 'text-emerald-300' : 'text-zinc-50'}
              `}
            >
              {service.name}
            </span>
            <span className="text-sm text-zinc-400 sm:text-base">
              {service.duration_minutes} {t('kiosk.minutes.short')}
            </span>
          </motion.button>
        )
      })}
    </motion.div>
  )
}
