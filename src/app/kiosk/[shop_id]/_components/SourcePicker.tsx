'use client'

/**
 * SourcePicker — referral attribution capture, first-visit only.
 *
 * 6 icon+label buttons matching the closed list on `clients.
 * referral_source` (migration 032). Single-select. A "Skip" text
 * link below clears the selection — the column allows NULL when the
 * user didn't pick a source, which keeps analytics honest.
 *
 * Icons:
 *   - Walk-by → MapPin (Lucide)
 *   - Google  → custom Google G (mono — see GoogleGIcon below)
 *   - Instagram → custom SVG (Lucide v1 dropped brand icons)
 *   - TikTok → custom SVG (Lucide v1 dropped brand icons)
 *   - Friend → Users (Lucide)
 *   - Other → MoreHorizontal (Lucide)
 *
 * Layout: 3 columns on tablet, 2 on phone. Each button h-24 (96px) —
 * well above the 56px touch-target floor.
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import {
  MapPin,
  MoreHorizontal,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { useLocale } from '@/lib/i18n'
import { REFERRAL_SOURCES, type ReferralSource } from '../_types'

type SourcePickerProps = {
  selected: ReferralSource | null
  onSelect: (source: ReferralSource | null) => void
}

const containerVariants: Variants = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05 } },
}

const itemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
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

export function SourcePicker({ selected, onSelect }: SourcePickerProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const containerV = shouldReduceMotion ? reducedVariants : containerVariants
  const itemV = shouldReduceMotion ? reducedVariants : itemVariants

  function handleSelect(source: ReferralSource) {
    // Toggle: tapping the selected button clears it.
    onSelect(selected === source ? null : source)
  }

  return (
    <div className="flex flex-col items-stretch gap-4">
      <motion.div
        role="radiogroup"
        aria-label={t('kiosk.new.source')}
        initial="initial"
        animate="animate"
        variants={containerV}
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4"
      >
        {REFERRAL_SOURCES.map((source) => (
          <SourceButton
            key={source}
            source={source}
            label={t(`kiosk.source.${source}`)}
            selected={selected === source}
            variants={itemV}
            reduceMotion={shouldReduceMotion ?? false}
            onPress={() => handleSelect(source)}
          />
        ))}
      </motion.div>

      <button
        type="button"
        onClick={() => onSelect(null)}
        className="
          mx-auto rounded-md px-3 py-2 text-sm font-medium
          text-zinc-500 underline-offset-4 transition-colors
          hover:text-zinc-300 hover:underline
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-emerald-400 focus-visible:ring-offset-2
          focus-visible:ring-offset-[#0A0A0B]
        "
      >
        {t('kiosk.skip')}
      </button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// SourceButton — single tappable button.

function SourceButton({
  source,
  label,
  selected,
  variants,
  reduceMotion,
  onPress,
}: {
  source: ReferralSource
  label: string
  selected: boolean
  variants: Variants
  reduceMotion: boolean
  onPress: () => void
}) {
  return (
    <motion.button
      type="button"
      variants={variants}
      role="radio"
      aria-checked={selected}
      whileTap={reduceMotion ? undefined : { scale: 0.96 }}
      onClick={onPress}
      className={`
        group flex h-24 flex-col items-center justify-center gap-2
        rounded-2xl backdrop-blur-xl transition-all duration-300
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-emerald-400 focus-visible:ring-offset-2
        focus-visible:ring-offset-[#0A0A0B]
        ${
          selected
            ? 'bg-emerald-400/[0.08] ring-2 ring-emerald-400/70 shadow-[0_0_30px_rgba(52,211,153,0.2)]'
            : 'bg-white/[0.04] ring-1 ring-white/[0.08] hover:bg-white/[0.08] hover:ring-white/[0.16]'
        }
      `}
    >
      <SourceIcon
        source={source}
        className={`h-6 w-6 ${selected ? 'text-emerald-300' : 'text-zinc-300'}`}
      />
      <span
        className={`text-xs font-medium tracking-tight sm:text-sm ${
          selected ? 'text-emerald-300' : 'text-zinc-200'
        }`}
      >
        {label}
      </span>
    </motion.button>
  )
}

// ────────────────────────────────────────────────────────────────────
// SourceIcon — Lucide icons + two custom (Google G, TikTok)

function SourceIcon({
  source,
  className,
}: {
  source: ReferralSource
  className?: string
}) {
  const lucideMap: Partial<Record<ReferralSource, LucideIcon>> = {
    'walk-by': MapPin,
    friend: Users,
    other: MoreHorizontal,
  }
  const Lucide = lucideMap[source]

  if (Lucide) return <Lucide className={className} aria-hidden />
  if (source === 'google') return <GoogleGIcon className={className} />
  if (source === 'instagram') return <InstagramIcon className={className} />
  if (source === 'tiktok') return <TikTokIcon className={className} />
  return null
}

// Google "G" — simplified mono mark. We don't render Google's official
// 4-color logo because (a) it'd clash with the all-mono kiosk language
// and (b) brand-guideline territory. Mono G in current color is fine.
function GoogleGIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-3.5-7.1" />
      <path d="M21 5v6h-6" />
      <path d="M12 12h6" />
    </svg>
  )
}

// Instagram — rounded square + circle + dot. Lucide v1 removed brand
// icons so we hand-roll the classic IG mark in mono.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

// TikTok — simplified mono note. Same rationale as Google above.
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
    >
      <path d="M19.6 6.3a5.5 5.5 0 0 1-3.4-1.5 5.5 5.5 0 0 1-1.7-3.3V1h-3.4v13.4a3 3 0 1 1-2.1-2.9V8a6.4 6.4 0 1 0 5.5 6.4V8.6a8.9 8.9 0 0 0 5.1 1.7V6.9c0-.2 0-.4-.1-.6Z" />
    </svg>
  )
}
