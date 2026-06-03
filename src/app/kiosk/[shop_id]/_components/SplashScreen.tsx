'use client'

/**
 * SplashScreen — Screen 1 of the kiosk check-in flow.
 *
 * Hero moment: shop logo reveal, dual-language welcome, two big
 * language buttons. This screen sets the tone for the whole flow —
 * the visual quality bar that the others must match.
 *
 * Both welcome strings ("Bienvenido" + "Welcome") render literally,
 * regardless of current locale, because the user hasn't picked yet.
 * Language button labels are also literal in their own language —
 * universal convention for language pickers.
 *
 * Animation choreography:
 *   1. Logo fades in + scales from 0.92 → 1 (delay 0.1s, 0.8s ease)
 *   2. "Bienvenido" then "Welcome" stagger in (0.5s + 0.1s × idx)
 *   3. Language buttons stagger up (delayChildren 0.9s, stagger 0.12s)
 *
 * Reduced motion: all of the above collapses to a simple 300ms fade.
 *
 * Reference: planning/design/samples/splash-screen.tsx
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'

import { InstallButton } from '@/components/InstallButton'
import type { Locale } from '@/lib/i18n-types'

// ────────────────────────────────────────────────────────────────────
// Animation variants — cubic-bezier(0.16, 1, 0.3, 1) (out-expo)

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

const reducedVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.3 } },
}

// ────────────────────────────────────────────────────────────────────
// Component

type SplashScreenProps = {
  shopName: string
  shopLogoUrl: string | null
  onLanguageSelect: (lang: Locale) => void
}

export function SplashScreen({
  shopName,
  shopLogoUrl,
  onLanguageSelect,
}: SplashScreenProps) {
  const shouldReduceMotion = useReducedMotion()

  // Framer Motion handles deferred animation start internally — using
  // initial="initial" + animate="animate" directly is enough to play
  // the choreography on mount without needing a useState/useEffect
  // gate (and avoids React 19's set-state-in-effect lint).
  const logoV = shouldReduceMotion ? reducedVariants : logoVariants
  const welcomeV = shouldReduceMotion ? reducedVariants : welcomeVariants
  const buttonContainerV = shouldReduceMotion ? reducedVariants : buttonContainerVariants
  const buttonV = shouldReduceMotion ? reducedVariants : buttonVariants

  return (
    <div className="relative flex flex-1 flex-col items-center justify-center px-8 py-12">
      <div className="flex max-w-2xl flex-col items-center gap-12 sm:gap-16">
        {/* ─── Shop Logo ───
            Sin contenedor glass — el logo flota libre. Los logos
            con fondo oscuro (típico para barbershops) se funden
            naturalmente contra el bg #0A0A0B del kiosko. Los que
            tengan fondo transparente respiran bien también. */}
        <motion.div
          initial="initial"
          animate="animate"
          variants={logoV}
          className="flex h-40 w-40 items-center justify-center sm:h-48 sm:w-48"
        >
          {shopLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shopLogoUrl}
              alt={`${shopName} logo`}
              className="h-full w-full object-contain"
            />
          ) : (
            // Fallback letra-mark grande para shops sin logo subido.
            <span className="text-8xl font-bold tracking-tighter text-zinc-50 sm:text-9xl">
              {shopName.charAt(0).toUpperCase()}
            </span>
          )}
        </motion.div>

        {/* ─── Bilingual Welcome ─── */}
        <div className="flex flex-col items-center gap-2 text-center">
          <motion.h1
            custom={0}
            initial="initial"
            animate="animate"
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
            animate="animate"
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
          animate="animate"
          variants={buttonContainerV}
          className="mt-4 flex w-full flex-col gap-4 sm:flex-row sm:gap-6"
        >
          <LanguageButton
            label="Español"
            variants={buttonV}
            reduceMotion={shouldReduceMotion ?? false}
            onClick={() => onLanguageSelect('es')}
          />
          <LanguageButton
            label="English"
            variants={buttonV}
            reduceMotion={shouldReduceMotion ?? false}
            onClick={() => onLanguageSelect('en')}
          />
        </motion.div>
      </div>

      {/* ─── Botón de instalar (solo durante setup del kiosk) ───
          InstallButton se auto-oculta cuando ya está instalado
          (display-mode standalone). Solo lo ve el dueño cuando
          configura el tablet por primera vez en el navegador. Una
          vez agregado al home screen del iPad, este botón
          desaparece para siempre. Posición absolute al fondo para
          no interferir con la jerarquía visual del splash. */}
      <div className="absolute inset-x-0 bottom-4 flex justify-center">
        <InstallButton variant="subtle" />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// LanguageButton — extracted so the two buttons share styles cleanly.

function LanguageButton({
  label,
  variants,
  reduceMotion,
  onClick,
}: {
  label: string
  variants: Variants
  reduceMotion: boolean
  onClick: () => void
}) {
  return (
    <motion.button
      type="button"
      variants={variants}
      whileTap={reduceMotion ? undefined : { scale: 0.97 }}
      onClick={onClick}
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
        {label}
      </span>
    </motion.button>
  )
}
