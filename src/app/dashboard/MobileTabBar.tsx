'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ============================================================
// MobileTabBar — fixed bottom navigation, iOS/Android-style.
//
// Only renders on screens <md so it doesn't compete with the
// horizontal nav on desktop. Five tabs is the conventional ceiling
// for a bottom bar — past that, taps get sloppy because tap targets
// shrink below ~44px on narrow phones.
//
// Icon-first, label-second. The active tab uses the brand green to
// match the rest of the dashboard's status semantics (active = green).
//
// Important: the parent layout adds bottom padding to the content
// area so the last bit of UI isn't trapped behind this bar.
// ============================================================

const TABS = [
  { href: '/dashboard', label: 'Live', Icon: LiveIcon },
  { href: '/dashboard/stats', label: 'Stats', Icon: StatsIcon },
  { href: '/dashboard/barbers', label: 'Barbers', Icon: BarbersIcon },
  { href: '/dashboard/activity', label: 'Activity', Icon: ActivityIcon },
  { href: '/dashboard/settings', label: 'Settings', Icon: SettingsIcon },
] as const

export default function MobileTabBar() {
  const pathname = usePathname()

  return (
    <nav
      aria-label="Dashboard navigation"
      // The pb-safe + safe-area inset on iOS leaves room for the
      // home-indicator bar at the bottom of modern iPhones so the
      // last row of pixels isn't hidden under it.
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-nxtup-bg/95 backdrop-blur-md border-t border-nxtup-line pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid grid-cols-5">
        {TABS.map(({ href, label, Icon }) => {
          const active =
            href === '/dashboard' ? pathname === href : pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[10px] font-semibold tracking-wide transition-colors ${
                  active
                    ? 'text-nxtup-active'
                    : 'text-nxtup-muted hover:text-white'
                }`}
              >
                <Icon active={active} />
                <span className="truncate w-full text-center">{label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ──────────────────────────────────────────────────────────────
// Icons — inline so the component is self-contained. All stroke,
// 22px viewbox, current colour. The `active` prop lets each icon
// flip fill on/off if it wants to visually emphasise the active tab.
// ──────────────────────────────────────────────────────────────

type IconProps = { active?: boolean }
const ICON_SIZE = 22

function svgProps(active?: boolean) {
  return {
    width: ICON_SIZE,
    height: ICON_SIZE,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2.3 : 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

// Pulse / heartbeat — the live queue is "the heartbeat of the shop."
function LiveIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <path d="M3 12h4l3-8 4 16 3-8h4" />
    </svg>
  )
}

// Three vertical bars of climbing height.
function StatsIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <line x1="6" y1="20" x2="6" y2="14" />
      <line x1="12" y1="20" x2="12" y2="9" />
      <line x1="18" y1="20" x2="18" y2="4" />
      <line x1="3" y1="20" x2="21" y2="20" />
    </svg>
  )
}

// Scissors — barber-specific instead of generic "people" so the
// tab reads as unambiguously barber-related at a glance.
function BarbersIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <line x1="20" y1="4" x2="8.12" y2="15.88" />
      <line x1="14.47" y1="14.48" x2="20" y2="20" />
      <line x1="8.12" y1="8.12" x2="12" y2="12" />
    </svg>
  )
}

// Stacked horizontal lines — log entries.
function ActivityIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Gear — universal "settings."
function SettingsIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}
