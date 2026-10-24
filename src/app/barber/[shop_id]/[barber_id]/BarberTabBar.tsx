'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// ============================================================
// BarberTabBar — barra inferior de la PWA del barbero, gemela de la
// MobileTabBar del dueño (mismo estilo, íconos y safe-area).
//
// Reemplaza los links subrayados del pie del panel (23-oct, pedido de
// Francisco: "la PWA de los barberos no se ve como una app"). Todas las
// pestañas viven DENTRO del scope del manifest (/barber/<shop>/<id>):
// una ruta fuera del scope (ej. /ayuda/barbero) se abre en la app
// instalada con la barra del navegador encima y rompe la ilusión.
//
// El panel siempre es una sola columna de teléfono (max-w-md), así que
// la barra se muestra en todos los tamaños, centrada a ese ancho.
// ============================================================

export default function BarberTabBar({
  shopId,
  barberId,
  ticketsEnabled,
}: {
  shopId: string
  barberId: string
  ticketsEnabled: boolean
}) {
  const pathname = usePathname()
  const base = `/barber/${shopId}/${barberId}`

  const tabs = [
    { href: base, label: 'Mi panel', Icon: PanelIcon, exact: true },
    ...(ticketsEnabled
      ? [{ href: `${base}/cuenta`, label: 'Mi cuenta', Icon: WalletIcon, exact: false }]
      : []),
    { href: `${base}/ayuda`, label: 'Ayuda', Icon: PlayIcon, exact: false },
  ]

  return (
    <nav
      aria-label="Navegación del barbero"
      className="fixed bottom-0 inset-x-0 z-40 bg-nxtup-bg/95 backdrop-blur-md border-t border-nxtup-line pb-[env(safe-area-inset-bottom)]"
    >
      {/* grid-cols estático (Tailwind no acepta clases dinámicas). */}
      <ul className={`max-w-md mx-auto grid ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {tabs.map(({ href, label, Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex flex-col items-center justify-center gap-1 py-2.5 px-1 text-[10px] font-semibold tracking-wide transition-colors ${
                  active ? 'text-nxtup-active' : 'text-nxtup-muted hover:text-white'
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

type IconProps = { active?: boolean }

function svgProps(active?: boolean) {
  return {
    width: 22,
    height: 22,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: active ? 2.3 : 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  }
}

// Tijeras — el panel ES el piso del barbero.
function PanelIcon({ active }: IconProps) {
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

// Cartera — su dinero.
function WalletIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <path d="M20 7H5a2 2 0 0 1 0-4h13v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h15V7" />
      <circle cx="16" cy="14" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  )
}

// Play — los videos de ayuda.
function PlayIcon({ active }: IconProps) {
  return (
    <svg {...svgProps(active)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5-6-3.5z" fill={active ? 'currentColor' : 'none'} />
    </svg>
  )
}
