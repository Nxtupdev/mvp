'use client'

/**
 * Screen 1 — Splash + Language Picker
 *
 * Proof-of-execution sample for the NXTUP Check-In kiosk redesign.
 * Reference quality bar for the rest of the flow.
 *
 * Style: Dark Mode base + Glassmorphism cards + Aurora gradient.
 * Mood: Apple Vision Pro meets Linear. Premium without being pretentious.
 *
 * Animation philosophy:
 *   - Logo reveals first (anchor of identity)
 *   - Bilingual welcome fades in stacked
 *   - Language buttons enter with stagger (each feels like an option appearing)
 *   - All durations honor prefers-reduced-motion
 *
 * Touch targets:
 *   - Language buttons: h-32 (128px) on tablet
 *   - Generous spacing (gap-8) prevents accidental taps
 *
 * Production location: src/app/q/[shop_id]/_components/SplashScreen.tsx
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import Image from 'next/image'
import { useEffect, useState } from 'react'

// ────────────────────────────────────────────────────────────────────
// Types

type Language = 'es' | 'en'

interface SplashScreenProps {
  shopName: string
  shopLogoUrl: string | null
  onLanguageSelect: (lang: Language) => void
  /** Used for the persistent header (rendered by parent layout, not here) */
  queueDepth?: number
  estimatedWaitMin?: { min: number; max: number }
}

// ────────────────────────────────────────────────────────────────────
// Animation variants
//
// All eases are cubic-bezier(0.16, 1, 0.3, 1) — Vercel/Linear's "out-expo".
// It starts fast, decelerates smoothly into rest. Feels premium without
// being slow.

const fullEase = [0.16, 1, 0.3, 1] as const

const logoVariants: Variants = {
  initial: { opacity: 0, scale: 0.92 },
  animate: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.8, ease: fullEase, delay: 0.1 },
  },
}

const welcomeVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: (custom: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: fullEase, delay: 0.5 + custom * 0.1 },
  }),
}

const buttonContainerVariants: Variants = {
  initial: {},
  animate: {
    transition: { staggerChildren: 0.12, delayChildren: 0.9 },
  },
}

const buttonVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.95 },
  animate: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.5, ease: fullEase },
  },
}

// Reduced-motion fallback: just opacity, no movement or blur.
const reducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
}

// ────────────────────────────────────────────────────────────────────
// Component

