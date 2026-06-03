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
 *   - phone              → phone entry → /api/kiosk/lookup-client
 *   - newCustomer        → name + source (first-time)
 *   - returningCustomer  → welcome back + confirm (recognized phone)
 *   - success            → confirmation + queue position
 *
 * Real backend wiring:
 *   - PhoneScreen submit  → POST /api/kiosk/lookup-client
 *     Branches to newCustomer (null) or returningCustomer (client).
 *   - NewCustomerScreen submit / ReturningCustomerScreen continue
 *     → POST /api/kiosk/checkin
 *     Returns queue position + ETA + assigned barber → SuccessScreen.
 *
 * Errors from either endpoint are rendered on the active screen via
 * `serverError` (PhoneScreen / NewCustomerScreen) or the inline
 * `error` slot on ReturningCustomerScreen. We surface the server's
 * Spanish error message verbatim — it's already user-facing copy
 * ("La barbería está cerrada", "La cola está llena", etc.).
 */

import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'

import { useLocale } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n-types'
import { KioskHeader } from './_components/KioskHeader'
import { NewCustomerScreen } from './_components/NewCustomerScreen'
import { PhoneScreen } from './_components/PhoneScreen'
import { ReturningCustomerScreen } from './_components/ReturningCustomerScreen'
import { ScreenContainer } from './_components/ScreenContainer'
import { SplashScreen } from './_components/SplashScreen'
import { SuccessScreen } from './_components/SuccessScreen'
import { useQueueCount } from './_hooks/useQueueCount'
import type { ReferralSource, Shop } from './_types'

// ────────────────────────────────────────────────────────────────────
// Types

type Step = 'splash' | 'phone' | 'newCustomer' | 'returningCustomer' | 'success'

type NewCustomerFormState = {
  firstName: string
  source: ReferralSource | null
}

/** Data returned by /api/kiosk/lookup-client when the phone matches
 *  an existing client. Held during the returningCustomer step. */
type ReturningClientInfo = {
  id: string
  name: string
  /** total_visits BEFORE this check-in — used to render "Visit #N" */
  previousVisits: number
}

/** Snapshot of /api/kiosk/checkin's response. Drives SuccessScreen. */
type CheckInResult = {
  queuePosition: number
  etaMinutes: { min: number; max: number }
  isReturning: boolean
  displayName: string
}

type KioskAppProps = {
  shop: Shop
  initialWaitingCount: number
}

const INITIAL_FORM: NewCustomerFormState = {
  firstName: '',
  source: null,
}

// ────────────────────────────────────────────────────────────────────
// Helpers

/**
 * 6–10 minute window per person ahead — purely for the persistent
 * header. The success-screen ETA comes from the server (which uses
 * the same formula today but will eventually return a barber-aware
 * estimate).
 */
function estimateHeaderEta(positionsAhead: number): { min: number; max: number } {
  return {
    min: Math.max(1, Math.floor(positionsAhead * 6)),
    max: Math.max(1, Math.ceil(positionsAhead * 10)),
  }
}

/** Best-effort: try to extract `error` from a JSON response. Falls
 *  back to a generic message for non-JSON or network failures. */
async function readServerError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json()
    if (typeof body?.error === 'string') return body.error
  } catch {
    // Not JSON — fall through to fallback.
  }
  return fallback
}

// ────────────────────────────────────────────────────────────────────
// Component

