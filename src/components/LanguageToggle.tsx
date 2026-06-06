'use client'

/**
 * LanguageToggle — switch ES/EN para dashboard del dueño + admin.
 *
 * Solo dos idiomas → un botón que alterna entre ambos. Muestra el
 * idioma OPUESTO al actual ("EN" cuando estás en español, "ES"
 * cuando estás en inglés) — convención del kiosk y de UIs comunes.
 *
 * Persiste la elección en una cookie via useLocale().setLocale().
 * Vuelve a renderizar todos los componentes que consumen el Context,
 * y al siguiente SSR el server lee la misma cookie → no hay flash de
 * idioma equivocado.
 *
 * Visual: pill discreto que no compite con la nav. Tamaño chico para
 * que viva cómodo en la barra superior del header.
 *
 * Cuando cambias de idioma necesitas un router.refresh() para que los
 * server components que leyeron `getServerLocale()` se re-rendericen
 * con el nuevo idioma — si no, los headings de server pages siguen
 * mostrando el idioma anterior hasta que el usuario navega.
 */

import { useRouter } from 'next/navigation'
import { useLocale } from '@/lib/i18n'

type Props = {
  /** Estilo opcional: 'header' (default, pill chico) o 'sidebar'
   *  (más alto para que coincida con items del sidebar de admin). */
  variant?: 'header' | 'sidebar'
  /** Callback opcional — útil cuando el toggle vive dentro de un
   *  drawer móvil que debe cerrarse al cambiar idioma. */
  onChange?: () => void
}

export default function LanguageToggle({ variant = 'header', onChange }: Props) {
  const { locale, setLocale } = useLocale()
  const router = useRouter()

  const next = locale === 'es' ? 'en' : 'es'
  // Mostramos el LABEL del idioma al que cambiarías (no el actual).
  // Es la convención del kiosk y se siente más obvio: "click acá para
  // pasarte a EN" vs "estás en ES".
  const label = locale === 'es' ? 'EN' : 'ES'
  const aria = locale === 'es' ? 'Switch to English' : 'Cambiar a español'

  function handleClick() {
    setLocale(next)
    // Refresh para que los server components (page headings con
    // getServerI18n) se re-rendericen con el nuevo locale. Sin esto,
    // los strings server-side quedan con el idioma viejo hasta que el
    // usuario navega manualmente.
    router.refresh()
    onChange?.()
  }

  const base =
    'inline-flex items-center justify-center rounded-md font-bold tracking-widest uppercase transition-colors cursor-pointer'

  const sizing =
    variant === 'sidebar'
      ? 'px-3 py-2 text-xs gap-1.5'
      : 'px-2.5 py-1.5 text-[11px] gap-1'

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={aria}
      title={aria}
      className={`${base} ${sizing} text-nxtup-muted hover:text-white hover:bg-nxtup-line/60`}
    >
      <GlobeGlyph />
      <span>{label}</span>
    </button>
  )
}

// Tiny inline globe glyph — mismo viewbox que los icons del admin
// sidebar para que se vea coherente.
function GlobeGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a13 13 0 0 1 0 18M12 3a13 13 0 0 0 0 18" />
    </svg>
  )
}
