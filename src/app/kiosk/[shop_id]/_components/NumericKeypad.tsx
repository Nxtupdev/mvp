'use client'

/**
 * NumericKeypad — touch-optimized 3×4 numeric pad for kiosk mode.
 *
 * Layout:
 *   ┌───┬───┬───┐
 *   │ 1 │ 2 │ 3 │
 *   │ 4 │ 5 │ 6 │
 *   │ 7 │ 8 │ 9 │
 *   │   │ 0 │ ⌫ │
 *   └───┴───┴───┘
 *
 * Bottom-left cell is intentionally blank (no key) — keeps the grid
 * visually balanced without crowding extra functions a barbershop
 * customer doesn't need.
 *
 * Keys use plain <button>s with CSS `active:scale-95` rather than
 * Framer Motion per-key. The keypad re-renders on every value change
 * so per-key motion would burn CPU; CSS active state is GPU-cheap and
 * indistinguishable to the eye.
 *
 * Each key is `h-20 w-full` minimum (80px) — comfortably above the
 * 56px touch-target floor.
 */

import { Delete } from 'lucide-react'

type NumericKeypadProps = {
  onDigit: (digit: string) => void
  onBackspace: () => void
  /** Disables all keys (e.g., while a submit is in-flight). */
  disabled?: boolean
  className?: string
}

const ROW_1 = ['1', '2', '3'] as const
const ROW_2 = ['4', '5', '6'] as const
const ROW_3 = ['7', '8', '9'] as const

export function NumericKeypad({
  onDigit,
  onBackspace,
  disabled = false,
  className,
}: NumericKeypadProps) {
  return (
    <div
      role="group"
      aria-label="Numeric keypad"
      className={`mx-auto grid w-full max-w-xs grid-cols-3 gap-3 ${className ?? ''}`}
    >
      {[...ROW_1, ...ROW_2, ...ROW_3].map((digit) => (
        <KeypadKey
          key={digit}
          label={digit}
          ariaLabel={digit}
          disabled={disabled}
          onPress={() => onDigit(digit)}
        />
      ))}

      {/* Empty bottom-left cell */}
      <span aria-hidden className="h-20" />

      <KeypadKey
        label="0"
        ariaLabel="0"
        disabled={disabled}
        onPress={() => onDigit('0')}
      />

      <KeypadKey
        ariaLabel="Backspace"
        disabled={disabled}
        onPress={onBackspace}
      >
        <Delete className="h-6 w-6" aria-hidden />
      </KeypadKey>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────
// Internal — single keypad button.

function KeypadKey({
  label,
  ariaLabel,
  disabled,
  onPress,
  children,
}: {
  label?: string
  ariaLabel: string
  disabled: boolean
  onPress: () => void
  children?: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onPress}
      className="
        flex h-20 items-center justify-center
        rounded-2xl bg-white/[0.04] ring-1 ring-white/[0.08]
        text-2xl font-medium text-zinc-50
        backdrop-blur-xl transition-all duration-150
        hover:bg-white/[0.08] hover:ring-white/[0.12]
        active:scale-[0.96] active:bg-white/[0.12]
        focus-visible:outline-none focus-visible:ring-2
        focus-visible:ring-emerald-400 focus-visible:ring-offset-2
        focus-visible:ring-offset-[#0A0A0B]
        disabled:cursor-not-allowed disabled:opacity-40
      "
    >
      {children ?? label}
    </button>
  )
}
