'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

type NavItem = {
  href: string
  label: string
  icon: React.ReactNode
  /** Si true, el item es solo para admin (no se renderiza a socios). */
  adminOnly?: boolean
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
    href: '/admin/stats',
    label: 'Estadísticas',
    icon: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 20V10M10 20V4M16 20v-8M22 20H2" />
      </g>
    ),
  },
  {
    href: '/admin/revenue',
    label: 'Ingresos',
    icon: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 2v20" />
        <path d="M17 6c-1-1.5-3-2.5-5-2.5-3 0-5 1.5-5 4s2.5 3.5 5 4 5 1.5 5 4-2 4-5 4c-2 0-4-1-5-2.5" />
      </g>
    ),
  },
  {
    href: '/admin/team',
    label: 'Equipo',
    icon: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <circle cx="9" cy="8" r="3.5" />
        <path d="M2.5 20c.5-3.5 3.5-5.5 6.5-5.5s5.5 1.5 6.5 4" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15 14c2 0 5 1 6 4" />
      </g>
    ),
  },
  {
    href: '/admin/activity',
    label: 'Actividad',
    icon: (
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 12h4l2-6 4 12 2-6h6" />
      </g>
    ),
  },
  {
    href: '/admin/panel-tokens',
    label: 'Panel Tokens',
    adminOnly: true,
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

export default function AdminSidebar({
  adminEmail,
  displayName,
  isAdmin,
  roleLabel,
}: {
  adminEmail: string
  /** Nombre humano para el saludo. Si está vacío, no se muestra el bloque
   *  de Bienvenida (cae al email y rol solamente). */
  displayName: string
  isAdmin: boolean
  roleLabel: string
}) {
  const pathname = usePathname()
  const visibleNav = NAV.filter(item => isAdmin || !item.adminOnly)

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-nxtup-line/40 border-r border-nxtup-line flex-col">
      <div className="px-5 py-6 border-b border-nxtup-line">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
          NXTUP
        </p>
        <p className="text-white text-base font-black tracking-tight">
          {isAdmin ? 'Admin' : 'Panel'}
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {visibleNav.map(item => {
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
          Bienvenido
        </p>
        {displayName && (
          <p
            className="text-white text-sm font-bold tracking-tight truncate"
            title={displayName}
          >
            {displayName}
          </p>
        )}
        <p
          className="text-nxtup-muted text-[11px] font-medium truncate mt-0.5"
          title={adminEmail}
        >
          {adminEmail}
        </p>
        {roleLabel && (
          <p className="text-nxtup-active text-[10px] uppercase tracking-[0.2em] font-bold mt-1.5">
            {roleLabel}
          </p>
        )}
        <Link
          href="/dashboard"
          className="block mt-3 text-nxtup-muted hover:text-white text-[11px] uppercase tracking-widest"
        >
          ← Salir
        </Link>
      </div>
    </aside>
  )
}
