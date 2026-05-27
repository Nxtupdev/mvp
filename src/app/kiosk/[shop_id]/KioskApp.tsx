'use client'

/**
 * KioskApp — client-side state machine for the check-in flow.
 *
 * Owns the current step + the data the user has entered so far. Each
 * screen is rendered inside an <AnimatePresence> so transitions
 * cross-fade smoothly with the ScreenContainer's enter/exit variants.
 *
 * Steps:
 *   - splash             → language picker (always first)
 *   - phone              → phone entry → look up returning customer
 *   - newCustomer        → name + service + source (first-time)
 *   - returningCustomer  → service-only (recognized phone)
 *   - success            → confirmation + queue position
 *
 * Today: only `splash` is wired. The other steps render a placeholder
 * card so we can ship the redesign incrementally. Tomorrow's PR fills
 * in `phone`, `newCustomer`, `returningCustomer`, `success`.
 *
 * The legacy /q/[shop_id] flow continues to handle real check-ins
 * until this state machine is complete.
 */

import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'

import { useLocale } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n-types'
import { KioskHeader } from './_components/KioskHeader'
import { ScreenContainer } from './_components/ScreenContainer'
import { SplashScreen } from './_components/SplashScreen'

// ────────────────────────────────────────────────────────────────────
// Types

type Step = 'splash' | 'phone' | 'newCustomer' | 'returningCustomer' | 'success'

type KioskAppProps = {
  shop: {
    id: string
    name: string
    is_open: boolean
    max_queue_size: number
    logo_url: string | null
  }
  initialWaitingCount: number
}

// ────────────────────────────────────────────────────────────────────
// Component

export function KioskApp({ shop, initialWaitingCount }: KioskAppProps) {
  const { setLocale } = useLocale()
  const [step, setStep] = useState<Step>('splash')
  // The phone step + onwards consume these; right now they're declared
  // so the state machine is shaped correctly for tomorrow's PR.
  const [, setPhone] = useState<string>('')

  // Naive ETA heuristic for the persistent header: 8 minutes per person
  // ahead, ± 25% spread. Tomorrow we'll replace this with a server-side
  // estimate that respects each barber's current service duration.
  const eta =
    initialWaitingCount === 0
      ? null
      : {
          min: Math.max(1, Math.floor(initialWaitingCount * 6)),
          max: Math.max(1, Math.ceil(initialWaitingCount * 10)),
        }

  function handleLanguageSelect(lang: Locale) {
    setLocale(lang)
    setStep('phone')
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0B] text-zinc-50">
      <KioskHeader
        shopName={shop.name}
        shopLogoUrl={shop.logo_url}
        waitingCount={initialWaitingCount}
        eta={eta}
      />

      <main className="relative flex flex-1 flex-col">
        <AnimatePresence mode="wait" initial={false}>
          {step === 'splash' && (
            <ScreenContainer key="splash" background="hero">
              <SplashScreen
                shopName={shop.name}
                shopLogoUrl={shop.logo_url}
                onLanguageSelect={handleLanguageSelect}
              />
            </ScreenContainer>
          )}

          {step !== 'splash' && (
            // Placeholder — filled in by tomorrow's PR. Keeps the route
            // navigable end-to-end so we can demo the splash transition.
            <ScreenContainer key={step} background="flat">
              <PlaceholderScreen
                step={step}
                onBack={() => setStep('splash')}
                onSimulateAdvance={(next) => {
                  if (next === 'phone-mock-submit') {
                    setPhone('+18095550199')
                    setStep('newCustomer')
                  }
                }}
              />
            </ScreenContainer>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Placeholder — temporary stand-in while the rest of the flow is built.

function PlaceholderScreen({
  step,
  onBack,
  onSimulateAdvance,
}: {
  step: Exclude<Step, 'splash'>
  onBack: () => void
  onSimulateAdvance: (next: 'phone-mock-submit') => void
}) {
  const labels: Record<typeof step, string> = {
    phone: 'Phone entry',
    newCustomer: 'New customer form',
    returningCustomer: 'Returning customer',
    success: 'Success',
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Coming next</p>
      <h2 className="text-4xl font-light tracking-tight text-zinc-100 sm:text-5xl">
        {labels[step]}
      </h2>
      <p className="max-w-md text-zinc-400">
        This screen is part of the redesign in progress. The functional check-in
        flow still lives at <code className="text-emerald-400">/q/[shop_id]</code>.
      </p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={onBack}
          className="
            rounded-full bg-white/[0.04] px-6 py-3 text-sm font-medium
            text-zinc-200 ring-1 ring-white/[0.08] backdrop-blur-xl
            transition-colors hover:bg-white/[0.08]
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-400
          "
        >
          ← Back to splash
        </button>
        {step === 'phone' && (
          <button
            type="button"
            onClick={() => onSimulateAdvance('phone-mock-submit')}
            className="
              rounded-full bg-emerald-400/90 px-6 py-3 text-sm font-medium
              text-zinc-950 ring-1 ring-emerald-400/40
              transition-colors hover:bg-emerald-400
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-emerald-400 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#0A0A0B]
            "
          >
            Simulate phone submit →
          </button>
        )}
      </div>
    </div>
  )
}
