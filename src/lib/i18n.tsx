'use client'

import { createContext, useCallback, useContext, useState } from 'react'
import { DEFAULT_LOCALE, interpolate, type Locale } from './i18n-types'
import { MESSAGES } from './i18n-messages'

// ============================================================
// Lightweight bilingual support para componentes client. El catálogo
// de strings vive en lib/i18n-messages.ts (server-safe) — este file
// solo expone el Context + el hook para componentes con 'use client'.
// Server components leen el catálogo via lib/i18n-server.ts.
//
// Server-safe utilities (Locale type, DEFAULT_LOCALE, isLocale) viven
// en ./i18n-types así el root layout las puede importar sin cruzar el
// 'use client' boundary.
// ============================================================

// ──────────────────────────────────────────────────────────────
// Context + provider
// ──────────────────────────────────────────────────────────────

type Ctx = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: (key: string, vars?: Record<string, string | number>) => string
}

const LocaleContext = createContext<Ctx | null>(null)

const COOKIE_NAME = 'nxtup_locale'
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60 // 1 year

export function LocaleProvider({
  initial,
  children,
}: {
  initial: Locale
  children: React.ReactNode
}) {
  const [locale, setLocaleState] = useState<Locale>(initial)

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next)
    if (typeof document !== 'undefined') {
      document.cookie = `${COOKIE_NAME}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`
    }
  }, [])

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const dict = MESSAGES[locale]
      // Missing key → return the key itself so it surfaces visually.
      return interpolate(dict[key] ?? key, vars)
    },
    [locale],
  )

  return (
    <LocaleContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LocaleContext.Provider>
  )
}

export function useLocale() {
  const ctx = useContext(LocaleContext)
  if (!ctx) {
    // Allow components to import this without wrapping during isolated
    // tests or non-app contexts. Returns the default and a no-op setter.
    return {
      locale: DEFAULT_LOCALE,
      setLocale: () => {},
      t: (key: string, vars?: Record<string, string | number>) =>
        interpolate(MESSAGES[DEFAULT_LOCALE][key] ?? key, vars),
    }
  }
  return ctx
}

// Re-export the server-safe utilities so existing imports keep working.
export { DEFAULT_LOCALE, interpolate, isLocale, type Locale } from './i18n-types'
