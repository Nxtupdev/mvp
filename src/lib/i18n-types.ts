// Server-safe utilities for the i18n layer. Kept separate from the
// React Context / hook implementation in i18n.tsx so the root layout
// (a Server Component) can import these without crossing into a
// 'use client' boundary — which Next.js 16 was choking on with a
// "server components render" error.

export type Locale = 'es' | 'en'
export const DEFAULT_LOCALE: Locale = 'es'

export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en'
}
