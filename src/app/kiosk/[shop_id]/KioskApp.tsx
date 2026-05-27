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
 * Wired today: `splash` + `phone` + `newCustomer` + `success`. The
 * phone screen still mocks the client lookup (always routes to
 * newCustomer), and the success screen renders mocked stats derived
 * from `initialWaitingCount` + 1. The next PR adds the real
 * /api/kiosk/lookup-client and /api/kiosk/checkin endpoints, plus
 * the `returningCustomer` variant.
 *
 * The legacy /q/[shop_id] flow continues to handle real check-ins
 * until those endpoints land.
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
import { SuccessScreen } from './_components/SuccessScreen'
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

type CheckInResult = {
  queuePosition: number
  etaMinutes: { min: number; max: number }
  /** True if the lookup found the phone in `clients` already. */
  isReturning: boolean
  /** Display name shown on the success screen. */
  displayName: string
}

type KioskAppProps = {
  shop: Shop
  services: Service[]
  initialWaitingCount: number
}

const INITIAL_FORM: NewCustomerFormState = {
  firstName: '',
  lastName: '',
  serviceId: null,
  source: null,
}

// ────────────────────────────────────────────────────────────────────
// Helpers

/**
 * Computes a 6-10 minute window per person ahead. Used both for the
 * persistent header ETA and the success screen's wait estimate. This
 * is a placeholder — the backend will eventually return a real ETA
 * that respects each barber's current service duration.
 */
function estimateEta(positionsAhead: number): { min: number; max: number } {
  return {
    min: Math.max(1, Math.floor(positionsAhead * 6)),
    max: Math.max(1, Math.ceil(positionsAhead * 10)),
  }
}

// ────────────────────────────────────────────────────────────────────
// Component

export function KioskApp({ shop, services, initialWaitingCount }: KioskAppProps) {
  const { setLocale } = useLocale()
  const [step, setStep] = useState<Step>('splash')
  const [phone, setPhone] = useState<string>('')
  const [newCustomerForm, setNewCustomerForm] =
    useState<NewCustomerFormState>(INITIAL_FORM)
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null)

  const headerEta =
    initialWaitingCount === 0 ? null : estimateEta(initialWaitingCount)

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
    // Mocked: derive the customer's queue position assuming nobody
    // else checked in between page load and now. The real check-in
    // endpoint will return the authoritative value.
    const queuePosition = initialWaitingCount + 1
    setCheckInResult({
      queuePosition,
      etaMinutes: estimateEta(queuePosition),
      isReturning: false,
      displayName: newCustomerForm.firstName.trim() || '—',
    })
    setStep('success')
  }

  /** Reset everything and return to splash — called by the success
   *  screen's "Listo" button and its 30s auto-reset timer. */
  function handleDone() {
    setStep('splash')
    setPhone('')
    setNewCustomerForm(INITIAL_FORM)
    setCheckInResult(null)
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#0A0A0B] text-zinc-50">
      <KioskHeader
        shopName={shop.name}
        shopLogoUrl={shop.logo_url}
        waitingCount={initialWaitingCount}
        eta={headerEta}
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

          {step === 'success' && checkInResult && (
            <ScreenContainer key="success" background="hero">
              <SuccessScreen
                name={checkInResult.displayName}
                isReturning={checkInResult.isReturning}
                queuePosition={checkInResult.queuePosition}
                etaMinutes={checkInResult.etaMinutes}
                onDone={handleDone}
              />
            </ScreenContainer>
          )}

          {step === 'returningCustomer' && (
            <ScreenContainer key="returningCustomer" background="flat">
              <PlaceholderScreen onBack={() => setStep('phone')} />
            </ScreenContainer>
          )}
        </AnimatePresence>
      </main>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Placeholder — temporary stand-in for the returningCustomer screen
// while we build the lookup endpoint that would actually route there.

function PlaceholderScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 py-12 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-zinc-500">Coming next</p>
      <h2 className="text-4xl font-light tracking-tight text-zinc-100 sm:text-5xl">
        Returning customer
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
