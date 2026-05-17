'use client'

import { useEffect, useState } from 'react'
import type { AvatarId } from '@/components/avatars'

// ──────────────────────────────────────────────────────────────
// Shared types — used by /devices simulator AND the per-barber
// /barber/[shop_id]/[barber_id] standalone screen so both stay
// in sync if we add columns.
// ──────────────────────────────────────────────────────────────

export type BarberDeviceData = {
  id: string
  name: string
  avatar: AvatarId | null
  status: 'available' | 'busy' | 'break' | 'offline'
  available_since: string | null
  break_started_at: string | null
  break_held_since: string | null
  break_minutes_at_start: number | null
  breaks_taken_today: number | null
  // True when shop.break_mode='not_guaranteed' AND a barber below
  // has completed a walk-in during this break. Drives the "POSICIÓN
  // PERDIDA" badge below.
  break_invalidated?: boolean | null
}

export type ShopDeviceConfig = {
  first_break_minutes: number
  next_break_minutes: number
  // Legacy toggle — kept for back-compat with old fetches, but the
  // device screen now drives the badge from break_mode instead.
  keep_position_on_break: boolean
  break_position_grace_minutes: number
  // Added in migration 014. Optional so consumers on the old schema
  // don't break — defaults to 'guaranteed' (= keep-the-spot semantics).
  break_mode?: 'guaranteed' | 'not_guaranteed'
}

export type DeviceClient = {
  id: string
  client_name: string
  position: number
} | null

type StatusButton = 'available' | 'busy' | 'break'

/**
 * Two visual modes:
 *   'simulator'  — small card, 5:3 aspect ratio, fits in a grid of N
 *                   devices on one page. Used by /devices/[shop_id].
 *   'standalone' — full viewport, optimized for a barber holding a phone
 *                   or tablet at their station. Used by /barber/[shop_id]/[id].
 */
type Variant = 'simulator' | 'standalone'

