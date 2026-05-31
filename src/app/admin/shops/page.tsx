import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'

// ============================================================
// /admin/shops — Lista global de shops
//
// Tabla con cada shop del sistema y métricas operativas básicas
// (barberos, queue actual, status open/close). Pensado para que
// el staff de NXTUP pueda hacer triage rápido — ej. el dueño de
// X dice que su shop está caído → tú ves de un vistazo cuántos
// barberos tiene en cola y si está abierto.
//
// Por shop, derecha de la fila:
//   * Botón "Centro de Mando" → genera un link rápido (próximo,
//     hoy lo dejo apuntando a /admin/panel-tokens con el shop
//     pre-seleccionado vía query param para tu siguiente click)
//   * Link copy-id para que puedas pegar el UUID donde lo necesites.
//
// Auth la maneja /admin/layout.tsx.
// ============================================================

export const dynamic = 'force-dynamic'

type ShopRow = {
  id: string
  name: string
  is_open: boolean
  logo_url: string | null
  owner_id: string
  created_at: string
}

export default async function AdminShopsPage() {
  const admin = createAdminClient()

  // 1) Todos los shops con metadata básica.
  const { data: shopsRaw } = await admin
    .from('shops')
    .select('id, name, is_open, logo_url, owner_id, created_at')
    .order('created_at', { ascending: false })

  const shops = (shopsRaw ?? []) as ShopRow[]

  // 2) Resolver emails de dueños vía auth admin API. Una sola
  // llamada y armamos un map para el render.
  const ownerEmailMap = new Map<string, string>()
  try {
    const { data: usersList } = await admin.auth.admin.listUsers({ perPage: 200 })
    for (const u of usersList?.users ?? []) {
      if (u.id && u.email) ownerEmailMap.set(u.id, u.email)
    }
  } catch (err) {
    console.error('[admin/shops] listUsers failed', err)
  }

  // 3) Counts agregados por shop. Hacemos UNA query global por
  // tabla en vez de N por shop — escalable a 100+ shops.
  const [{ data: barbersRows }, { data: queueRows }] = await Promise.all([
    admin
      .from('barbers')
      .select('shop_id, status'),
    admin
      .from('queue_entries')
      .select('shop_id, status')
      .in('status', ['waiting', 'called', 'in_progress']),
  ])

  const barbersByShop = new Map<string, { total: number; active: number }>()
  for (const b of barbersRows ?? []) {
    const row = b as { shop_id: string; status: string }
    const entry = barbersByShop.get(row.shop_id) ?? { total: 0, active: 0 }
    entry.total++
    if (row.status !== 'offline') entry.active++
    barbersByShop.set(row.shop_id, entry)
  }

  const queueByShop = new Map<string, number>()
  for (const q of queueRows ?? []) {
    const row = q as { shop_id: string; status: string }
    queueByShop.set(row.shop_id, (queueByShop.get(row.shop_id) ?? 0) + 1)
  }

  return (
    <main className="px-6 sm:px-10 py-10 max-w-6xl">
      <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
        Sistema · Visión global
      </p>
      <h1 className="text-3xl font-black tracking-tight mb-2">Shops</h1>
      <p className="text-nxtup-muted text-sm mb-8 max-w-prose">
        Todos los shops del sistema con su dueño, status actual y métricas operativas.
        Click en un shop para abrir el Centro de Mando o generar un link temporal.
      </p>

      {shops.length === 0 ? (
        <div className="border border-dashed border-nxtup-dim rounded-2xl py-16 text-center">
          <p className="text-nxtup-muted text-sm">No hay shops en el sistema todavía.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-nxtup-line bg-nxtup-line/30 overflow-hidden">
          {/* Header de tabla — visible solo en desktop */}
          <div className="hidden md:grid grid-cols-[2.5fr_2fr_1fr_1fr_1fr_auto] gap-4 px-5 py-3 border-b border-nxtup-line text-nxtup-muted text-[10px] uppercase tracking-widest font-bold">
            <div>Shop</div>
            <div>Dueño</div>
            <div>Status</div>
            <div className="tabular-nums">Barberos</div>
            <div className="tabular-nums">En cola</div>
            <div className="text-right">Acciones</div>
          </div>

          <ul>
            {shops.map(shop => {
              const ownerEmail = ownerEmailMap.get(shop.owner_id) ?? '(sin email)'
              const barberStats = barbersByShop.get(shop.id) ?? { total: 0, active: 0 }
              const queueCount = queueByShop.get(shop.id) ?? 0

              return (
                <li
                  key={shop.id}
                  className="md:grid md:grid-cols-[2.5fr_2fr_1fr_1fr_1fr_auto] md:gap-4 md:items-center px-5 py-4 border-b border-nxtup-line last:border-b-0 flex flex-col gap-3"
                >
                  {/* Shop name + logo */}
                  <div className="flex items-center gap-3 min-w-0">
                    {shop.logo_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shop.logo_url}
                        alt=""
                        className="w-9 h-9 rounded-md object-cover flex-shrink-0 bg-white"
                      />
                    ) : (
                      <div className="w-9 h-9 rounded-md bg-nxtup-dim flex items-center justify-center flex-shrink-0">
                        <span className="text-white text-xs font-bold">
                          {shop.name.slice(0, 2).toUpperCase()}
                        </span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="text-white text-sm font-bold truncate">{shop.name}</p>
                      <p className="text-nxtup-muted text-[10px] font-mono truncate" title={shop.id}>
                        {shop.id}
                      </p>
                    </div>
                  </div>

                  {/* Owner */}
                  <div className="min-w-0 text-xs text-nxtup-muted truncate" title={ownerEmail}>
                    {ownerEmail}
                  </div>

                  {/* Status */}
                  <div>
                    <span
                      className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded ${
                        shop.is_open
                          ? 'bg-nxtup-active/20 text-nxtup-active'
                          : 'bg-nxtup-dim/30 text-nxtup-muted'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          shop.is_open ? 'bg-nxtup-active' : 'bg-nxtup-dim'
                        }`}
                      />
                      {shop.is_open ? 'Abierto' : 'Cerrado'}
                    </span>
                  </div>

                  {/* Barbers */}
                  <div className="text-sm text-white tabular-nums">
                    {barberStats.active}
                    <span className="text-nxtup-muted">/{barberStats.total}</span>
                  </div>

                  {/* Queue */}
                  <div className="text-sm text-white tabular-nums">{queueCount}</div>

                  {/* Actions */}
                  <div className="flex gap-2 md:justify-end">
                    <Link
                      href={`/admin/panel-tokens?shop=${shop.id}`}
                      className="rounded-md border border-nxtup-dim text-white px-3 py-1.5 text-[11px] font-bold tracking-wider uppercase hover:border-white transition-colors"
                    >
                      Link temporal
                    </Link>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </main>
  )
}
