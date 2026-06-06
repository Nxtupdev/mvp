'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { href: '/dashboard', label: 'En vivo' },
  { href: '/dashboard/stats', label: 'Estadísticas' },
  { href: '/dashboard/barbers', label: 'Barberos' },
  { href: '/dashboard/activity', label: 'Actividad' },
  { href: '/dashboard/settings', label: 'Configuración' },
]

export default function DashboardNav() {
  const pathname = usePathname()

  return (
    // On mobile (<md) the tabs themselves are hidden — navigation
    // lives in the fixed bottom <MobileTabBar />. Sign out stays
    // visible in the header on every viewport so it's always one tap
    // away without forcing the user into a hidden menu.
    <nav className="flex items-center gap-1 text-sm">
      <div className="hidden md:flex items-center gap-1">
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
      </div>
      <form action="/auth/signout" method="POST" className="md:ml-2">
        <button
          type="submit"
          className="px-3 py-1.5 rounded-md text-nxtup-muted hover:text-white transition-colors text-xs sm:text-sm"
        >
          Cerrar sesión
        </button>
      </form>
    </nav>
  )
}
