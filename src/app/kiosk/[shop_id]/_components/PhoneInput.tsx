'use client'

/**
 * PhoneInput — large phone display for the kiosk check-in flow.
 *
 * Hardcoded to NANP +1 (US + DR + Canada). The country code lives in
 * its own visual chip; the rest of the field shows the live-formatted
 * national number `(XXX) XXX-XXXX`.
 *
 * Controlled: parent owns the raw digits string (0–10 chars, no
 * formatting). Two input paths feed it:
 *
 *   1. The NumericKeypad component (kiosk mode) — calls
 *      `parent.setDigits(prev + digit)` directly.
 *   2. The visible <input type="tel"> here — onChange strips
 *      non-digits and surfaces the raw value to the parent.
 *
 * The single source of truth means both input methods stay in sync
 * trivially. No imperative cursor management — the kiosk doesn't have
 * a physical keyboard anyway, and on mobile the native numeric pad
 * handles things just fine.
 */

import { useId } from 'react'

type PhoneInputProps = {
  /** Raw digits, 0–10 chars. */
  value: string
  onChange: (digits: string) => void
  /** Optional label for assistive tech. */
  ariaLabel?: string
  /** Hint shown below the input — e.g. validation message. */
  helper?: string
  helperTone?: 'neutral' | 'error'
  /** Focus the input on mount (mobile-friendly). */
  autoFocus?: boolean
}

const MAX_DIGITS = 10

export function PhoneInput({
  value,
  onChange,
  ariaLabel = 'Phone number',
  helper,
  helperTone = 'neutral',
  autoFocus = false,
}: PhoneInputProps) {
  const id = useId()
  const isValid = value.length === MAX_DIGITS

  function handleNativeChange(e: React.ChangeEvent<HTMLInputElement>) {
    const onlyDigits = e.target.value.replace(/\D/g, '').slice(0, MAX_DIGITS)
    onChange(onlyDigits)
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-stretch gap-3">
      <label htmlFor={id} className="sr-only">
        {ariaLabel}
      </label>

      <div
        className={`
          flex items-stretch overflow-hidden rounded-2xl
          bg-white/[0.04] ring-1 backdrop-blur-xl transition-all duration-300
          ${
            isValid
              ? 'ring-emerald-400/50 shadow-[0_0_30px_rgba(52,211,153,0.15)]'
              : 'ring-white/[0.08]'
          }
        `}
      >
        {/* Country-code chip */}
        <div
          className="
            flex items-center justify-center
            border-r border-white/[0.08] bg-white/[0.02]
            px-5 text-lg font-medium text-zinc-400
            sm:px-6 sm:text-xl
          "
          aria-hidden
        >
          +1
        </div>

        {/* Live-formatted display, backed by a real <input> for native
            keyboard support on phones. */}
        <input
          id={id}
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          aria-label={ariaLabel}
          aria-invalid={value.length > 0 && !isValid}
          autoFocus={autoFocus}
          value={formatPhone(value)}
          placeholder="(000) 000-0000"
          onChange={handleNativeChange}
          className="
            min-w-0 flex-1 bg-transparent
            px-4 py-5 text-3xl font-medium tracking-wider
            text-zinc-50 tabular-nums
            placeholder:text-zinc-600
            focus:outline-none
            sm:px-6 sm:py-6 sm:text-4xl
          "
          style={{ fontFamily: 'var(--font-geist-mono), monospace' }}
        />
      </div>

      {helper && (
        <p
          className={`
            px-2 text-center text-sm
            ${helperTone === 'error' ? 'text-rose-400' : 'text-zinc-500'}
          `}
        >
          {helper}
        </p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// formatPhone — turns "8095551234" → "(809) 555-1234".
//
// Exported so callers (e.g., success screens) can reuse the formatter
// without having to import the whole input component.

export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '').slice(0, MAX_DIGITS)
  if (d.length === 0) return ''
  if (d.length <= 3) return `(${d}`
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`
}
