import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/admin-auth'

// ============================================================
// /admin — Home del super-admin
//
// Overview rápido del estado del sistema. Hoy: counts de shops,
// barberos activos, queue total, panel tokens activos. Más
// adelante puede crecer con: gráficos de actividad, alertas
// (shops sin actividad en X días), incidentes recientes, etc.
//
// La auth la maneja /admin/layout.tsx — esta página asume admin
// o socio. Los KPI cards y quick links destructivos se renderizan
// condicionalmente según el rol.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function AdminHomePage() {
  // Determinar rol para condicionar UI destructiva
  const cookieClient = await createClient()
  const {
    data: { user },
  } = await cookieClient.auth.getUser()
  const isAdmin = isAdminUser(user?.email)

  const admin = createAdminClient()

  // Todas las queries en paralelo para que el page sea snappy
  // incluso con 100+ shops.
  const [
    shopsResp,
    barbersActiveResp,
    queueResp,
    tokensActiveResp,
  ] = await Promise.all([
    admin.from('shops').select('id, is_open'),
    admin
      .from('barbers')
      .select('id, status', { count: 'exact', head: true })
      .neq('status', 'offline'),
    admin
      .from('queue_entries')
      .select('id', { count: 'exact', head: true })
      .in('status', ['waiting', 'called', 'in_progress']),
    admin
      .from('shop_control_tokens')
      .select('id', { count: 'exact', head: true })
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
  ])

  const shops = shopsResp.data ?? []
  const totalShops = shops.length
  const openShops = shops.filter(s => s.is_open).length

  const stats: { label: string; value: string; sub: string; href: string | null }[] = [
    {
      label: 'Shops totales',
      value: String(totalShops),
      sub: `${openShops} abiertos ahora`,
      href: '/admin/shops',
    },
    {
      label: 'Barberos activos',
      value: String(barbersActiveResp.count ?? 0),
      sub: 'available · busy · break',
      href: null,
    },
    {
      label: 'Clientes en cola',
      value: String(queueResp.count ?? 0),
      sub: 'waiting · called · in_progress',
      href: null,
    },
  ]

  // El KPI de panel-tokens solo lo ven los admin (los socios no
  // tienen visibilidad sobre esa sección).
  if (isAdmin) {
    stats.push({
      label: 'Panel tokens activos',
      value: String(tokensActiveResp.count ?? 0),
      sub: 'no revocados ni expirados',
      href: '/admin/panel-tokens',
    })
  }

  return (
    <main className="px-6 sm:px-10 py-10 max-w-5xl">
      <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
        Resumen del sistema
      </p>
      <h1 className="text-3xl font-black tracking-tight mb-8">Admin</h1>

      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {stats.map(stat => {
          const card = (
            <div className="rounded-2xl bg-nxtup-line/40 border border-nxtup-line p-5 h-full">
              <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
                {stat.label}
              </p>
              <p className="text-white text-4xl font-black tracking-tight tabular-nums mb-1">
                {stat.value}
              </p>
              <p className="text-nxtup-muted text-xs">{stat.sub}</p>
            </div>
          )
          return stat.href ? (
            <Link
              key={stat.label}
              href={stat.href}
              className="block hover:scale-[1.01] transition-transform"
            >
              {card}
            </Link>
          ) : (
            <div key={stat.label}>{card}</div>
          )
        })}
      </section>

      <section>
        <h2 className="text-white text-lg font-bold mb-3">Quick links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Link
            href="/admin/shops"
            className="rounded-xl border border-nxtup-line bg-nxtup-line/30 hover:border-white p-4 transition-colors"
          >
            <p className="text-white font-bold mb-1">Ver todos los shops</p>
            <p className="text-nxtup-muted text-xs">
              Lista global con dueño, status y queue actual.
            </p>
          </Link>
          {isAdmin ? (
            <Link
              href="/admin/panel-tokens"
              className="rounded-xl border border-nxtup-line bg-nxtup-line/30 hover:border-white p-4 transition-colors"
            >
              <p className="text-white font-bold mb-1">Generar link de Centro de Mando</p>
              <p className="text-nxtup-muted text-xs">
                Acceso temporal al panel de un shop, sin entrar al dashboard.
              </p>
            </Link>
          ) : (
            <Link
              href="/admin/stats"
              className="rounded-xl border border-nxtup-line bg-nxtup-line/30 hover:border-white p-4 transition-colors"
            >
              <p className="text-white font-bold mb-1">Ver estadísticas</p>
              <p className="text-nxtup-muted text-xs">
                Reportes operativos y financieros del negocio.
              </p>
            </Link>
          )}
        </div>
      </section>
    </main>
  )
}
