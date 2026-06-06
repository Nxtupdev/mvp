// ============================================================
// i18n helpers para Server Components.
//
// Los componentes 'use client' usan useLocale() del Context (ver
// lib/i18n.tsx). Server components leen el cookie directamente y
// usan estas funciones para resolver traducciones SSR.
//
// Cookie name y default coinciden con LocaleProvider para que el
// estado SSR matchee el initial del cliente — sin flash de idioma
// equivocado al hidratar.
// ============================================================

import { cookies } from 'next/headers'
import { DEFAULT_LOCALE, isLocale, type Locale } from './i18n-types'
import { MESSAGES } from './i18n-messages'

const COOKIE_NAME = 'nxtup_locale'

/**
 * Lee la cookie de locale del request actual. Si no existe o tiene
 * un valor inválido, devuelve DEFAULT_LOCALE ('es'). Wrap en try/catch
 * por si el runtime de edge tiene quirks con cookies().
 */
export async function getServerLocale(): Promise<Locale> {
  try {
    const c = await cookies()
    const cookieValue = c.get(COOKIE_NAME)?.value
    if (isLocale(cookieValue)) return cookieValue
  } catch {
    // ignore — fallback below
  }
  return DEFAULT_LOCALE
}

/**
 * Crea un helper t(key) bindeado a un locale concreto. Útil cuando un
 * server component ya leyó el locale y quiere traducir varios strings
 * sin pasar el locale a cada call.
 *
 * Si una key falta en el dict, devuelve la key cruda — así las
 * traducciones faltantes se ven visualmente en la UI.
 */
export function makeServerT(locale: Locale): (key: string) => string {
  const dict = MESSAGES[locale]
  return (key: string) => dict[key] ?? key
}

/**
 * Atajo: lee la cookie + devuelve { locale, t } en un solo call. Para
 * server pages que quieren hacer la setup en una línea al inicio.
 *
 * Uso típico:
 *   const { locale, t } = await getServerI18n()
 *   <h1>{t('dash.heading.stats')}</h1>
 */
export async function getServerI18n(): Promise<{
  locale: Locale
  t: (key: string) => string
}> {
  const locale = await getServerLocale()
  return { locale, t: makeServerT(locale) }
}
