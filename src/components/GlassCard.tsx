'use client'

/**
 * GlassCard — reusable glassmorphism surface.
 *
 * Visual language for the kiosk check-in flow. Frosted dark surface
 * with subtle ring + backdrop-blur. Two intensities:
 *
 *   - "subtle"   (default): bg-white/4, ring-white/8  → containers, list items
 *   - "elevated": bg-white/8, ring-white/16 → primary CTAs, hovered cards
 *
 * Two interactive flavors:
 *
 *   - default: static, no hover state
 *   - interactive: hover lift + emerald glow, useful for tappable cards
 *
 * Renders any HTML tag via `as` (default: div). When tappable, prefer
 * `as="button"` so the component carries keyboard + focus semantics.
 */

import { forwardRef, type ElementType, type ComponentPropsWithoutRef } from 'react'

type GlassCardOwnProps<E extends ElementType> = {
  as?: E
  intensity?: 'subtle' | 'elevated'
  interactive?: boolean
  selected?: boolean
  className?: string
}

type GlassCardProps<E extends ElementType> = GlassCardOwnProps<E> &
  Omit<ComponentPropsWithoutRef<E>, keyof GlassCardOwnProps<E>>

const baseClasses = 'relative overflow-hidden rounded-3xl backdrop-blur-xl transition-all duration-300'

const intensityClasses = {
  subtle: 'bg-white/[0.04] ring-1 ring-white/[0.08]',
  elevated: 'bg-white/[0.08] ring-1 ring-white/[0.16]',
} as const

const interactiveClasses =
  'cursor-pointer hover:bg-white/[0.08] hover:ring-emerald-400/40 hover:shadow-[0_0_40px_rgba(52,211,153,0.25)] active:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0A0A0B]'

const selectedClasses =
  'bg-emerald-400/[0.08] ring-1 ring-emerald-400/60 shadow-[0_0_30px_rgba(52,211,153,0.2)]'

function joinClassNames(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

function GlassCardInner<E extends ElementType = 'div'>(
  {
    as,
    intensity = 'subtle',
    interactive = false,
    selected = false,
    className,
    ...rest
  }: GlassCardProps<E>,
  ref: React.Ref<Element>,
) {
  const Component = (as ?? 'div') as ElementType

  return (
    <Component
      ref={ref}
      className={joinClassNames(
        baseClasses,
        selected ? selectedClasses : intensityClasses[intensity],
        interactive && !selected && interactiveClasses,
        className,
      )}
      {...rest}
    />
  )
}

export const GlassCard = forwardRef(GlassCardInner) as <E extends ElementType = 'div'>(
  props: GlassCardProps<E> & { ref?: React.Ref<Element> },
) => React.ReactElement