export default function BarberDeviceScreen({
  barber,
  shop,
  fifoPosition,
  heldPosition,
  calledClient,
  currentClient,
  variant = 'simulator',
}: {
  barber: BarberDeviceData
  shop: ShopDeviceConfig
  fifoPosition: number | undefined
  heldPosition: number | undefined
  calledClient: DeviceClient
  currentClient: DeviceClient
  variant?: Variant
}) {
  const [pending, setPending] = useState<StatusButton | null>(null)
  const [error, setError] = useState('')

  async function press(target: StatusButton) {
    if (pending) return
    setPending(target)
    setError('')
    try {
      const res = await fetch(`/api/barbers/${barber.id}/state`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: target }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Error')
      }
    } catch {
      setError('Error de red')
    } finally {
      setPending(null)
    }
  }

  // Highlight = current state. Universal "filled means you are here"
  // mental model — flipping this from the previous "next action" semantic
  // because it was visually confusing (a filled BUSY button looked like
  // the barber was busy when he was actually in line). The body text
  // above handles the guidance about what to tap next.
  const currentHighlight: StatusButton | null =
    barber.status === 'available'
      ? 'available'
      : barber.status === 'busy'
        ? 'busy'
        : barber.status === 'break'
          ? 'break'
          : null // offline → no button highlighted

  const isStandalone = variant === 'standalone'

  // Variant-specific Tailwind classes for the screen shell.
  const shellClasses = isStandalone
    ? 'bg-black overflow-hidden font-mono select-none flex flex-col h-[100dvh] w-full'
    : 'bg-black rounded-lg overflow-hidden font-mono select-none flex flex-col'

  const shellStyle: React.CSSProperties = isStandalone
    ? {}
    : { aspectRatio: '5 / 3' }

  const titleSize = isStandalone ? 'text-4xl' : 'text-xl'
  const nameSize = isStandalone ? 'text-base' : 'text-xs'
  const buttonPadding = isStandalone ? 'py-6 text-2xl' : 'py-3 sm:py-4 text-sm'

  return (
    <div
      className={shellClasses}
      style={shellStyle}
    >
      {/* LCD content — flex-1 + min-h-0 lets it shrink so the buttons
          below stay anchored regardless of body content size. */}
      <div
        className={`flex-1 min-h-0 overflow-hidden flex flex-col items-center justify-center text-center ${
          isStandalone ? 'px-6 pt-8 pb-3' : 'px-4 pt-3 pb-1'
        }`}
      >
        <p className={`text-white tracking-[0.25em] ${titleSize} font-black`}>
          NXTUP
        </p>
        <p
          className={`text-nxtup-muted tracking-widest mt-1 ${nameSize}`}
        >
          {barber.name}
        </p>

        <div
          className={`flex-1 min-h-0 flex flex-col items-center justify-center w-full overflow-hidden ${
            isStandalone ? 'mt-6' : 'mt-2'
          }`}
        >
          <ScreenBody
            barber={barber}
            shop={shop}
            fifoPosition={fifoPosition}
            heldPosition={heldPosition}
            calledClient={calledClient}
            currentClient={currentClient}
            isStandalone={isStandalone}
          />
        </div>
      </div>

      {/* Buttons row — flex-shrink-0 anchors them at the bottom. */}
      <div
        className={`flex-shrink-0 grid grid-cols-3 bg-black ${
          isStandalone ? 'gap-2 p-2' : 'gap-1 p-1'
        }`}
      >
        <DeviceButton
          label="ACTIVE"
          tone="active"
          highlighted={currentHighlight === 'available'}
          loading={pending === 'available'}
          onClick={() => press('available')}
          disabled={!!pending && pending !== 'available'}
          padding={buttonPadding}
        />
        <DeviceButton
          label="BUSY"
          tone="busy"
          highlighted={currentHighlight === 'busy'}
          loading={pending === 'busy'}
          onClick={() => press('busy')}
          disabled={!!pending && pending !== 'busy'}
          padding={buttonPadding}
        />
        <DeviceButton
          label="BREAK"
          tone="break"
          highlighted={currentHighlight === 'break'}
          loading={pending === 'break'}
          onClick={() => press('break')}
          disabled={!!pending && pending !== 'break'}
          padding={buttonPadding}
        />
      </div>

      {error && (
        <p
          className={`absolute bottom-20 left-0 right-0 text-center text-nxtup-busy ${
            isStandalone ? 'text-sm' : 'text-xs'
          }`}
        >
          {error}
        </p>
      )}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Body — switches on barber.status
// ──────────────────────────────────────────────────────────────

function ScreenBody({
  barber,
  shop,
  fifoPosition,
  heldPosition,
  calledClient,
  currentClient,
  isStandalone,
}: {
  barber: BarberDeviceData
  shop: ShopDeviceConfig
  fifoPosition: number | undefined
  heldPosition: number | undefined
  calledClient: DeviceClient
  currentClient: DeviceClient
  isStandalone: boolean
}) {
  // Size scales — standalone gets noticeably larger because the user is
  // looking at it from across their station.
  const labelSize = isStandalone ? 'text-2xl' : 'text-base'
  const hintSize = isStandalone ? 'text-sm' : 'text-[11px]'
  const placeholderSize = isStandalone ? 'text-8xl' : 'text-5xl'
  const positionFontSize = isStandalone
    ? 'clamp(5rem, 18vw, 10rem)'
    : 'clamp(2.25rem, 6vw, 3.5rem)'
  const clientNameFontSize = isStandalone
    ? 'clamp(2.5rem, 9vw, 5rem)'
    : 'clamp(1.25rem, 3.5vw, 2.25rem)'

  if (barber.status === 'offline') {
    return (
      <>
        <p
          className={`text-nxtup-muted tracking-widest font-bold ${labelSize}`}
        >
          OFFLINE
        </p>
        <p className={`${placeholderSize} font-black tracking-tight my-2`}>—</p>
        <p className={`text-nxtup-dim tracking-wider ${hintSize}`}>
          Toca ACTIVE para iniciar turno
        </p>
      </>
    )
  }

  if (barber.status === 'break') {
    return (
      <BreakBody
        barber={barber}
        shop={shop}
        heldPosition={heldPosition}
        isStandalone={isStandalone}
      />
    )
  }

  if (barber.status === 'busy' && currentClient) {
    return (
      <>
        <p
          className={`text-nxtup-busy tracking-widest font-bold ${labelSize}`}
        >
          CON
        </p>
        <p
          className="text-white font-black tracking-tight uppercase my-1"
          style={{ fontSize: clientNameFontSize }}
        >
          {currentClient.client_name}
        </p>
        <p className={`text-nxtup-dim tracking-wider ${hintSize}`}>
          Toca ACTIVE al terminar
        </p>
      </>
    )
  }

  if (barber.status === 'available' && calledClient) {
    return (
      <>
        <p
          className={`text-nxtup-active tracking-widest font-bold ${labelSize}`}
        >
          → LLAMADO
        </p>
        <p
          className="text-white font-black tracking-tight uppercase my-1"
          style={{ fontSize: clientNameFontSize }}
        >
          {calledClient.client_name}
        </p>
        <p className={`text-nxtup-dim tracking-wider ${hintSize}`}>
          Toca BUSY cuando se siente
        </p>
      </>
    )
  }

  if (barber.status === 'available' && fifoPosition !== undefined) {
    return (
      <>
        <p
          className={`text-nxtup-active tracking-widest font-bold ${labelSize}`}
        >
          EN FILA
        </p>
        <p
          className="text-white font-black tracking-tight my-1"
          style={{ fontSize: positionFontSize }}
        >
          #{fifoPosition}
        </p>
        <p className={`text-nxtup-dim tracking-wider ${hintSize}`}>
          {fifoPosition === 1
            ? 'Eres el siguiente'
            : `${fifoPosition - 1} delante`}
        </p>
      </>
    )
  }

  // Active but no FIFO + no called (transient — just got matched/cleared)
  return (
    <>
      <p
        className={`text-nxtup-muted tracking-widest font-bold ${labelSize}`}
      >
        ACTIVE
      </p>
      <p className={`${placeholderSize} font-black tracking-tight my-2`}>—</p>
      <p className={`text-nxtup-dim tracking-wider ${hintSize}`}>
        Sin posición
      </p>
    </>
  )
}

function BreakBody({
  barber,
  shop,
  heldPosition,
  isStandalone,
}: {
  barber: BarberDeviceData
  shop: ShopDeviceConfig
  heldPosition: number | undefined
  isStandalone: boolean
}) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const labelSize = isStandalone ? 'text-2xl' : 'text-base'
  const hintSize = isStandalone ? 'text-sm' : 'text-[11px]'
  const timerFontSize = isStandalone
    ? 'clamp(4rem, 14vw, 8rem)'
    : 'clamp(1.75rem, 5vw, 2.75rem)'

  if (!barber.break_started_at) {
    return (
      <p
        className={`text-nxtup-break font-black ${
          isStandalone ? 'text-7xl' : 'text-2xl'
        }`}
      >
        BREAK
      </p>
    )
  }

  const startedMs = new Date(barber.break_started_at).getTime()
  const elapsedSec = Math.max(0, Math.floor((now - startedMs) / 1000))

  const breakMin =
    barber.break_minutes_at_start ??
    ((barber.breaks_taken_today ?? 1) <= 1
      ? shop.first_break_minutes
      : shop.next_break_minutes)
  const totalSec = breakMin * 60
  const remainingSec = totalSec - elapsedSec

  const graceSec = (shop.break_position_grace_minutes ?? 5) * 60
  const allowedSec = totalSec + graceSec
  const overGrace = elapsedSec > allowedSec

  const mm = Math.floor(Math.abs(remainingSec) / 60)
  const ss = Math.abs(remainingSec) % 60
  const formatted = `${remainingSec < 0 ? '+' : ''}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`

  // Mirror the same three-state logic as the web BarberDashboard:
  //   - forfeited (mode='not_guaranteed' + below-barber completed)
  //   - within time + has held position → show "VUELVE A #N"
  //   - past grace OR no held position → fall through
  // We no longer gate on `keep_position_on_break` because the new
  // break_mode column is the source of truth; on old shops without
  // break_mode it defaults to 'guaranteed' which behaves identically
  // to the legacy "kop=true" path.
  const forfeited =
    shop.break_mode === 'not_guaranteed' && barber.break_invalidated === true
  const showHeld = heldPosition !== undefined && !overGrace && !forfeited

  return (
    <>
      <p
        className={`text-nxtup-break tracking-widest font-bold ${labelSize}`}
      >
        BREAK
      </p>
      <p
        className="text-white font-black tracking-tight tabular-nums my-1"
        style={{ fontSize: timerFontSize }}
      >
        {formatted}
      </p>
      {showHeld ? (
        <p
          className={`text-nxtup-active tracking-wider font-bold ${hintSize}`}
        >
          VUELVE A #{heldPosition}
        </p>
      ) : forfeited ? (
        <p
          className={`text-nxtup-busy tracking-wider font-bold ${hintSize}`}
        >
          POSICIÓN PERDIDA
        </p>
      ) : overGrace ? (
        <p
          className={`text-nxtup-busy tracking-wider font-bold ${hintSize}`}
        >
          POSICIÓN PERDIDA
        </p>
      ) : (
        <p className={`text-nxtup-dim tracking-wider ${hintSize}`}>
          Toca ACTIVE al volver
        </p>
      )}
    </>
  )
}

