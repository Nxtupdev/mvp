'use client'

import { createContext, useCallback, useContext, useState } from 'react'

// ============================================================
// Lightweight bilingual support. Cookie-backed, no URL routing,
// no external dependency. Future pages just call useLocale() and
// pull strings out of MESSAGES below — or use the helper t().
// ============================================================

export type Locale = 'es' | 'en'
export const DEFAULT_LOCALE: Locale = 'es'

type Messages = Record<string, string>

// All translations live here. Add new keys as you translate more
// pages — the t() function returns the key itself if a translation is
// missing, so you immediately see what's untranslated.
const MESSAGES: Record<Locale, Messages> = {
  es: {
    // ── Nav ────────────────────────────────────────────────────
    'nav.manifesto': 'Manifiesto',
    'nav.product': 'Producto',
    'nav.how': 'Cómo funciona',
    'nav.login': 'Entrar',
    'nav.signup': 'Empezá gratis',

    // ── Hero ───────────────────────────────────────────────────
    'hero.overline': 'The next-up system · est. 2026',
    'hero.sub':
      'NXTUP es el sistema digital que reemplaza la pizarra de la barbería. Cada cliente sabe su turno. Cada barbero sabe el suyo. Nadie hace trampa.',
    'hero.cta': 'Probar con mi barbería',
    'hero.fact1.title': 'FIFO real',
    'hero.fact1.body': 'Orden de llegada, sin atajos',
    'hero.fact2.title': 'Anti-trampa',
    'hero.fact2.body': 'Activo solo desde el WiFi del shop',
    'hero.fact3.title': 'Hardware opcional',
    'hero.fact3.body': 'El NXT TAP en cada estación',
    'hero.fact4.title': 'Bitácora',
    'hero.fact4.body': 'Cada acción queda registrada',

    // ── Manifesto ──────────────────────────────────────────────
    'manifesto.label': 'Manifiesto',
    'manifesto.body.1':
      'Borrones, "yo llegué primero", el barbero que mueve nombres cuando nadie ve, el cliente que se cansa de esperar y se va.',
    'manifesto.body.2':
      'Tu sistema actual no falla porque la gente sea mala. Falla porque depende de la memoria y la buena fe.',
    'manifesto.body.3':
      'NXTUP no reemplaza tu barbería. Arregla lo único que tu barbería no puede arreglar sola — el orden.',

    // ── Surfaces ───────────────────────────────────────────────
    'surfaces.label': 'Producto',
    'surfaces.client.kicker': 'Para el cliente',
    'surfaces.client.title': 'Check-in en 1 tap',
    'surfaces.client.body':
      'Escanea el QR de la entrada. Si hay barbero libre, le dice a quién ir. Si hay cola, le dice cuándo le toca. No necesita registrarse.',
    'surfaces.device.kicker': 'Para el barbero',
    'surfaces.device.title': 'NXT TAP físico',
    'surfaces.device.body':
      'Tres botones en su estación. ACTIVE, BUSY, BREAK. El sistema entero gira alrededor de quién tocó qué y cuándo.',
    'surfaces.tv.kicker': 'Para todos',
    'surfaces.tv.title': 'TV en vivo',
    'surfaces.tv.body':
      'La pantalla pública muestra el orden de los barberos y los clientes en cola. Imposible discutir cuando todos ven lo mismo.',

    // ── How it works ───────────────────────────────────────────
    'how.label': 'Cómo funciona',
    'how.step1.title': 'Pega el QR en tu entrada',
    'how.step1.body':
      'Tomas el código de NXTUP, lo imprimes, lo pegas en la puerta. El cliente lo escanea desde su celular.',
    'how.step2.title': 'Cada barbero tiene su NXT TAP',
    'how.step2.body':
      'Un dispositivo en su estación. Tres botones para marcar Active, Busy, Break. Suficiente para ordenar todo el día.',
    'how.step3.title': 'La TV muestra la verdad',
    'how.step3.body':
      'En la pared del shop, en vivo: quién sigue, quién está cortando, cuánto falta. Cualquiera puede mirar.',

    // ── Final CTA ──────────────────────────────────────────────
    'cta.label': 'Listo para arrancar',
    'cta.sub':
      'Creá tu shop en 2 minutos. Sin tarjeta, sin compromiso. Probalo en tu próximo turno.',
    'cta.primary': 'Crear mi barbería',
    'cta.secondary': 'Ya tengo cuenta',

    // ── Footer ─────────────────────────────────────────────────
    'footer.console': 'Consola',

    // ── Visuals (SVG inline copy) ─────────────────────────────
    'visual.client.next': 'Eres el siguiente',

    // ── Locale switch ──────────────────────────────────────────
    'locale.switch': 'EN',
    'locale.switch.aria': 'Switch to English',
  },
  en: {
    // ── Nav ────────────────────────────────────────────────────
    'nav.manifesto': 'Manifesto',
    'nav.product': 'Product',
    'nav.how': 'How it works',
    'nav.login': 'Log in',
    'nav.signup': 'Get started',

    // ── Hero ───────────────────────────────────────────────────
    'hero.overline': 'The next-up system · est. 2026',
    'hero.sub':
      'NXTUP is the digital system that replaces the barbershop whiteboard. Every client knows their turn. Every barber knows theirs. Nobody cuts the line.',
    'hero.cta': 'Try it in my shop',
    'hero.fact1.title': 'Real FIFO',
    'hero.fact1.body': 'First in, first served. No shortcuts.',
    'hero.fact2.title': 'Anti-cheat',
    'hero.fact2.body': 'Only active from the shop WiFi',
    'hero.fact3.title': 'Optional hardware',
    'hero.fact3.body': 'The NXT TAP on every chair',
    'hero.fact4.title': 'Audit log',
    'hero.fact4.body': 'Every action recorded',

    // ── Manifesto ──────────────────────────────────────────────
    'manifesto.label': 'Manifesto',
    'manifesto.body.1':
      'Smudged names, "I was here first," the barber who rearranges the board when nobody\'s looking, the client who gives up and walks out.',
    'manifesto.body.2':
      'Your current system doesn\'t fail because people are bad. It fails because it relies on memory and goodwill.',
    'manifesto.body.3':
      'NXTUP doesn\'t replace your shop. It fixes the one thing your shop can\'t fix on its own — the order.',

    // ── Surfaces ───────────────────────────────────────────────
    'surfaces.label': 'Product',
    'surfaces.client.kicker': 'For the client',
    'surfaces.client.title': 'One-tap check-in',
    'surfaces.client.body':
      'Scan the QR at the door. If a barber is free, it tells them who. If there\'s a wait, it tells them when. No signup required.',
    'surfaces.device.kicker': 'For the barber',
    'surfaces.device.title': 'NXT TAP device',
    'surfaces.device.body':
      'Three buttons at every station: ACTIVE, BUSY, BREAK. The whole system runs on who tapped what, when.',
    'surfaces.tv.kicker': 'For everyone',
    'surfaces.tv.title': 'Live TV display',
    'surfaces.tv.body':
      'The shop\'s public screen shows the barber lineup and the client queue in real time. Impossible to argue when everyone sees the same thing.',

    // ── How it works ───────────────────────────────────────────
    'how.label': 'How it works',
    'how.step1.title': 'Print the QR by the door',
    'how.step1.body':
      'Grab your NXTUP code, print it, tape it to the entrance. Clients scan it with their phone.',
    'how.step2.title': 'Each barber gets a NXT TAP',
    'how.step2.body':
      'A device on every chair. Three buttons for Active, Busy, Break. Enough to run the whole day.',
    'how.step3.title': 'The TV tells the truth',
    'how.step3.body':
      'On the shop\'s wall, live: who\'s next, who\'s cutting, how long until your turn. Anyone can look.',

    // ── Final CTA ──────────────────────────────────────────────
    'cta.label': 'Ready to ship',
    'cta.sub':
      'Create your shop in 2 minutes. No credit card, no commitment. Try it on your next shift.',
    'cta.primary': 'Create my shop',
    'cta.secondary': 'I already have an account',

    // ── Footer ─────────────────────────────────────────────────
    'footer.console': 'Console',

    // ── Visuals (SVG inline copy) ─────────────────────────────
    'visual.client.next': "You're up next",

    // ── Locale switch ──────────────────────────────────────────
    'locale.switch': 'ES',
    'locale.switch.aria': 'Cambiar a español',
  },
}

// ──────────────────────────────────────────────────────────────
// Context + provider
// ──────────────────────────────────────────────────────────────

type Ctx = {
  locale: Locale
  setLocale: (next: Locale) => void
  t: (key: string) => string
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
    (key: string) => {
      const dict = MESSAGES[locale]
      return dict[key] ?? key // return the key itself so missing translations surface visually
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
      t: (key: string) => MESSAGES[DEFAULT_LOCALE][key] ?? key,
    }
  }
  return ctx
}

// Convenience for server-side cookie reads (used in root layout).
export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en'
}
