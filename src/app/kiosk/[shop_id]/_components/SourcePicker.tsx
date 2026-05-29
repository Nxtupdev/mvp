'use client'

/**
 * SourcePicker — referral attribution capture, first-visit only.
 *
 * 6 icon+label buttons matching the closed list on `clients.
 * referral_source` (migration 032). Single-select. The user can
 * switch between options freely; tapping the currently-selected
 * button is a no-op (we removed the old "tap to clear" toggle now
 * that NewCustomerScreen requires a source before Continue
 * enables).
 *
 * Icons:
 *   - Walk-by   → MapPin (Lucide, mono)
 *   - Google    → custom 4-color G
 *   - Instagram → custom rounded-square camera with brand gradient
 *   - TikTok    → custom note with cyan/magenta split-tone
 *   - Friend    → Users (Lucide, mono)
 *   - Other     → MoreHorizontal (Lucide, mono)
 *
 * Brand icons keep their official colors regardless of selection
 * state — the selection indicator is the surrounding ring + bg, not
 * an icon color shift. That way recognizable marks stay recognizable.
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
    // Source is now required at the call site (NewCustomerScreen
    // gates Continue on `values.source !== null`). We dropped the
    // "tap to clear" toggle: the user can switch between options
    // freely but can't end up with no selection. Tapping the
    // currently-selected button is a no-op.
    if (selected === source) return
    onSelect(source)
  }

  return (
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
      <SourceIcon source={source} className="h-7 w-7 text-zinc-300" />
      <span
        className={`text-xs font-medium tracking-tight sm:text-sm ${
          selected ? 'text-zinc-50' : 'text-zinc-200'
        }`}
      >
        {label}
      </span>
    </motion.button>
  )
}

// ────────────────────────────────────────────────────────────────────
// SourceIcon — Lucide for the generic ones, custom SVGs for brands.

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

// ────────────────────────────────────────────────────────────────────
// Brand SVGs — kept inline so the kiosk has zero external icon deps.
//
// These use canonical brand colors. Approximations of the official
// marks — close enough that customers immediately recognize them,
// not so detailed that they trip a brand-guideline review.

// Google G — the classic 4-color mark.
function GoogleGIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      />
    </svg>
  )
}

// Instagram — rounded square with the official 5-stop brand gradient
// (yellow → orange → magenta → purple → blue), camera lens in white.
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient
          id="nxtup-ig-gradient"
          x1="0%"
          y1="100%"
          x2="100%"
          y2="0%"
        >
          <stop offset="0%" stopColor="#FEDA75" />
          <stop offset="25%" stopColor="#FA7E1E" />
          <stop offset="50%" stopColor="#D62976" />
          <stop offset="75%" stopColor="#962FBF" />
          <stop offset="100%" stopColor="#4F5BD5" />
        </linearGradient>
      </defs>
      <rect
        x="2"
        y="2"
        width="20"
        height="20"
        rx="5.5"
        fill="url(#nxtup-ig-gradient)"
      />
      <circle
        cx="12"
        cy="12"
        r="4.2"
        fill="none"
        stroke="white"
        strokeWidth="2"
      />
      <circle cx="17.5" cy="6.5" r="1.2" fill="white" />
    </svg>
  )
}

// TikTok — the note with the iconic cyan + magenta split-tone offset.
// Three layers stacked: cyan shifted up-right, magenta shifted down-
// left, white note on top. On a dark background the white reads as
// the primary mark.
function TikTokIcon({ className }: { className?: string }) {
  const notePath =
    'M16.6 4c.3 1.4 1.1 2.5 2.2 3.3.8.5 1.7.9 2.7.9v3.3c-1.7 0-3.3-.5-4.7-1.4v7.1c0 3.7-3 6.7-6.7 6.7s-6.7-3-6.7-6.7 3-6.7 6.7-6.7c.4 0 .7 0 1.1.1v3.4c-.4-.1-.7-.2-1.1-.2-1.9 0-3.4 1.5-3.4 3.4s1.5 3.4 3.4 3.4 3.4-1.5 3.4-3.4V4h3.1z'
  return (
    <svg
      aria-hidden
      className={className}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g>
        <path d={notePath} fill="#25F4EE" transform="translate(-1, 1)" />
        <path d={notePath} fill="#FE2C55" transform="translate(1, -1)" />
        <path d={notePath} fill="white" />
      </g>
    </svg>
  )
}
