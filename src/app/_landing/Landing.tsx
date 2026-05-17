'use client'

import Link from 'next/link'
import Logo from '@/components/Logo'
import { InstallButton } from '@/components/InstallButton'
import { useLocale } from '@/lib/i18n'

// ============================================================
// NXTUP — public marketing landing (client component)
//
// Design language: editorial × barbershop street credibility.
// Bilingual (ES default, EN toggle) — strings via useLocale().
// ============================================================

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col bg-nxtup-bg text-nxtup-fg">
      {/* PWA install strip — sits above the sticky NavBar so it scrolls
          away naturally once the user starts reading. Auto-hides when
          already installed or on browsers that can't install PWAs. */}
      <InstallButton variant="banner" />
      <NavBar />
      <main className="flex-1 flex flex-col">
        <Hero />
        <Manifesto />
        <Surfaces />
        <HowItWorks />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Locale toggle
// ──────────────────────────────────────────────────────────────

function LocaleToggle() {
  const { locale, setLocale, t } = useLocale()
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === 'es' ? 'en' : 'es')}
      aria-label={t('locale.switch.aria')}
      className="text-[10px] uppercase tracking-[0.3em] text-nxtup-muted hover:text-nxtup-fg transition-colors border border-nxtup-line hover:border-nxtup-dim rounded px-2 py-1.5 font-bold"
    >
      {t('locale.switch')}
    </button>
  )
}

// ──────────────────────────────────────────────────────────────
// Nav
// ──────────────────────────────────────────────────────────────

function NavBar() {
  const { t } = useLocale()
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-nxtup-bg/70 border-b border-nxtup-line">
      <nav className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <Link href="/" aria-label="NXTUP">
          <Logo className="h-5 w-auto" tone="dark" />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-xs uppercase tracking-[0.2em] text-nxtup-muted">
          <a href="#manifesto" className="hover:text-nxtup-fg transition-colors">
            {t('nav.manifesto')}
          </a>
          <a href="#surfaces" className="hover:text-nxtup-fg transition-colors">
            {t('nav.product')}
          </a>
          <a href="#how" className="hover:text-nxtup-fg transition-colors">
            {t('nav.how')}
          </a>
        </div>
        <div className="flex items-center gap-3">
          <LocaleToggle />
          <Link
            href="/login"
            className="hidden sm:inline text-xs uppercase tracking-[0.2em] text-nxtup-muted hover:text-nxtup-fg transition-colors"
          >
            {t('nav.login')}
          </Link>
          <Link
            href="/signup"
            className="text-xs uppercase tracking-[0.2em] bg-nxtup-fg text-nxtup-bg px-4 py-2 rounded-md font-bold hover:bg-nxtup-active transition-colors"
          >
            {t('nav.signup')}
          </Link>
        </div>
      </nav>
    </header>
  )
}

// ──────────────────────────────────────────────────────────────
// Hero — editorial stacked typography
// ──────────────────────────────────────────────────────────────

