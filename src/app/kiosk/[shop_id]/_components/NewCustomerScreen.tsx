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
  /** True while the parent's /api/kiosk/checkin call is in flight. */
  submitting?: boolean
  /** Server-side error message to render below the CTA, if any. */
  serverError?: string | null
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
  submitting = false,
  serverError = null,
  currentStep = 2,
  totalSteps = 3,
}: NewCustomerScreenProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()
  const [attempted, setAttempted] = useState(false)

  const firstNameValid = values.firstName.trim().length > 0
  const sourceValid = values.source !== null
  const canContinue = firstNameValid && sourceValid

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
    // min-h-0 es CRÍTICO para que el flex respete la constraint del
    // padre. Sin esto los hijos asumen min-height: auto = tamaño del
    // contenido, y todo crece más que el viewport, empujando el CTA
    // off-screen. Bug clásico de flexbox.
    <div className="flex flex-1 flex-col min-h-0">
      {/* ─── Top row: back + step indicator ─── */}
      <div className="flex items-center justify-between px-6 pt-6 sm:px-12 sm:pt-8 flex-shrink-0">
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

      {/* ─── Scrollable form body ───
          El formulario (título + name + source picker) scrollea
          internamente si el viewport es chico. Pero el botón
          Confirmar NO vive aquí — está en una sección fija al fondo
          para que siempre sea visible y nunca se corte.
          min-h-0 acompañado del flex-1 garantiza que el scroll
          interno funcione correctamente cuando el contenido excede
          la altura disponible. */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 pt-8 sm:px-12 sm:pt-10">
        <div className="mx-auto flex max-w-2xl flex-col gap-10 pb-6 sm:gap-12">
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

          {/* Section 2 — Source (required) */}
          <motion.section {...sectionTransition(0.3)} className="flex flex-col gap-4">
            <SectionHeader
              text={t('kiosk.new.source')}
              required
              showAttention={attempted && !sourceValid}
            />
            <SourcePicker
              selected={values.source}
              onSelect={(s) => onChange({ source: s })}
            />
          </motion.section>
        </div>
      </div>

      {/* ─── Sticky bottom CTA ───
          Botón Confirmar fijo al fondo del viewport — siempre visible
          sin importar el tamaño del tablet ni cuánto contenido haya
          arriba. El border-top + bg-base lo separan visualmente del
          formulario scrolleable de arriba. */}
      <motion.div
        {...sectionTransition(0.4)}
        className="flex-shrink-0 border-t border-white/[0.04] bg-[#0A0A0B] px-6 py-4 sm:px-12 sm:py-5"
      >
        <div className="mx-auto max-w-2xl">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canContinue || submitting}
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
          {serverError && (
            <p className="mt-3 text-center text-sm text-rose-400">
              {serverError}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// SectionHeader — text label with required-asterisk and an attention
// dot. The dot lights up only after a failed Continue attempt and the
// section is the blocker — keeps the form quiet on first paint and
// loud when the user needs guidance.

function SectionHeader({
  text,
  required = false,
  showAttention = false,
}: {
  text: string
  required?: boolean
  showAttention?: boolean
}) {
  return (
    <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-100 sm:text-2xl">
      {text}
      {required && <span className="text-rose-400">*</span>}
      {showAttention && (
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full bg-rose-400 shadow-[0_0_12px_rgba(251,113,133,0.6)]"
        />
      )}
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