export function SplashScreen({
  shopName,
  shopLogoUrl,
  onLanguageSelect,
}: SplashScreenProps) {
  const shouldReduceMotion = useReducedMotion()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Pick variant set based on reduced-motion preference
  const logoV = shouldReduceMotion ? reducedVariants : logoVariants
  const welcomeV = shouldReduceMotion ? reducedVariants : welcomeVariants
  const buttonContainerV = shouldReduceMotion ? reducedVariants : buttonContainerVariants
  const buttonV = shouldReduceMotion ? reducedVariants : buttonVariants

  return (
    <div
      className="
        relative flex min-h-screen flex-col items-center justify-center
        overflow-hidden bg-[#0A0A0B] px-8 py-12
      "
    >
      {/*
        Aurora background — three radial gradients tinted with NXTUP's
        emerald + a hint of teal and indigo. Subtle: doesn't compete with
        content but adds depth. Behind everything via z-0.
      */}
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

      {/*
        Subtle noise texture to break up the gradient banding.
        SVG inline so it's small and crisp at any DPI.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.015] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' /%3E%3C/svg%3E")`,
        }}
      />

      <div className="relative z-10 flex max-w-2xl flex-col items-center gap-12 sm:gap-16">
        {/* ─── Shop Logo ─── */}
        <motion.div
          initial="initial"
          animate={mounted ? 'animate' : 'initial'}
          variants={logoV}
          className="
            flex h-32 w-32 items-center justify-center
            rounded-3xl bg-white/[0.04] backdrop-blur-xl
            ring-1 ring-white/[0.08]
            sm:h-36 sm:w-36
          "
        >
          {shopLogoUrl ? (
            <Image
              src={shopLogoUrl}
              alt={`${shopName} logo`}
              width={96}
              height={96}
              className="h-24 w-24 object-contain"
              priority
            />
          ) : (
            // Letter-mark fallback — first character of shop name
            <span className="text-6xl font-bold tracking-tighter text-zinc-50">
              {shopName.charAt(0).toUpperCase()}
            </span>
          )}
        </motion.div>

        {/* ─── Bilingual Welcome ─── */}
        <div className="flex flex-col items-center gap-2 text-center">
          <motion.h1
            custom={0}
            initial="initial"
            animate={mounted ? 'animate' : 'initial'}
            variants={welcomeV}
            className="
              bg-gradient-to-br from-zinc-50 to-emerald-400/80
              bg-clip-text text-5xl font-light tracking-tight text-transparent
              sm:text-7xl
            "
            style={{ letterSpacing: '-0.04em' }}
          >
            Bienvenido
          </motion.h1>
          <motion.h2
            custom={1}
            initial="initial"
            animate={mounted ? 'animate' : 'initial'}
            variants={welcomeV}
            className="text-3xl font-light tracking-tight text-zinc-400 sm:text-5xl"
            style={{ letterSpacing: '-0.04em' }}
          >
            Welcome
          </motion.h2>
        </div>

        {/* ─── Language Buttons ─── */}
        <motion.div
          initial="initial"
          animate={mounted ? 'animate' : 'initial'}
          variants={buttonContainerV}
          className="
            mt-4 flex w-full flex-col gap-4 sm:flex-row sm:gap-6
          "
        >
          <motion.button
            variants={buttonV}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
            onClick={() => onLanguageSelect('es')}
            className="
              group relative flex h-32 flex-1 items-center justify-center
              overflow-hidden rounded-3xl
              bg-white/[0.04] backdrop-blur-xl
              ring-1 ring-white/[0.08]
              transition-all duration-300
              hover:bg-white/[0.08] hover:ring-emerald-400/40
              hover:shadow-[0_0_40px_rgba(52,211,153,0.25)]
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-emerald-400 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#0A0A0B]
              active:bg-white/[0.06]
              sm:h-40
            "
          >
            {/* Hover glow accent — appears on hover, animated */}
            <div
              aria-hidden
              className="
                absolute inset-0 bg-gradient-to-br from-emerald-400/0 to-emerald-400/0
                opacity-0 transition-opacity duration-500
                group-hover:from-emerald-400/[0.06] group-hover:to-emerald-400/[0.02]
                group-hover:opacity-100
              "
            />
            <span className="relative text-2xl font-medium tracking-tight text-zinc-50 sm:text-3xl">
              Español
            </span>
          </motion.button>

          <motion.button
            variants={buttonV}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
            onClick={() => onLanguageSelect('en')}
            className="
              group relative flex h-32 flex-1 items-center justify-center
              overflow-hidden rounded-3xl
              bg-white/[0.04] backdrop-blur-xl
              ring-1 ring-white/[0.08]
              transition-all duration-300
              hover:bg-white/[0.08] hover:ring-emerald-400/40
              hover:shadow-[0_0_40px_rgba(52,211,153,0.25)]
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-emerald-400 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#0A0A0B]
              active:bg-white/[0.06]
              sm:h-40
            "
          >
            <div
              aria-hidden
              className="
                absolute inset-0 bg-gradient-to-br from-emerald-400/0 to-emerald-400/0
                opacity-0 transition-opacity duration-500
                group-hover:from-emerald-400/[0.06] group-hover:to-emerald-400/[0.02]
                group-hover:opacity-100
              "
            />
            <span className="relative text-2xl font-medium tracking-tight text-zinc-50 sm:text-3xl">
              English
            </span>
          </motion.button>
        </motion.div>
      </div>
    </div>
  )
}

/**
 * Usage example:
 *
 *   <SplashScreen
 *     shopName="Fade Factory"
 *     shopLogoUrl="https://example.com/fade-factory-logo.png"
 *     onLanguageSelect={(lang) => {
 *       setLanguage(lang)
 *       advanceToPhoneStep()
 *     }}
 *   />
 */
