import Link from 'next/link'
import Logo from '@/components/Logo'

// ============================================================
// NXTUP — public marketing landing
//
// Design language: editorial × barbershop street credibility.
// Inspired by Aimé Leon Dore / Highsnobiety / Linear rather than the
// generic SaaS hero-3-features-pricing template. Single accent color
// (the brand green), heavy use of negative space, oversized display
// type in Instrument Serif paired with Geist for body.
//
// Owner-facing copy in Spanish (RD / LatAm market).
// ============================================================

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-nxtup-bg text-nxtup-fg">
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
// Nav
// ──────────────────────────────────────────────────────────────

function NavBar() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-nxtup-bg/70 border-b border-nxtup-line">
      <nav className="max-w-7xl mx-auto px-6 sm:px-10 h-16 flex items-center justify-between">
        <Link href="/" aria-label="NXTUP">
          <Logo className="h-5 w-auto" tone="dark" />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-xs uppercase tracking-[0.2em] text-nxtup-muted">
          <a href="#manifesto" className="hover:text-nxtup-fg transition-colors">
            Manifiesto
          </a>
          <a href="#surfaces" className="hover:text-nxtup-fg transition-colors">
            Producto
          </a>
          <a href="#how" className="hover:text-nxtup-fg transition-colors">
            Cómo funciona
          </a>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/login"
            className="hidden sm:inline text-xs uppercase tracking-[0.2em] text-nxtup-muted hover:text-nxtup-fg transition-colors"
          >
            Entrar
          </Link>
          <Link
            href="/signup"
            className="text-xs uppercase tracking-[0.2em] bg-nxtup-fg text-nxtup-bg px-4 py-2 rounded-md font-bold hover:bg-nxtup-active transition-colors"
          >
            Empezá gratis
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
  return (
    <section className="relative">
      {/* Editorial grid: 12 cols, content asymmetric */}
      <div className="max-w-7xl mx-auto px-6 sm:px-10 pt-24 pb-32 sm:pt-32 sm:pb-40">
        {/* Small overline */}
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.5em] text-nxtup-muted mb-12">
          <span className="w-8 h-px bg-nxtup-dim" />
          <span>The next-up system · est. 2026</span>
        </div>

        {/* Big stacked title — magazine-style */}
        <h1
          className="font-[family-name:var(--font-display)] leading-[0.85] tracking-tight"
          style={{ fontSize: 'clamp(4rem, 13vw, 12rem)' }}
        >
          Quién <span className="italic text-nxtup-muted">sigue</span>,
          <br />
          ya no se <span className="italic">discute.</span>
        </h1>

        {/* Subhead in body sans */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-1 hidden md:flex items-start pt-2">
            <span className="text-nxtup-active text-xs">●</span>
          </div>
          <p className="md:col-span-7 text-xl sm:text-2xl text-nxtup-muted leading-relaxed max-w-2xl">
            NXTUP es el sistema digital que reemplaza la pizarra de la barbería.
            Cada cliente sabe su turno. Cada barbero sabe el suyo. Nadie hace
            trampa.
          </p>
          <div className="md:col-span-4 flex md:justify-end items-end gap-4">
            <Link
              href="/signup"
              className="group inline-flex items-center gap-3 bg-nxtup-fg text-nxtup-bg px-6 py-4 font-bold uppercase tracking-[0.2em] text-xs hover:bg-nxtup-active transition-colors"
            >
              Probar con mi barbería
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </Link>
          </div>
        </div>

        {/* Bottom strip: meta */}
        <div className="mt-24 sm:mt-32 pt-8 border-t border-nxtup-line grid grid-cols-2 md:grid-cols-4 gap-y-6 text-xs uppercase tracking-[0.2em] text-nxtup-muted">
          <div>
            <p className="text-nxtup-fg font-bold text-sm mb-1">FIFO real</p>
            <p>Orden de llegada, sin atajos</p>
          </div>
          <div>
            <p className="text-nxtup-fg font-bold text-sm mb-1">Anti-trampa</p>
            <p>Activo solo desde el WiFi del shop</p>
          </div>
          <div>
            <p className="text-nxtup-fg font-bold text-sm mb-1">Hardware opcional</p>
            <p>El NXT TAP en cada estación</p>
          </div>
          <div>
            <p className="text-nxtup-fg font-bold text-sm mb-1">Bitácora</p>
            <p>Cada acción queda registrada</p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// Manifesto — the why, in one strong block
// ──────────────────────────────────────────────────────────────

function Manifesto() {
  return (
    <section
      id="manifesto"
      className="border-t border-nxtup-line"
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-24 sm:py-32 grid grid-cols-1 md:grid-cols-12 gap-10">
        <div className="md:col-span-3">
          <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted">
            Manifiesto
          </p>
        </div>
        <div className="md:col-span-9">
          <p
            className="font-[family-name:var(--font-display)] italic text-nxtup-fg leading-tight"
            style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)' }}
          >
            La pizarra es un problema disfrazado de tradición.
          </p>
          <p className="mt-10 text-lg text-nxtup-muted leading-relaxed max-w-2xl">
            Borrones, &ldquo;yo llegué primero&rdquo;, el barbero que mueve nombres
            cuando nadie ve, el cliente que se cansa de esperar y se va.
            <br />
            <br />
            <span className="text-nxtup-fg">
              Tu sistema actual no falla porque la gente sea mala. Falla porque
              depende de la memoria y la buena fe.
            </span>{' '}
            NXTUP no reemplaza tu barbería. Arregla lo único que tu barbería no
            puede arreglar sola — el orden.
          </p>
        </div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// Surfaces — the 3 screens, presented like a product showcase
// ──────────────────────────────────────────────────────────────

function Surfaces() {
  return (
    <section
      id="surfaces"
      className="border-t border-nxtup-line"
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-24 sm:py-32">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-20">
          <div className="md:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted">
              Producto
            </p>
          </div>
          <div className="md:col-span-9">
            <h2
              className="font-[family-name:var(--font-display)] leading-tight"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}
            >
              Tres pantallas.
              <br />
              <span className="italic text-nxtup-muted">Una sola verdad.</span>
            </h2>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-nxtup-line">
          <SurfaceCard
            kicker="Para el cliente"
            title="Check-in en 1 tap"
            body="Escanea el QR de la entrada. Si hay barbero libre, le dice a quién ir. Si hay cola, le dice cuándo le toca. No necesita registrarse."
            visual={<ClientVisual />}
          />
          <SurfaceCard
            kicker="Para el barbero"
            title="NXT TAP físico"
            body="Tres botones en su estación. ACTIVE, BUSY, BREAK. El sistema entero gira alrededor de quién tocó qué y cuándo."
            visual={<DeviceVisual />}
          />
          <SurfaceCard
            kicker="Para todos"
            title="TV en vivo"
            body="La pantalla pública muestra el orden de los barberos y los clientes en cola. Imposible discutir cuando todos ven lo mismo."
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

// Tiny stylized visuals for each surface — geometric, not stock illustrations.

function ClientVisual() {
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
        Eres el siguiente
      </text>
    </svg>
  )
}

function DeviceVisual() {
  return (
    <svg
      viewBox="0 0 200 150"
      className="w-3/4 h-3/4"
      fill="none"
    >
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
      <rect x="76" y="100" width="48" height="22" rx="3" className="stroke-nxtup-busy" stroke="currentColor" />
      <rect x="130" y="100" width="48" height="22" rx="3" className="stroke-nxtup-break" stroke="currentColor" />
    </svg>
  )
}

function TVVisual() {
  return (
    <svg
      viewBox="0 0 200 150"
      className="w-3/4 h-3/4"
      fill="none"
    >
      <rect x="10" y="20" width="180" height="110" rx="4" className="fill-nxtup-bg stroke-nxtup-dim" />
      {/* Three columns */}
      <line x1="70" y1="20" x2="70" y2="130" className="stroke-nxtup-dim" />
      <line x1="130" y1="20" x2="130" y2="130" className="stroke-nxtup-dim" />
      {/* Column labels */}
      <text x="40" y="38" textAnchor="middle" fontSize="6" fontWeight="bold" className="fill-nxtup-active">
        ACTIVE
      </text>
      <text x="100" y="38" textAnchor="middle" fontSize="6" fontWeight="bold" className="fill-nxtup-busy">
        BUSY
      </text>
      <text x="160" y="38" textAnchor="middle" fontSize="6" fontWeight="bold" className="fill-nxtup-break">
        BREAK
      </text>
      {/* Column rows */}
      <rect x="18" y="50" width="44" height="14" rx="2" className="fill-nxtup-line" />
      <rect x="18" y="70" width="44" height="14" rx="2" className="fill-nxtup-line" />
      <rect x="78" y="50" width="44" height="14" rx="2" className="fill-nxtup-line" />
      <rect x="138" y="50" width="44" height="14" rx="2" className="fill-nxtup-line" />
    </svg>
  )
}

// ──────────────────────────────────────────────────────────────
// How it works — 3 steps
// ──────────────────────────────────────────────────────────────

function HowItWorks() {
  const steps = [
    {
      num: '01',
      title: 'Pega el QR en tu entrada',
      body: 'Tomas el código de NXTUP, lo imprimes, lo pegas en la puerta. El cliente lo escanea desde su celular.',
    },
    {
      num: '02',
      title: 'Cada barbero tiene su NXT TAP',
      body: 'Un dispositivo en su estación. Tres botones para marcar Active, Busy, Break. Suficiente para ordenar todo el día.',
    },
    {
      num: '03',
      title: 'La TV muestra la verdad',
      body: 'En la pared del shop, en vivo: quién sigue, quién está cortando, cuánto falta. Cualquiera puede mirar.',
    },
  ]
  return (
    <section
      id="how"
      className="border-t border-nxtup-line bg-nxtup-line/30"
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-24 sm:py-32">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 mb-16">
          <div className="md:col-span-3">
            <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted">
              Cómo funciona
            </p>
          </div>
          <div className="md:col-span-9">
            <h2
              className="font-[family-name:var(--font-display)] leading-tight"
              style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)' }}
            >
              Setup en una tarde,
              <br />
              <span className="italic text-nxtup-muted">y olvidas la pizarra.</span>
            </h2>
          </div>
        </div>

        <ol className="grid grid-cols-1 md:grid-cols-3 gap-12">
          {steps.map(s => (
            <li key={s.num} className="flex flex-col gap-4">
              <span
                className="font-[family-name:var(--font-display)] text-nxtup-active leading-none"
                style={{ fontSize: '4rem' }}
              >
                {s.num}
              </span>
              <h3 className="text-xl font-bold tracking-tight">{s.title}</h3>
              <p className="text-nxtup-muted text-sm leading-relaxed max-w-xs">
                {s.body}
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
  return (
    <section className="border-t border-nxtup-line">
      <div className="max-w-7xl mx-auto px-6 sm:px-10 py-32 sm:py-48 text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-nxtup-muted mb-10">
          Listo para arrancar
        </p>
        <h2
          className="font-[family-name:var(--font-display)] leading-[0.9]"
          style={{ fontSize: 'clamp(3rem, 10vw, 9rem)' }}
        >
          La cola,
          <br />
          <span className="italic text-nxtup-active">arreglada.</span>
        </h2>
        <p className="mt-10 text-lg text-nxtup-muted max-w-xl mx-auto">
          Creá tu shop en 2 minutos. Sin tarjeta, sin compromiso. Probalo en tu
          próximo turno.
        </p>
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup"
            className="group inline-flex items-center gap-3 bg-nxtup-fg text-nxtup-bg px-8 py-5 font-bold uppercase tracking-[0.2em] text-xs hover:bg-nxtup-active transition-colors"
          >
            Crear mi barbería
            <span className="transition-transform group-hover:translate-x-1">→</span>
          </Link>
          <Link
            href="/login"
            className="text-xs uppercase tracking-[0.2em] text-nxtup-muted hover:text-nxtup-fg transition-colors px-4 py-3"
          >
            Ya tengo cuenta
          </Link>
        </div>
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// Footer
// ──────────────────────────────────────────────────────────────

function Footer() {
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
            Entrar
          </Link>
          <Link href="/signup" className="hover:text-nxtup-fg transition-colors">
            Crear cuenta
          </Link>
          <Link
            href="/test-console"
            className="hover:text-nxtup-fg transition-colors"
            title="Consola interna de testing"
          >
            Console
          </Link>
        </div>
      </div>
    </footer>
  )
}