export function KioskApp({ shop, initialWaitingCount }: KioskAppProps) {
  const { locale, setLocale } = useLocale()
  const [step, setStep] = useState<Step>('splash')
  const [phone, setPhone] = useState<string>('')
  const [newCustomerForm, setNewCustomerForm] =
    useState<NewCustomerFormState>(INITIAL_FORM)
  const [returningClient, setReturningClient] =
    useState<ReturningClientInfo | null>(null)
  const [checkInResult, setCheckInResult] = useState<CheckInResult | null>(null)

  // Per-step network state. Reset on step transitions so a stale
  // error from one screen doesn't leak into another.
  const [lookupSubmitting, setLookupSubmitting] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)
  const [checkInSubmitting, setCheckInSubmitting] = useState(false)
  const [checkInError, setCheckInError] = useState<string | null>(null)

  // Live waiting count via Supabase Realtime — keeps the persistent
  // header honest as customers come and go while the kiosk stays open.
  // initialWaitingCount seeds the first paint (no flash of 0) before
  // the subscription kicks in.
  const waitingCount = useQueueCount(shop.id, initialWaitingCount)
  const headerEta =
    waitingCount === 0 ? null : estimateHeaderEta(waitingCount)

  function handleLanguageSelect(lang: Locale) {
    setLocale(lang)
    setStep('phone')
  }

  // ── Phone submit → lookup ──────────────────────────────────────
  async function handlePhoneSubmit() {
    setLookupError(null)
    setLookupSubmitting(true)
    try {
      const res = await fetch('/api/kiosk/lookup-client', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shop.id, phone }),
      })

      if (!res.ok) {
        setLookupError(await readServerError(res, 'No se pudo buscar el cliente'))
        return
      }

      const body = (await res.json()) as {
        client: {
          id: string
          first_name: string
          total_visits: number
        } | null
      }

      if (body.client) {
        setReturningClient({
          id: body.client.id,
          name: body.client.first_name,
          previousVisits: body.client.total_visits,
        })
        setStep('returningCustomer')
      } else {
        setStep('newCustomer')
      }
    } catch (err) {
      console.error('[kiosk] lookup failed', err)
      setLookupError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLookupSubmitting(false)
    }
  }

  function handleNewCustomerFormChange(patch: Partial<NewCustomerFormState>) {
    setNewCustomerForm((prev) => ({ ...prev, ...patch }))
  }

  // ── Either form submit → checkin ───────────────────────────────
  // Shared so both new and returning flows produce the same success
  // result. The server distinguishes new vs returning by phone lookup;
  // we only need to pass first_name + source on the new path.
  async function performCheckIn(
    opts:
      | { mode: 'new'; firstName: string; source: ReferralSource | null }
      | { mode: 'returning' },
  ) {
    setCheckInError(null)
    setCheckInSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        shop_id: shop.id,
        phone,
        preferred_language: locale,
      }
      if (opts.mode === 'new') {
        payload.first_name = opts.firstName
        payload.source = opts.source
      }

      const res = await fetch('/api/kiosk/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        setCheckInError(await readServerError(res, 'No se pudo registrar'))
        return
      }

      const body = (await res.json()) as {
        is_returning: boolean
        display_name: string
        queue_position: number
        eta_minutes: { min: number; max: number }
      }

      setCheckInResult({
        queuePosition: body.queue_position,
        etaMinutes: body.eta_minutes,
        isReturning: body.is_returning,
        displayName: body.display_name,
      })
      setStep('success')
    } catch (err) {
      console.error('[kiosk] checkin failed', err)
      setCheckInError('Error de conexión. Intenta de nuevo.')
    } finally {
      setCheckInSubmitting(false)
    }
  }

  function handleNewCustomerSubmit() {
    performCheckIn({
      mode: 'new',
      firstName: newCustomerForm.firstName.trim(),
      source: newCustomerForm.source,
    })
  }

  function handleReturningContinue() {
    performCheckIn({ mode: 'returning' })
  }

  /** Reset everything and return to splash. Called by the success
   *  screen's "Listo" button and its 30s auto-reset timer, and by
   *  any back-navigation that should wipe partial state. */
  function handleDone() {
    setStep('splash')
    setPhone('')
    setNewCustomerForm(INITIAL_FORM)
    setReturningClient(null)
    setCheckInResult(null)
    setLookupError(null)
    setCheckInError(null)
  }

  return (
    // h-[100dvh] = altura exacta del viewport dinámico (cuenta con la
    // barra del navegador móvil). overflow-hidden mata el scroll vertical.
    // touch-manipulation elimina el delay de 300ms del double-tap-zoom
    // en iOS — los taps responden instantáneo sin necesidad de PWA.
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-[#0A0A0B] text-zinc-50 touch-manipulation">
      <KioskHeader
        shopName={shop.name}
        shopLogoUrl={shop.logo_url}
        waitingCount={waitingCount}
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
                onChange={(v) => {
                  setPhone(v)
                  if (lookupError) setLookupError(null)
                }}
                onSubmit={handlePhoneSubmit}
                onBack={() => setStep('splash')}
                submitting={lookupSubmitting}
                serverError={lookupError}
                currentStep={1}
                totalSteps={3}
              />
            </ScreenContainer>
          )}

          {step === 'newCustomer' && (
            <ScreenContainer key="newCustomer" background="flat">
              <NewCustomerScreen
                values={newCustomerForm}
                onChange={handleNewCustomerFormChange}
                onSubmit={handleNewCustomerSubmit}
                onBack={() => setStep('phone')}
                submitting={checkInSubmitting}
                serverError={checkInError}
                currentStep={2}
                totalSteps={3}
              />
            </ScreenContainer>
          )}

          {step === 'returningCustomer' && returningClient && (
            <ScreenContainer key="returningCustomer" background="flat">
              <ReturningCustomerScreen
                name={returningClient.name}
                previousVisits={returningClient.previousVisits}
                onContinue={handleReturningContinue}
                onBack={() => setStep('phone')}
                submitting={checkInSubmitting}
                error={checkInError}
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
        </AnimatePresence>
      </main>
    </div>
  )
}