function DeviceButton({
  label,
  tone,
  highlighted,
  loading,
  onClick,
  disabled,
  padding,
}: {
  label: string
  tone: 'active' | 'busy' | 'break'
  highlighted: boolean
  loading: boolean
  onClick: () => void
  disabled: boolean
  padding: string
}) {
  const palette: Record<
    typeof tone,
    { bg: string; border: string; text: string }
  > = {
    active: {
      bg: 'bg-emerald-500',
      border: 'border-emerald-400',
      text: 'text-emerald-300',
    },
    busy: {
      bg: 'bg-rose-500',
      border: 'border-rose-400',
      text: 'text-rose-300',
    },
    break: {
      bg: 'bg-amber-500',
      border: 'border-amber-400',
      text: 'text-amber-300',
    },
  }
  const p = palette[tone]

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`
        flex items-center justify-center
        rounded-md font-black tracking-widest
        transition-all duration-100
        active:scale-[0.97]
        ${padding}
        ${
          highlighted
            ? `${p.bg} text-black border-2 ${p.border} shadow-[inset_0_-3px_0_rgba(0,0,0,0.2)]`
            : `bg-black border-2 ${p.border} ${p.text} hover:bg-zinc-950`
        }
        ${loading ? 'opacity-60' : ''}
        disabled:opacity-40 disabled:cursor-not-allowed
      `}
    >
      {loading ? '...' : label}
    </button>
  )
}
