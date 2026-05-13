import Link from 'next/link'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let shop:
    | { id: string; name: string }
    | null = null
  let barbers: { id: string; name: string }[] = []

  if (user) {
    const { data: s } = await supabase
      .from('shops')
      .select('id, name')
      .eq('owner_id', user.id)
      .maybeSingle()
    shop = s ?? null

    if (shop) {
      const { data: b } = await supabase
        .from('barbers')
        .select('id, name')
        .eq('shop_id', shop.id)
        .order('name')
        .limit(8)
      barbers = b ?? []
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center px-6 py-12">
      <Logo className="h-14 w-auto mb-6" tone="dark" />
      <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-2">
        Test console — temporary
      </p>
      <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-1 text-center">
        Simple. Fast. Fair.
      </h1>
      <p className="text-nxtup-dim text-sm text-center mb-10 max-w-md">
        Atajos a todas las superficies del producto para probar el flow.
      </p>

      <div className="w-full max-w-2xl flex flex-col gap-8">
        {!user && (
          <Section title="Auth">
            <LinkRow
              href="/login"
              label="Login"
              hint="Iniciar sesión con email + password"
            />
            <LinkRow
              href="/signup"
              label="Sign up"
              hint="Crear cuenta de dueño"
            />
          </Section>
        )}

        {user && !shop && (
          <Section title="Onboarding">
            <LinkRow
              href="/onboarding"
              label="Crear shop"
              hint="Aún no has creado tu barbería"
            />
          </Section>
        )}

        {user && shop && (
          <>
            <Section title="Owner — Dashboard">
              <LinkRow
                href="/dashboard"
                label="Live queue"
                hint="Cola activa, barberos, abrir/cerrar shop"
              />
              <LinkRow
                href="/dashboard/barbers"
                label="Barbers"
                hint="Crear, editar, asignar avatares"
              />
              <LinkRow
                href="/dashboard/activity"
                label="Activity log"
                hint="Bitácora de acciones (state changes, asignaciones, posición)"
              />
              <LinkRow
                href="/dashboard/settings"
                label="Settings"
                hint="Logo, breaks, reglas de cola, gracia"
              />
            </Section>

            <Section title="Cliente — Check-in">
              <LinkRow
                href={`/q/${shop.id}`}
                label="QR check-in público"
                hint={`Lo que ve el cliente al escanear el QR (${shop.name})`}
              />
            </Section>

            <Section title="TV display">
              <LinkRow
                href={`/display/${shop.id}`}
                label="Pantalla pública"
                hint="Para Fire TV / monitor de la barbería"
              />
            </Section>

            <Section title="Devices simulator">
              <LinkRow
                href={`/devices/${shop.id}`}
                label="Simulador de pantallas físicas"
                hint="Una pantalla por barbero, todas en la misma página — para probar el flujo end-to-end sin comprar hardware"
              />
            </Section>

            <Section title="Barber app — pantalla individual">
              <LinkRow
                href={`/barber/${shop.id}`}
                label="Selector de barbero"
                hint="Pantalla de '¿quién eres?' — el barbero elige quien es y entra a su dashboard"
              />
              {barbers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {barbers.map(b => (
                    <Link
                      key={b.id}
                      href={`/barber/${shop.id}/${b.id}`}
                      className="text-xs px-3 py-1.5 bg-nxtup-line border border-nxtup-dim hover:border-white rounded-md text-white transition-colors"
                    >
                      {b.name} →
                    </Link>
                  ))}
                </div>
              )}
              <p className="text-nxtup-dim text-[11px] mt-3 leading-relaxed">
                Cada barbero puede abrir su link directo en el celular o tablet y
                tener la misma pantalla NXTUP que el hardware físico.
              </p>
            </Section>

            <Section title="Sesión">
              <p className="text-nxtup-dim text-xs leading-relaxed">
                Sesión activa: <span className="text-nxtup-muted">{user.email}</span>
                {shop && <> · Shop: <span className="text-nxtup-muted">{shop.name}</span></>}
              </p>
              <p className="text-nxtup-dim text-xs leading-relaxed">
                Shop ID: <code className="font-mono text-nxtup-muted text-[11px]">{shop.id}</code>
              </p>
              <form action="/auth/signout" method="POST" className="mt-3">
                <button
                  type="submit"
                  className="text-nxtup-muted hover:text-nxtup-busy text-xs transition-colors"
                >
                  Sign out
                </button>
              </form>
            </Section>
          </>
        )}
      </div>
    </main>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section>
      <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-3 font-bold">
        {title}
      </p>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  )
}

function LinkRow({
  href,
  label,
  hint,
}: {
  href: string
  label: string
  hint?: string
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 px-4 py-3 border border-nxtup-line hover:border-nxtup-muted rounded-xl transition-colors group"
    >
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium text-sm">{label}</p>
        {hint && (
          <p className="text-nxtup-dim text-xs mt-0.5 leading-relaxed truncate">
            {hint}
          </p>
        )}
      </div>
      <span className="text-nxtup-dim group-hover:text-white transition-colors flex-shrink-0">
        →
      </span>
    </Link>
  )
}
