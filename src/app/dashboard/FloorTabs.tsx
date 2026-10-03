'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useLocale } from '@/lib/i18n'

/**
 * Selector Live | Stats | Clientes arriba del dashboard (port del
 * FloorTabs del dealer — primera pieza del menú consolidado, pedido
 * de Francisco oct-2026).
 *
 * Las tres pantallas son caras de lo mismo — los números del shop
 * (ahora, este período, quién entró) — así que en el menú ocupan un
 * solo lugar y aquí se cambia entre ellas. Las URLs no cambian
 * (/dashboard, /dashboard/stats, /dashboard/history): enlaces
 * guardados, el PDF y el rango de fechas siguen funcionando.
 */
const SEGMENTS = [
  { href: '/dashboard', key: 'dash.floor.live' },
  { href: '/dashboard/stats', key: 'dash.floor.stats' },
  { href: '/dashboard/history', key: 'dash.floor.clients' },
] as const

export default function FloorTabs({ className = 'mb-8' }: { className?: string }) {
  const pathname = usePathname()
  const { t } = useLocale()
  return (
    <div className={`print:hidden inline-flex rounded-xl bg-white/[0.04] ring-1 ring-white/[0.08] p-1 ${className}`}>
      {SEGMENTS.map(s => {
        const active = s.href === '/dashboard' ? pathname === s.href : pathname.startsWith(s.href)
        return (
          <Link
            key={s.href}
            href={s.href}
            aria-current={active ? 'page' : undefined}
            className={`px-5 py-2 rounded-lg text-sm font-semibold tracking-wide transition-colors ${
              active ? 'bg-nxtup-line text-white' : 'text-nxtup-muted hover:text-white'
            }`}
          >
            {t(s.key)}
          </Link>
        )
      })}
    </div>
  )
}
