'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
}

const NAV: NavItem[] = [
  {
    href: '/admin',
    label: 'Home',
    icon: (
      <path
        d="M3 11l9-7 9 7M5 10v10h14V10"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
  {
    href: '/admin/shops',
    label: 'Shops',
    icon: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 9h18l-1-5H4L3 9z" />
        <path d="M5 9v11h14V9" />
        <path d="M10 20v-6h4v6" />
      </g>
    ),
  },
  {
    href: '/admin/panel-tokens',
    label: 'Panel Tokens',
    icon: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M10 14a4 4 0 1 0-4-4" />
        <path d="M10 10h11M18 7v6M15 10v3" />
      </g>
    ),
  },
]

export default function AdminSidebar({ adminEmail }: { adminEmail: string }) {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-nxtup-line/40 border-r border-nxtup-line flex-col">
      <div className="px-5 py-6 border-b border-nxtup-line">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
          NXTUP
        </p>
        <p className="text-white text-base font-black tracking-tight">Admin</p>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map(item => {
          const active =
            item.href === '/admin'
              ? pathname === '/admin'
              : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-colors ${
                active
                  ? 'bg-white text-black'
                  : 'text-nxtup-muted hover:text-white hover:bg-nxtup-line/60'
              }`}
            >
              <svg viewBox="0 0 24 24" width={18} height={18}>
                {item.icon}
              </svg>
              {item.label}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-nxtup-line">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-1">
          Sesión
        </p>
        <p className="text-white text-xs font-medium truncate" title={adminEmail}>
          {adminEmail}
        </p>
        <Link
          href="/dashboard"
          className="block mt-3 text-nxtup-muted hover:text-white text-[11px] uppercase tracking-widest"
        >
          ← Salir de admin
        </Link>
      </div>
    </aside>
  )
}
