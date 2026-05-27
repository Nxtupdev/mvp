'use client'

/**
 * QueueStatBlock — glass card with a big mono numeric + label + unit.
 *
 * Used on the success screen for two stats side by side:
 *
 *   ┌──────────────┐ ┌──────────────┐
 *   │  POSICIÓN    │ │  ESPERA      │  ← label (uppercase tracked)
 *   │              │ │              │
 *   │     #4       │ │   6-10 min   │  ← value (text-7xl mono)
 *   │              │ │              │
 *   └──────────────┘ └──────────────┘
 *
 * Pure presentational — animation is the caller's responsibility
 * (typically wrapped in a stagger container).
 */

import type { ReactNode } from 'react'

type QueueStatBlockProps = {
  label: string
  value: ReactNode
  unit?: ReactNode
  /** Optional tone for the numeric — emerald for the "good news"
   *  primary stat (queue position), default zinc for secondary. */
  tone?: 'primary' | 'neutral'
  className?: string
}

export function QueueStatBlock({
  label,
  value,
  unit,
  tone = 'neutral',
  className,
}: QueueStatBlockProps) {
  const valueColor =
    tone === 'primary'
      ? 'text-emerald-300'
      : 'text-zinc-50'

  return (
    <div
      className={`
        flex flex-col items-center justify-center gap-3
        rounded-3xl bg-white/[0.04] px-6 py-8
        ring-1 ring-white/[0.08] backdrop-blur-xl
        sm:px-8 sm:py-10
        ${className ?? ''}
      `}
    >
      <span
        className="
          text-xs font-medium uppercase tracking-[0.15em] text-zinc-500
          sm:text-sm
        "
      >
        {label}
      </span>

      <span className="flex items-baseline gap-2">
        <span
          className={`
            text-6xl font-bold tabular-nums leading-none sm:text-7xl
            ${valueColor}
          `}
          style={{
            fontFamily: 'var(--font-geist-mono), monospace',
            letterSpacing: '-0.04em',
          }}
        >
          {value}
        </span>
        {unit && (
          <span className="text-lg font-medium text-zinc-500 sm:text-xl">
            {unit}
          </span>
        )}
      </span>
    </div>
  )
}
