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

/**
 * Sustituye placeholders {var} en un template i18n con sus valores.
 * Si no se pasan vars, devuelve el template tal cual — así t(key) sin
 * argumentos sigue comportándose exactamente igual que antes. Mismo
 * formato ({name}, {count}, {n}...) y misma semántica que el helper
 * local que usaba el kiosk. Una key ausente se reemplaza por '' para
 * no ensuciar la UI con placeholders sin resolver.
 */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}
