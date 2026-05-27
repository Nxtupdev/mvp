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
 * Wired today: `splash` + `phone` + `newCustomer`. The phone screen
 * currently mocks the client lookup (always routes to newCustomer);
 * the success screen is still a placeholder. Next PR adds the real
 * /api/kiosk/lookup-client endpoint, the SuccessScreen, and the
 * /api/kiosk/checkin POST that actually creates the queue entry.
 *
 * The legacy /q/[shop_id] flow continues to handle real check-ins
 * until this state machine is complete.
 */

import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'

import { useLocale } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n-types'
import { KioskHeader } from './_components/KioskHeader'
import { NewCustomerScreen } from './_components/NewCustomerScreen'
import { PhoneScreen } from './_components/PhoneScreen'
import { ScreenContainer } from './_components/ScreenContainer'
import { SplashScreen } from './_components/SplashScreen'
import type { ReferralSource, Service, Shop } from './_types'

// ────────────────────────────────────────────────────────────────────
// Types

type Step = 'splash' | 'phone' | 'newCustomer' | 'returningCustomer' | 'success'

type NewCustomerFormState = {
  firstName: string
  lastName: string
  serviceId: string | null
  source: ReferralSource | null
}

type KioskAppProps = {
  shop: Shop
  services: Service[]
  initialWaitingCount: number
}

// ────────────────────────────────────────────────────────────────────
// Component

export function KioskApp({ shop, services, initialWaitingCount }: KioskAppProps) {
  const { setLocale } = useLocale()
  const [step, setStep] = useState<Step>('splash')
  const [phone, setPhone] = useState<string>('')
  const [newCustomerForm, setNewCustomerForm] = useState<NewCustomerFormState>({
    firstName: '',
    lastName: '',
    serviceId: null,
    source: null,
  })

  // Naive ETA heuristic for the persistent header: 6–10 minutes per
  // person ahead. Replace later with a server-side estimate that
  // respects each barber's current service duration.
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

  function handlePhoneSubmit() {
    // Mocked: always treat as new customer for now. Real lookup
    // happens in the next PR — it'll hit /api/kiosk/lookup-client
    // and branch to either `newCustomer` or `returningCustomer`.
    setStep('newCustomer')
  }

  function handleNewCustomerFormChange(patch: Partial<NewCustomerFormState>) {
    setNewCustomerForm((prev) => ({ ...prev, ...patch }))
  }

  function handleNewCustomerSubmit() {
    // TODO: POST /api/kiosk/checkin with phone + newCustomerForm,
    // then advance to success with the returned queue position + ETA.
    setStep('success')
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

          {step === 'phone' && (
            <ScreenContainer key="phone" background="flat">
              <PhoneScreen
                value={phone}
                onChange={setPhone}
                onSubmit={handlePhoneSubmit}
                onBack={() => setStep('splash')}
                currentStep={1}
                totalSteps={3}
              />
            </ScreenContainer>
          )}

          {step === 'newCustomer' && (
            <ScreenContainer key="newCustomer" background="flat">
              <NewCustomerScreen
                services={services}
                values={newCustomerForm}
                onChange={handleNewCustomerFormChange}
                onSubmit={handleNewCustomerSubmit}
                onBack={() => setStep('phone')}
                currentStep={2}
                totalSteps={3}
              />
            </ScreenContainer>
          )}

          {(step === 'returningCustomer' || step === 'success') && (
            <ScreenContainer key={step} background="flat">
              <PlaceholderScreen step={step} onBack={() => setStep('newCustomer')} />
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
}: {
  step: 'returningCustomer' | 'success'
  onBack: () => void
}) {
  const labels: Record<typeof step, string> = {
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
      <button
        type="button"
        onClick={onBack}
        className="
          mt-4 rounded-full bg-white/[0.04] px-6 py-3 text-sm font-medium
          text-zinc-200 ring-1 ring-white/[0.08] backdrop-blur-xl
          transition-colors hover:bg-white/[0.08]
          focus-visible:outline-none focus-visible:ring-2
          focus-visible:ring-emerald-400
        "
      >
        ← Back
      </button>
    </div>
  )
}
