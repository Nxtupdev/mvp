'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'Live' },
  { href: '/dashboard/stats', label: 'Stats' },
  { href: '/dashboard/barbers', label: 'Barbers' },
  { href: '/dashboard/activity', label: 'Activity' },
  { href: '/dashboard/settings', label: 'Settings' },
]

export default function DashboardNav() {
  const pathname = usePathname()

  return (
    // The Install CTA used to live here but didn't fit on iPhone — it
    // now lives in the dashboard layout banner above this nav so it's
    // always reachable. See <InstallButton variant="banner" /> in
    // dashboard/layout.tsx.
    <nav className="flex items-center gap-1 text-sm">
      {TABS.map(t => {
        const active =
          t.href === '/dashboard' ? pathname === t.href : pathname.startsWith(t.href)
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              active ? 'text-white bg-nxtup-line' : 'text-nxtup-muted hover:text-white'
            }`}
          >
            {t.label}
          </Link>
        )
      })}
      <form action="/auth/signout" method="POST" className="ml-2">
        <button
          type="submit"
          className="px-3 py-1.5 rounded-md text-nxtup-muted hover:text-white transition-colors"
        >
          Sign out
        </button>
      </form>
    </nav>
  )
}
