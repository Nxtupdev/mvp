'use client'

/**
 * NewCustomerScreen — Screen 3 of the kiosk check-in flow.
 *
 * Two sections:
 *   1. Name    — first name only (required)
 *   2. Source  — referral attribution (optional)
 *
 * Why this lean: the original design had four fields (first + last
 * name, service selection, source). Frank cut last name and service
 * to make check-in feel instant — neither was load-bearing for the
 * core walk-in queue use case. Service capture moves to whatever the
 * barber negotiates in person; last name was never used downstream.
 *
 * Continue is gated on firstName only. Source is optional (and the
 * SourcePicker handles its own toggle / clear behavior).
 *
 * Layout fits portrait tablet (1024×768) comfortably without scroll.
 * Touch targets: first name input h-14, source buttons h-24,
 * Continue h-16 — all comfortably above the 56px floor.
 */

import { motion, useReducedMotion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { useState } from 'react'

import { useLocale } from '@/lib/i18n'
import { ProgressDots } from './ProgressDots'
import { SourcePicker } from './SourcePicker'
import type { ReferralSource } from '../_types'

// ────────────────────────────────────────────────────────────────────
// Types

export type NewCustomerFormValues = {
  firstName: string
  source: ReferralSource | null
}

type NewCustomerScreenProps = {
  /** Persisted form state (parent owns it so back-nav doesn't wipe). */
  values: NewCustomerFormValues
  onChange: (patch: Partial<NewCustomerFormValues>) => void
  onSubmit: (final: NewCustomerFormValues) => void
  onBack: () => void
  currentStep?: number
  totalSteps?: number
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

// ────────────────────────────────────────────────────────────────────
// Component

export function NewCustomerScreen({
  values,
  onChange,
  onSubmit,
  onBack,
  currentStep = 2,
  totalSteps = 3,
}: NewCustomerScreenProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const [attempted, setAttempted] = useState(false)

  const firstNameValid = values.firstName.trim().length > 0
  const canContinue = firstNameValid

  function handleSubmit() {
    if (!canContinue) {
      setAttempted(true)
      return
    }
    onSubmit({
      firstName: values.firstName.trim(),
      source: values.source,
    })
  }

  const sectionTransition = (delay: number) => ({
    initial: shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: {
      duration: 0.45,
      ease: [0.16, 1, 0.3, 1] as const,
      delay,
    },
  })

  return (
    <div className="flex flex-1 flex-col">
      {/* ─── Top row: back + step indicator ─── */}
      <div className="flex items-center justify-between px-6 pt-6 sm:px-12 sm:pt-8">
        <button
          type="button"
          onClick={onBack}
          className="
            -ml-2 flex items-center gap-1 rounded-full
            px-3 py-2 text-sm font-medium text-zinc-400
            transition-colors hover:text-zinc-100
            focus-visible:outline-none focus-visible:ring-2
            focus-visible:ring-emerald-400 focus-visible:ring-offset-2
            focus-visible:ring-offset-[#0A0A0B]
          "
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
          {t('kiosk.back')}
        </button>

        <div className="flex items-center gap-3">
          <span className="text-xs font-medium uppercase tracking-[0.1em] text-zinc-500 sm:text-sm">
            {interpolate(t('kiosk.step'), { n: currentStep, total: totalSteps })}
          </span>
          <ProgressDots current={currentStep} total={totalSteps} />
        </div>
      </div>

      {/* ─── Scrollable form body ─── */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 pt-8 sm:px-12 sm:pt-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-10 sm:gap-12">
          {/* Title */}
          <motion.h1
            {...sectionTransition(0.1)}
            className="
              bg-gradient-to-br from-zinc-50 to-emerald-400/80
              bg-clip-text text-center text-4xl font-light
              tracking-tight text-transparent
              sm:text-6xl
            "
            style={{ letterSpacing: '-0.03em' }}
          >
            {t('kiosk.new.title')}
          </motion.h1>

          {/* Section 1 — Name */}
          <motion.section {...sectionTransition(0.2)} className="flex flex-col gap-3">
            <NameInput
              value={values.firstName}
              onChange={(v) => onChange({ firstName: v })}
              label={t('kiosk.new.firstName')}
              placeholder={t('kiosk.new.firstNamePlaceholder')}
              required
              invalid={attempted && !firstNameValid}
              autoComplete="given-name"
              autoFocus
            />
          </motion.section>

          {/* Section 2 — Source */}
          <motion.section {...sectionTransition(0.3)} className="flex flex-col gap-4">
            <SectionHeader text={t('kiosk.new.source')} />
            <SourcePicker
              selected={values.source}
              onSelect={(s) => onChange({ source: s })}
            />
          </motion.section>

          {/* Continue */}
          <motion.div {...sectionTransition(0.4)} className="mt-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canContinue}
              className="
                group relative flex h-16 w-full items-center justify-center
                overflow-hidden rounded-2xl text-lg font-medium
                transition-all duration-300
                focus-visible:outline-none focus-visible:ring-2
                focus-visible:ring-emerald-400 focus-visible:ring-offset-2
                focus-visible:ring-offset-[#0A0A0B]
                enabled:bg-emerald-400 enabled:text-zinc-950
                enabled:shadow-[0_0_40px_rgba(52,211,153,0.35)]
                enabled:hover:bg-emerald-300
                enabled:active:scale-[0.99]
                disabled:cursor-not-allowed disabled:bg-white/[0.04]
                disabled:text-zinc-600 disabled:ring-1 disabled:ring-white/[0.06]
              "
            >
              {t('kiosk.new.continue')}
            </button>
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// SectionHeader — text label, used for the source section so it
// matches the original three-section visual rhythm even though we're
// down to two now.

function SectionHeader({ text }: { text: string }) {
  return (
    <h2 className="text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
      {text}
    </h2>
  )
}

// ────────────────────────────────────────────────────────────────────
// NameInput — glass-styled text input matching the kiosk language.

function NameInput({
  value,
  onChange,
  label,
  placeholder,
  required = false,
  invalid = false,
  autoComplete,
  autoFocus = false,
}: {
  value: string
  onChange: (v: string) => void
  label: string
  placeholder?: string
  required?: boolean
  invalid?: boolean
  autoComplete?: string
  autoFocus?: boolean
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="px-1 text-xs font-medium uppercase tracking-[0.1em] text-zinc-500">
        {label}
        {required && <span className="ml-1 text-rose-400">*</span>}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        aria-invalid={invalid}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        autoCapitalize="words"
        className={`
          h-14 rounded-2xl bg-white/[0.04] px-4 text-lg font-medium
          text-zinc-50 placeholder:text-zinc-600
          ring-1 backdrop-blur-xl transition-all duration-300
          focus:outline-none focus:bg-white/[0.06]
          focus:ring-emerald-400/50
          ${invalid ? 'ring-rose-400/60' : 'ring-white/[0.08]'}
        `}
      />
    </label>
  )
}