function Hero() {
  const { locale, t } = useLocale()
  return (
    <section className="relative">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 pt-24 pb-32 sm:pt-32 sm:pb-40">
        {/* Small overline */}
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.5em] text-nxtup-muted mb-12">
          <span className="w-8 h-px bg-nxtup-dim" />
          <span>{t('hero.overline')}</span>
        </div>

        {/* Big stacked title — magazine-style. Italic emphasis is part of
            the design language, so we render JSX per locale instead of
            trying to template it. */}
        <h1
          className="font-[family-name:var(--font-display)] leading-[0.85] tracking-tight"
          style={{ fontSize: 'clamp(4rem, 13vw, 12rem)' }}
        >
          {locale === 'es' ? (
            <>
              Quién <span className="italic text-nxtup-muted">sigue</span>,
              <br />
              ya no se <span className="italic">discute.</span>
            </>
          ) : (
            <>
              Who&apos;s <span className="italic text-nxtup-muted">next</span>
              <br />
              is no longer up for <span className="italic">debate.</span>
            </>
          )}
        </h1>

        {/* Subhead */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-1 hidden md:flex items-start pt-2">
            <span className="text-nxtup-active text-xs">●</span>
          </div>
          <p className="md:col-span-7 text-xl sm:text-2xl text-nxtup-muted leading-relaxed max-w-2xl">
            {t('hero.sub')}
          </p>
          <div className="md:col-span-4 flex md:justify-end items-end gap-4">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-3 bg-nxtup-fg text-nxtup-bg px-6 py-4 font-bold uppercase tracking-[0.2em] text-xs hover:bg-nxtup-active transition-colors"
            >
              {t('hero.cta')}
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>

        {/* Bottom strip: meta */}
        <div className="mt-24 sm:mt-32 pt-8 border-t border-nxtup-line grid grid-cols-2 md:grid-cols-4 gap-y-6 text-xs uppercase tracking-[0.2em] text-nxtup-muted">
          {(['fact1', 'fact2', 'fact3', 'fact4'] as const).map(k => (
            <div key={k}>
              <p className="text-nxtup-fg font-bold text-sm mb-1">
                {t(`hero.${k}.title`)}
              </p>
              <p>{t(`hero.${k}.body`)}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// Manifesto
// ──────────────────────────────────────────────────────────────

function Manifesto() {
  const { locale, t } = useLocale()
  return (
    <section id="manifesto" className="border-t border-nxtup-line">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-24 sm:py-32 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-3">
          <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted">
            {t('manifesto.label')}
          </p>
        </div>
        <div className="md:col-span-9">
          <p
            className="font-[family-name:var(--font-display)] italic text-nxtup-fg leading-tight"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)' }}
          >
            {locale === 'es'
              ? 'La pizarra es un problema disfrazado de tradición.'
              : 'The whiteboard is a problem dressed up as tradition.'}
          </p>
          <p className="mt-10 text-lg text-nxtup-muted leading-relaxed max-w-2xl">
            {t('manifesto.body.1')}
            <br />
            <br />
            <span className="text-nxtup-fg">{t('manifesto.body.2')}</span>{' '}
            {t('manifesto.body.3')}
          </p>
        </div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// Surfaces
// ──────────────────────────────────────────────────────────────

function Surfaces() {
  const { locale, t } = useLocale()
  return (
    <section id="surfaces" className="border-t border-nxtup-line">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-24 sm:py-32">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-20">
          <div className="md:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted">
              {t('surfaces.label')}
            </p>
          </div>
          <div className="md:col-span-9">
            <h2
              className="font-[family-name:var(--font-display)] leading-tight"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}
            >
              {locale === 'es' ? (
                <>
                  Tres pantallas.
                  <br />
                  <span className="italic text-nxtup-muted">
                    Una sola verdad.
                  </span>
                </>
              ) : (
                <>
                  Three screens.
                  <br />
                  <span className="italic text-nxtup-muted">One truth.</span>
                </>
              )}
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-nxtup-line">
          <SurfaceCard
            kicker={t('surfaces.client.kicker')}
            title={t('surfaces.client.title')}
            body={t('surfaces.client.body')}
            visual={<ClientVisual />}
          />
          <SurfaceCard
            kicker={t('surfaces.device.kicker')}
            title={t('surfaces.device.title')}
            body={t('surfaces.device.body')}
            visual={<DeviceVisual />}
          />
          <SurfaceCard
            kicker={t('surfaces.tv.kicker')}
            title={t('surfaces.tv.title')}
            body={t('surfaces.tv.body')}
            visual={<TVVisual />}
          />
        </div>
      </div>
    </section>
  )
}

function SurfaceCard({
  kicker,
  title,
  body,
  visual,
}: {
  kicker: string
  title: string
  body: string
  visual: React.ReactNode
}) {
  return (
    <div className="bg-nxtup-bg p-8 flex flex-col gap-6">
      <div className="aspect-[4/3] bg-nxtup-line rounded-md overflow-hidden flex items-center justify-center">
        {visual}
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.4em] text-nxtup-muted mb-2">
          {kicker}
        </p>
        <h3 className="text-2xl font-bold tracking-tight mb-3">{title}</h3>
        <p className="text-nxtup-muted text-sm leading-relaxed">{body}</p>
      </div>
    </div>
  )
}

function ClientVisual() {
  const { t } = useLocale()
  return (
    <svg
      viewBox="0 0 200 150"
      className="w-2/3 h-2/3"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
    >
      <rect x="55" y="20" width="90" height="110" rx="8" className="text-nxtup-dim" />
      <text
        x="100"
        y="60"
        textAnchor="middle"
        fontSize="8"
        fontWeight="bold"
        className="fill-nxtup-muted"
      >
        FADE FACTORY
      </text>
      <text
        x="100"
        y="92"
        textAnchor="middle"
        fontSize="32"
        fontWeight="900"
        className="fill-nxtup-active stroke-none"
      >
        #1
      </text>
      <text
        x="100"
        y="115"
        textAnchor="middle"
        fontSize="6"
        className="fill-nxtup-muted stroke-none"
      >
        {t('visual.client.next')}
      </text>
    </svg>
  )
}

function DeviceVisual() {
  return (
    <svg viewBox="0 0 200 150" className="w-3/4 h-3/4" fill="none">
      <rect
        x="10"
        y="20"
        width="180"
        height="110"
        rx="10"
        className="fill-nxtup-bg stroke-nxtup-dim"
      />
      <text
        x="100"
        y="42"
        textAnchor="middle"
        fontSize="12"
        fontWeight="900"
        className="fill-nxtup-fg"
        letterSpacing="2"
      >
        NXTUP
      </text>
      <text
        x="100"
        y="75"
        textAnchor="middle"
        fontSize="22"
        fontWeight="900"
        className="fill-nxtup-fg"
      >
        #1
      </text>
      <rect x="22" y="100" width="48" height="22" rx="3" className="fill-nxtup-active" />
      <rect
        x="76"
        y="100"
        width="48"
        height="22"
        rx="3"
        className="stroke-nxtup-busy"
        stroke="currentColor"
      />
      <rect
        x="130"
        y="100"
        width="48"
        height="22"
        rx="3"
        className="stroke-nxtup-break"
        stroke="currentColor"
      />
    </svg>
  )
}

function TVVisual() {
  return (
    <svg viewBox="0 0 200 150" className="w-3/4 h-3/4" fill="none">
      <rect
        x="10"
        y="20"
        width="180"
        height="110"
        rx="4"
        className="fill-nxtup-bg stroke-nxtup-dim"
      />
      <line x1="70" y1="20" x2="70" y2="130" className="stroke-nxtup-dim" />
      <line x1="130" y1="20" x2="130" y2="130" className="stroke-nxtup-dim" />
      <text
        x="40"
        y="38"
        textAnchor="middle"
        fontSize="6"
        fontWeight="bold"
        className="fill-nxtup-active"
      >
        ACTIVE
      </text>
      <text
        x="100"
        y="38"
        textAnchor="middle"
        fontSize="6"
        fontWeight="bold"
        className="fill-nxtup-busy"
      >
        BUSY
      </text>
      <text
        x="160"
        y="38"
        textAnchor="middle"
        fontSize="6"
        fontWeight="bold"
        className="fill-nxtup-break"
      >
        BREAK
      </text>
      <rect x="18" y="50" width="44" height="14" rx="2" className="fill-nxtup-line" />
      <rect x="18" y="70" width="44" height="14" rx="2" className="fill-nxtup-line" />
      <rect x="78" y="50" width="44" height="14" rx="2" className="fill-nxtup-line" />
      <rect x="138" y="50" width="44" height="14" rx="2" className="fill-nxtup-line" />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────
// How it works
// ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const { locale, t } = useLocale()
  return (
    <section id="how" className="border-t border-nxtup-line bg-nxtup-line/30">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-24 sm:py-32">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-16">
          <div className="md:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted">
              {t('how.label')}
            </p>
          </div>
          <div className="md:col-span-9">
            <h2
              className="font-[family-name:var(--font-display)] leading-tight"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}
            >
              {locale === 'es' ? (
                <>
                  Setup en una tarde,
                  <br />
                  <span className="italic text-nxtup-muted">
                    y olvidas la pizarra.
                  </span>
                </>
              ) : (
                <>
                  Set up in an afternoon,
                  <br />
                  <span className="italic text-nxtup-muted">
                    and forget the whiteboard.
                  </span>
                </>
              )}
            </h2>
          </div>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {(['step1', 'step2', 'step3'] as const).map((k, i) => (
            <li key={k} className="flex flex-col gap-4">
              <span
                className="font-[family-name:var(--font-display)] text-nxtup-active leading-none"
                style={{ fontSize: '4rem' }}
              >
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="text-xl font-bold tracking-tight">
                {t(`how.${k}.title`)}
              </h3>
              <p className="text-nxtup-muted text-sm leading-relaxed max-w-xs">
                {t(`how.${k}.body`)}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// Final CTA
// ──────────────────────────────────────────────────────────────

function FinalCTA() {
  const { locale, t } = useLocale()
  return (
    <section className="border-t border-nxtup-line">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-32 sm:py-48 text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted mb-10">
          {t('cta.label')}
        </p>
        <h2
          className="font-[family-name:var(--font-display)] leading-[0.9]"
          style={{ fontSize: 'clamp(3rem, 10vw, 9rem)' }}
        >
          {locale === 'es' ? (
            <>
              La cola,
              <br />
              <span className="italic text-nxtup-active">arreglada.</span>
            </>
          ) : (
            <>
              The line,
              <br />
              <span className="italic text-nxtup-active">fixed.</span>
            </>
          )}
        </h2>
        <p className="mt-10 text-lg text-nxtup-muted max-w-xl mx-auto">
          {t('cta.sub')}
        </p>
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-3 bg-nxtup-fg text-nxtup-bg px-8 py-5 font-bold uppercase tracking-[0.2em] text-xs hover:bg-nxtup-active transition-colors"
          >
            {t('cta.primary')}
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <Link
            href="/login"
            className="text-xs uppercase tracking-[0.2em] text-nxtup-muted hover:text-nxtup-fg transition-colors px-4 py-3"
          >
            {t('cta.secondary')}
          </Link>
          {/* Tertiary action: install. Self-hides on browsers that don't
              support PWA install + when already installed. */}
          <InstallButton variant="prominent" className="mt-2 sm:mt-0" />
        </div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// Footer
// ──────────────────────────────────────────────────────────────

function Footer() {
  const { t } = useLocale()
  return (
    <footer className="border-t border-nxtup-line">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <Logo className="h-5 w-auto" tone="dark" />
          <span className="text-nxtup-muted text-xs">
            © {new Date().getFullYear()} NXTUP
          </span>
        </div>
        <div className="flex items-center gap-6 text-xs uppercase tracking-[0.2em] text-nxtup-muted">
          <Link href="/login" className="hover:text-nxtup-fg transition-colors">
            {t('nav.login')}
          </Link>
          <Link href="/signup" className="hover:text-nxtup-fg transition-colors">
            {t('nav.signup')}
          </Link>
          <Link
            href="/test-console"
            className="hover:text-nxtup-fg transition-colors"
          >
            {t('footer.console')}
          </Link>
        </div>
      </div>
    </footer>
  )
}
