'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/i18n'
import LanguageToggle from '@/components/LanguageToggle'

type NavItem = {
  href: string
  labelKey: string
  icon: React.ReactNode
  /** Si true, el item es solo para admin (no se renderiza a socios). */
  adminOnly?: boolean
}

const NAV: NavItem[] = [
  {
    href: '/admin',
    labelKey: 'admin.nav.home',
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
    labelKey: 'admin.nav.shops',
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
    labelKey: 'admin.nav.stats',
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
    labelKey: 'admin.nav.revenue',
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
    labelKey: 'admin.nav.team',
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
    labelKey: 'admin.nav.activity',
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
    labelKey: 'admin.nav.panelTokens',
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
  displayName,
  isAdmin,
  roleLabel,
  titleLabel,
}: {
  /** Nombre humano para el saludo. Si está vacío, no se renderiza. */
  displayName: string
  isAdmin: boolean
  /** Rol social. Hoy ambos roles son "Cofounder". */
  roleLabel: string
  /** Cargo opcional (CEO, CTO, COO, etc.) — viene de user_metadata.title.
   *  Si está vacío, no se renderiza el segundo subtítulo. */
  titleLabel: string
}) {
  const pathname = usePathname()
  const { t } = useLocale()
  const visibleNav = NAV.filter(item => isAdmin || !item.adminOnly)
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Cerrar el drawer cuando la ruta cambia. Sin esto, al tocar un nav
  // item desde el drawer, navegamos pero el drawer queda abierto y
  // tapando el contenido nuevo. Side effect del cambio de pathname.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])

  // Body scroll lock cuando el drawer está abierto — evita que el
  // contenido de atrás scrollee accidentalmente al hacer drag sobre
  // el drawer. Solo en móvil; en desktop el drawer no existe.
  useEffect(() => {
    if (!drawerOpen) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [drawerOpen])

  const topTitle = isAdmin ? t('admin.title.admin') : t('admin.title.panel')

  return (
    <>
      {/* ───────── Top bar móvil ─────────
          Solo visible en móvil (lg:hidden). Sticky para que se quede
          arriba al scrollear el contenido. El botón hamburguesa abre
          el drawer que tiene el mismo contenido del sidebar desktop. */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-nxtup-bg/95 backdrop-blur-md border-b border-nxtup-line">
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          aria-label={t('admin.openMenu')}
          aria-expanded={drawerOpen}
          className="flex items-center justify-center w-10 h-10 -ml-2 rounded-lg text-white hover:bg-nxtup-line/60 transition-colors"
        >
          <svg viewBox="0 0 24 24" width={22} height={22}>
            <path
              d="M4 6h16M4 12h16M4 18h16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <p className="text-white text-sm font-black tracking-tight">{topTitle}</p>
        {/* LanguageToggle a la derecha de la topbar móvil — sustituye
            el spacer vacío que había antes. */}
        <LanguageToggle variant="header" />
      </header>

      {/* ───────── Drawer móvil (overlay + panel) ─────────
          Renderizado condicional cuando drawerOpen=true. Backdrop
          oscuro detrás, panel desde el lado izquierdo con el mismo
          contenido del sidebar desktop. */}
      {drawerOpen && (
        <>
          <div
            className="lg:hidden fixed inset-0 bg-black/70 backdrop-blur-sm z-40 animate-fade-in"
            onClick={() => setDrawerOpen(false)}
            aria-hidden
          />
          <aside
            className="lg:hidden fixed left-0 top-0 bottom-0 w-72 bg-nxtup-bg border-r border-nxtup-line z-50 flex flex-col animate-slide-in"
            role="dialog"
            aria-label={t('admin.menuNav')}
          >
            <SidebarContent
              visibleNav={visibleNav}
              pathname={pathname}
              isAdmin={isAdmin}
              displayName={displayName}
              roleLabel={roleLabel}
              titleLabel={titleLabel}
              t={t}
              onNavClick={() => setDrawerOpen(false)}
              showCloseButton
              onClose={() => setDrawerOpen(false)}
            />
          </aside>
        </>
      )}

      {/* ───────── Sidebar desktop ─────────
          Solo visible en lg+ (hidden lg:flex). Fixed al lado izquierdo,
          siempre presente. Mismo contenido que el drawer móvil. */}
      <aside className="hidden lg:flex fixed left-0 top-0 bottom-0 w-64 bg-nxtup-line/40 border-r border-nxtup-line flex-col">
        <SidebarContent
          visibleNav={visibleNav}
          pathname={pathname}
          isAdmin={isAdmin}
          displayName={displayName}
          roleLabel={roleLabel}
          titleLabel={titleLabel}
          t={t}
        />
      </aside>
    </>
  )
}

// ─────────────────────────────────────────────────────────────
// SidebarContent — el render compartido entre el drawer móvil y el
// sidebar desktop. Reusa la misma estructura visual + nav + bloque
// de "Bienvenido / Salir" para que la UX sea idéntica en ambos
// breakpoints (solo cambia el contenedor que lo envuelve).
// ─────────────────────────────────────────────────────────────

function SidebarContent({
  visibleNav,
  pathname,
  isAdmin,
  displayName,
  roleLabel,
  titleLabel,
  t,
  onNavClick,
  showCloseButton = false,
  onClose,
}: {
  visibleNav: NavItem[]
  pathname: string
  isAdmin: boolean
  displayName: string
  roleLabel: string
  titleLabel: string
  t: (key: string) => string
  /** Callback al tocar un item del nav. Lo usa el drawer móvil para
   *  cerrarse después de navegar. En desktop se deja undefined. */
  onNavClick?: () => void
  /** Si true, muestra una X en la esquina superior derecha. Solo se
   *  usa en el drawer móvil. */
  showCloseButton?: boolean
  onClose?: () => void
}) {
  const topTitle = isAdmin ? t('admin.title.admin') : t('admin.title.panel')
  return (
    <>
      <div className="px-5 py-6 border-b border-nxtup-line flex items-start justify-between">
        <div>
          <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
            NXTUP
          </p>
          <p className="text-white text-base font-black tracking-tight">
            {topTitle}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {/* LanguageToggle convive con el botón de cerrar en el
              drawer móvil, y queda solo en el sidebar desktop. */}
          <LanguageToggle variant="sidebar" onChange={onNavClick} />
          {showCloseButton && onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={t('admin.closeMenu')}
              className="-mr-1 -mt-1 flex items-center justify-center w-9 h-9 rounded-lg text-nxtup-muted hover:text-white hover:bg-nxtup-line/60 transition-colors"
            >
              <svg viewBox="0 0 24 24" width={20} height={20}>
                <path
                  d="M6 6l12 12M18 6L6 18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>
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
              onClick={onNavClick}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-bold tracking-wide transition-colors ${
                active
                  ? 'bg-white text-black'
                  : 'text-nxtup-muted hover:text-white hover:bg-nxtup-line/60'
              }`}
            >
              <svg viewBox="0 0 24 24" width={18} height={18}>
                {item.icon}
              </svg>
              {t(item.labelKey)}
            </Link>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-nxtup-line">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-1">
          {t('admin.welcome')}
        </p>
        {displayName && (
          <p
            className="text-white text-lg font-bold tracking-tight truncate leading-tight"
            title={displayName}
          >
            {displayName}
          </p>
        )}
        {roleLabel && (
          <p className="text-nxtup-active text-[10px] uppercase tracking-[0.2em] font-bold mt-2">
            {roleLabel}
          </p>
        )}
        {titleLabel && (
          <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.2em] font-bold mt-0.5">
            {titleLabel}
          </p>
        )}
        <form action="/auth/signout" method="POST" className="mt-3">
          <button
            type="submit"
            className="text-nxtup-muted hover:text-white text-[11px] uppercase tracking-widest cursor-pointer transition-colors"
          >
            ← {t('admin.exit')}
          </button>
        </form>
      </div>
    </>
  )
}
