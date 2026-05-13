'use client'

import { useEffect, useRef, useState } from 'react'

type Ripple = { id: number; x: number; y: number }

type Props = {
  /** Big bold label, e.g. "TAP" */
  label?: string
  /** Small caption shown below the label */
  hint?: string
  onClick?: () => void
  disabled?: boolean
  loading?: boolean
  ariaLabel?: string
}

/**
 * Premium hero "tap to join" button — circular, multi-layered, hardware-grade.
 *
 * Drama mode features:
 *   1. Brand-tinted aura (blue + red radial wash, blurred 36px).
 *   2. White breath halo (tighter, on the disc plane).
 *   3. Chromatic conic-gradient ring rotating 6s (red → blue → green).
 *   4. White-to-zinc dome with deep multi-layer shadows + specular gleams.
 *   5. Embossed "TAP" label with text-shadow.
 *   6. Material-style ripple from the tap point.
 *   7. Chromatic aberration flash on press — RGB channels split briefly,
 *      mimicking high-speed photography of a real hardware tap.
 *   8. Synthesized click sound (Web Audio) — 60ms tonal blip.
 *   9. Haptic vibration where supported.
 *   10. Respects prefers-reduced-motion.
 */
export default function TapButton({
  label = 'TAP',
  hint = 'entrar a la fila',
  onClick,
  disabled = false,
  loading = false,
  ariaLabel,
}: Props) {
  const ref = useRef<HTMLButtonElement>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const [pressing, setPressing] = useState(false)
  const idRef = useRef(0)
  const pressTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  function playClick() {
    if (typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext
    if (!Ctor) return

    if (!audioCtxRef.current) {
      try {
        audioCtxRef.current = new Ctor()
      } catch {
        return
      }
    }
    const ctx = audioCtxRef.current
    if (!ctx) return
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})

    const t = ctx.currentTime
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain).connect(ctx.destination)
    osc.type = 'triangle'
    osc.frequency.setValueAtTime(880, t)
    osc.frequency.exponentialRampToValueAtTime(220, t + 0.06)
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.18, t + 0.005)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
    osc.start(t)
    osc.stop(t + 0.08)
  }

  function spawnRipple(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || loading || !ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const id = ++idRef.current
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    setRipples(prev => [...prev, { id, x, y }])
    window.setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id))
    }, 700)

    // Trigger chromatic aberration flash via state-driven class
    setPressing(true)
    if (pressTimeoutRef.current) clearTimeout(pressTimeoutRef.current)
    pressTimeoutRef.current = setTimeout(() => setPressing(false), 280)

    // Audio click
    playClick()

    // Haptic
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(18)
      } catch {
        // ignore
      }
    }
  }

  return (
    <div className="relative grid place-items-center isolate">
      {/* ── Layer 1: brand-tinted ambient aura (largest, blurriest) ── */}
      <span
        aria-hidden
        className="
          pointer-events-none absolute inset-0 grid place-items-center
        "
      >
        <span
          className="block aspect-square w-[360px] rounded-full motion-safe:animate-tap-aura"
          style={{
            background:
              'radial-gradient(closest-side, rgba(30,58,255,0.22), rgba(239,36,36,0.14) 50%, transparent 75%)',
            filter: 'blur(36px)',
          }}
        />
      </span>

      {/* ── Layer 2: white breath halo (tighter, on the disc plane) ── */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 grid place-items-center"
      >
        <span className="block aspect-square w-[284px] rounded-full motion-safe:animate-tap-glow" />
      </span>

      {/* ── Layer 3: conic-gradient rotating ring (full saturation) ── */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 grid place-items-center"
      >
        <span
          className="
            block aspect-square w-[274px] rounded-full p-[3px]
            motion-safe:animate-tap-spin
          "
          style={{
            background:
              'conic-gradient(from 0deg, #ef2424, #1e3aff, #22c55e, #1e3aff, #ef2424)',
            filter: 'saturate(1.15)',
          }}
        >
          <span className="block h-full w-full rounded-full bg-nxtup-bg" />
        </span>
      </span>

      {/* ── Layer 4: the disc itself ── */}
      <button
        ref={ref}
        type="button"
        onPointerDown={spawnRipple}
        onClick={onClick}
        disabled={disabled || loading}
        aria-label={ariaLabel ?? label}
        className="
          group relative aspect-square w-[260px] rounded-full
          cursor-pointer select-none overflow-hidden
          transition-all duration-200 ease-out
          bg-gradient-to-b from-white via-zinc-100 to-zinc-300
          shadow-[
            0_36px_72px_-16px_rgba(0,0,0,0.85),
            0_8px_20px_-6px_rgba(0,0,0,0.55),
            0_2px_4px_rgba(0,0,0,0.4),
            inset_0_2px_3px_rgba(255,255,255,1),
            inset_0_-10px_28px_rgba(0,0,0,0.12),
            inset_0_0_0_1px_rgba(0,0,0,0.08)
          ]
          hover:-translate-y-1
          hover:shadow-[
            0_48px_88px_-16px_rgba(0,0,0,0.9),
            0_12px_24px_-6px_rgba(0,0,0,0.55),
            0_4px_8px_rgba(0,0,0,0.4),
            inset_0_2px_3px_rgba(255,255,255,1),
            inset_0_-10px_28px_rgba(0,0,0,0.12),
            inset_0_0_0_1px_rgba(0,0,0,0.08)
          ]
          active:translate-y-0 active:scale-[0.94] active:duration-100
          active:bg-gradient-to-t active:from-white active:via-zinc-100 active:to-zinc-200
          active:shadow-[
            0_8px_18px_-8px_rgba(0,0,0,0.55),
            inset_0_12px_30px_rgba(0,0,0,0.30),
            inset_0_-2px_4px_rgba(255,255,255,0.55),
            inset_0_0_0_1px_rgba(0,0,0,0.14)
          ]
          focus-visible:outline-none
          focus-visible:ring-4 focus-visible:ring-nxtup-active/60 focus-visible:ring-offset-4 focus-visible:ring-offset-nxtup-bg
          disabled:cursor-not-allowed disabled:opacity-50
          disabled:hover:translate-y-0
          disabled:shadow-[0_8px_24px_rgba(0,0,0,0.5),inset_0_2px_3px_rgba(255,255,255,0.7)]
          motion-reduce:transition-none motion-reduce:hover:translate-y-0
        "
      >
        {/* Inner concentric rim — bezel detail */}
        <span
          aria-hidden
          className="
            pointer-events-none absolute inset-3 rounded-full
            border border-black/[0.08]
            shadow-[inset_0_1px_0_rgba(255,255,255,0.85),inset_0_-1px_0_rgba(0,0,0,0.06)]
          "
        />

        {/* LIVE indicator at top */}
        <span
          aria-hidden
          className="
            absolute top-9 left-1/2 -translate-x-1/2
            flex items-center gap-1.5
          "
        >
          <span className="relative inline-flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-nxtup-active opacity-50 motion-safe:animate-ping" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-nxtup-active motion-safe:animate-tap-dot" />
          </span>
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-zinc-500">
            Live
          </span>
        </span>

        {/* Center content */}
        <span className="relative z-10 grid h-full place-items-center px-6">
          {loading ? (
            <Spinner />
          ) : (
            <span className="flex flex-col items-center gap-1">
              <span
                className={`
                  text-[68px] font-black tracking-tight text-nxtup-bg leading-none
                  ${pressing ? 'animate-tap-chromatic' : ''}
                `}
                style={{
                  textShadow:
                    '0 1px 0 rgba(255,255,255,0.5), 0 2px 1px rgba(0,0,0,0.06), 0 -1px 0 rgba(0,0,0,0.04)',
                }}
              >
                {label}
              </span>
              <span className="text-[10px] font-bold uppercase tracking-[0.35em] text-zinc-500 mt-1">
                {hint}
              </span>
            </span>
          )}
        </span>

        {/* Top highlight arc — light source from above */}
        <span
          aria-hidden
          className="
            pointer-events-none absolute inset-x-0 top-0 h-[55%] rounded-t-full
            bg-gradient-to-b from-white/85 via-white/30 to-transparent
            mix-blend-overlay
          "
        />

        {/* Side specular gleam — left edge catches light */}
        <span
          aria-hidden
          className="
            pointer-events-none absolute top-8 bottom-8 left-3 w-3 rounded-full
            bg-gradient-to-r from-white/40 to-transparent
            blur-[2px] opacity-70
          "
        />

        {/* Ripples */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
        >
          {ripples.map(r => (
            <span
              key={r.id}
              className="absolute block h-16 w-16 rounded-full bg-nxtup-bg/12 motion-safe:animate-tap-ripple"
              style={{ left: r.x - 32, top: r.y - 32 }}
            />
          ))}
        </span>
      </button>
    </div>
  )
}

function Spinner() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="48"
      height="48"
      className="animate-spin text-nxtup-bg"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeOpacity="0.2"
        strokeWidth="3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}
