'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from '@/lib/i18n'
import LanguageToggle from '@/components/LanguageToggle'

export default function DashboardNav() {
  const pathname = usePathname()
  const { t } = useLocale()

  const tabs: { href: string; label: string }[] = [
    { href: '/dashboard', label: t('dash.nav.live') },
    { href: '/dashboard/stats', label: t('dash.nav.stats') },
    { href: '/dashboard/barbers', label: t('dash.nav.barbers') },
    { href: '/dashboard/activity', label: t('dash.nav.activity') },
    { href: '/dashboard/settings', label: t('dash.nav.settings') },
  ]

  return (
    // On mobile (<md) the tabs themselves are hidden — navigation
    // lives in the fixed bottom <MobileTabBar />. Sign out + el
    // LanguageToggle se quedan visibles en el header en todos los
    // viewports para que estén siempre a un tap.
    <nav className="flex items-center gap-1 text-sm">
      <div className="hidden md:flex items-center gap-1">
        {tabs.map(tab => {
          const active =
            tab.href === '/dashboard'
              ? pathname === tab.href
              : pathname.startsWith(tab.href)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-3 py-1.5 rounded-md transition-colors ${
                active
                  ? 'text-white bg-nxtup-line'
                  : 'text-nxtup-muted hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      <LanguageToggle variant="header" />
      <form action="/auth/signout" method="POST" className="md:ml-2">
        <button
          type="submit"
          className="px-3 py-1.5 rounded-md text-nxtup-muted hover:text-white transition-colors text-xs sm:text-sm"
        >
          {t('dash.nav.signout')}
        </button>
      </form>
    </nav>
  )
}
