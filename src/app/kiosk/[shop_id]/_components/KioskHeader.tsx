'use client'

/**
 * KioskHeader — persistent header for the check-in kiosk flow.
 *
 * Sits above every screen. Subtle bg-elevated/60 + backdrop-blur, with
 * a hairline border-bottom. Left: shop logo + name. Right: live queue
 * stats (people waiting + ETA range).
 *
 * Layout: h-16 (64px) on tablet, content stays comfortably away from
 * the edges (px-8). Renders nothing on first screen when shop info is
 * still loading — falls back gracefully.
 *
 * No animation on stat updates — queue numbers change often and a
 * flashing transform would be more distracting than informative.
 *
 * @future Realtime subscription to queue_entries via supabase client.
 * For now the parent passes the counts down as props.
 */

import { useLocale } from '@/lib/i18n'

type KioskHeaderProps = {
  shopName: string
  shopLogoUrl: string | null
  waitingCount: number
  /** Estimated wait range in minutes. Null/undefined when queue is empty. */
  eta?: { min: number; max: number } | null
}

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

export function KioskHeader({
  shopName,
  shopLogoUrl,
  waitingCount,
  eta,
}: KioskHeaderProps) {
  const { t } = useLocale()

  const statsText =
    waitingCount === 0
      ? t('kiosk.header.waiting.zero')
      : interpolate(
          waitingCount === 1
            ? t('kiosk.header.waiting.one')
            : t('kiosk.header.waiting.many'),
          {
            count: waitingCount,
            min: eta?.min ?? 0,
            max: eta?.max ?? 0,
          },
        )

  return (
    <header
      className="
        sticky top-0 z-30 flex h-16 items-center justify-between
        border-b border-white/[0.08] bg-zinc-900/60 px-8
        backdrop-blur-xl
      "
    >
      {/* Left: logo + shop name */}
      <div className="flex items-center gap-3">
        {shopLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shopLogoUrl}
            alt={`${shopName} logo`}
            className="h-8 w-auto object-contain"
          />
        ) : (
          <span
            aria-hidden
            className="
              flex h-8 w-8 items-center justify-center rounded-lg
              bg-white/[0.06] text-sm font-semibold text-zinc-50
              ring-1 ring-white/[0.1]
            "
          >
            {shopName.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-sm font-semibold tracking-tight text-zinc-100">
          {shopName}
        </span>
      </div>

      {/* Right: live queue stats */}
      <div
        aria-live="polite"
        className="text-xs font-medium uppercase tracking-[0.05em] text-zinc-400 sm:text-sm"
      >
        {statsText}
      </div>
    </header>
  )
}
