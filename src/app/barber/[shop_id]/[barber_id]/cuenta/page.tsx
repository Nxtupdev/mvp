import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { barberPercent, barberTotals, type TicketRow } from '@/lib/tickets'
import PendingFill from './PendingFill'

export const metadata = { title: 'Mi cuenta — NXTUP' }

/**
 * Mi cuenta (082) — lo que el barbero ve de SU dinero, y SOLO lo suyo
 * (jamás números de otros barberos ni de la casa). Mismo modelo de
 * acceso que su panel (el link es la identidad); el PIN de 4 dígitos
 * quedó pospuesto por Francisco (ver memoria nxtup-pin-barbero).
 *
 * Secciones: POR LIQUIDAR (sus líneas sin cierre, agrupadas por día,
 * con su total y su parte al % vigente) + LIQUIDACIONES (su fila de
 * cada comprobante congelado).
 */
export default async function MiCuentaPage({
  params,
}: {
  params: Promise<{ shop_id: string; barber_id: string }>
}) {
  const { shop_id, barber_id } = await params
  const admin = createAdminClient()

  const [{ data: barber }, { data: shop }] = await Promise.all([
    admin
      .from('barbers')
      .select('id, name, split_percent')
      .eq('id', barber_id)
      .eq('shop_id', shop_id)
      .maybeSingle(),
    admin
      .from('shops')
      .select('id, name, tickets_enabled, barber_split_percent')
      .eq('id', shop_id)
      .maybeSingle(),
  ])
  if (!barber || !shop) notFound()

  const panelHref = `/barber/${shop_id}/${barber_id}`

  if (!shop.tickets_enabled) {
    return (
      <main className="min-h-screen px-5 py-8 max-w-md mx-auto">
        <p className="text-nxtup-muted text-sm">
          Las cuentas por porcentaje no están activadas en esta barbería.
        </p>
        <Link href={panelHref} className="text-nxtup-dim text-xs underline underline-offset-4">
          ← Volver a mi panel
        </Link>
      </main>
    )
  }

  const pct = barberPercent(shop.barber_split_percent, barber.split_percent)

  const [{ data: unsettled }, { data: settlements }, { data: services }] =
    await Promise.all([
      admin
        .from('tickets')
        .select('id, barber_id, service_name, amount, status, created_at')
        .eq('barber_id', barber_id)
        .is('settlement_id', null)
        .order('created_at', { ascending: false })
        .limit(500),
      admin
        .from('settlements')
        .select('id, created_at, range_start, range_end, totals')
        .eq('shop_id', shop_id)
        .order('created_at', { ascending: false })
        .limit(20),
      admin
        .from('services')
        .select('id, name, price')
        .eq('shop_id', shop_id)
        .eq('active', true)
        .order('sort_order', { ascending: true }),
    ])

  const rows = (unsettled ?? []) as TicketRow[]
  const totals = barberTotals(rows, pct)

  // Agrupar por día (como el papelito).
  const byDay = new Map<string, TicketRow[]>()
  for (const r of rows) {
    const day = new Date(r.created_at).toLocaleDateString('es', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    })
    byDay.set(day, [...(byDay.get(day) ?? []), r])
  }

  // Mi fila dentro de cada comprobante congelado.
  type SettleTotal = {
    barber_id: string
    percent: number
    count: number
    total: number
    barber_part: number
  }
  const mySettlements = (settlements ?? [])
    .map(s => {
      const mine = (s.totals as SettleTotal[] | null)?.find(
        t => t.barber_id === barber_id,
      )
      return mine ? { id: s.id, created_at: s.created_at, mine } : null
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return (
    <main className="min-h-screen px-5 py-8 max-w-md mx-auto flex flex-col gap-6">
      <div>
        <Link href={panelHref} className="text-nxtup-dim text-xs underline underline-offset-4">
          ← Mi panel
        </Link>
        <h1 className="text-3xl font-black tracking-tight mt-2">Mi cuenta</h1>
        <p className="text-nxtup-muted text-sm">
          {barber.name} · {shop.name} · tu parte: {pct}%
        </p>
      </div>

      {/* Por liquidar */}
      <section className="border border-nxtup-active/40 rounded-2xl p-5">
        <p className="text-nxtup-active text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
          Por liquidar
        </p>
        <div className="flex items-end justify-between mb-1">
          <p className="text-4xl font-black tabular-nums">${totals.barber_part}</p>
          <p className="text-nxtup-muted text-sm tabular-nums">
            de ${totals.total} · {totals.count} servicios
          </p>
        </div>
        {totals.pending > 0 && (
          <p className="text-nxtup-break text-xs mb-2">
            {totals.pending} línea(s) sin servicio — complétalas abajo para que
            entren al cierre.
          </p>
        )}
      </section>

      {/* Líneas por día */}
      <section className="flex flex-col gap-4">
        {rows.length === 0 && (
          <p className="text-nxtup-dim text-sm">
            Aún no hay servicios sin liquidar. Cierra un cliente y marca qué le
            hiciste: aparecerá aquí.
          </p>
        )}
        {Array.from(byDay.entries()).map(([day, dayRows]) => (
          <div key={day}>
            <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
              {day}
            </p>
            <div className="flex flex-col gap-1.5">
              {dayRows.map(r =>
                r.status === 'pending' ? (
                  <PendingFill
                    key={r.id}
                    barberId={barber_id}
                    ticketId={r.id}
                    services={services ?? []}
                  />
                ) : (
                  <div
                    key={r.id}
                    className="flex items-center justify-between border border-nxtup-line rounded-lg px-3 py-2"
                  >
                    <span className="text-sm text-white">{r.service_name ?? '—'}</span>
                    <span className="text-sm font-bold tabular-nums">
                      ${Number(r.amount)}
                    </span>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
      </section>

      {/* Liquidaciones */}
      <section>
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
          Liquidaciones
        </p>
        {mySettlements.length === 0 ? (
          <p className="text-nxtup-dim text-sm">Todavía no hay cierres.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mySettlements.map(s => (
              <div
                key={s.id}
                className="flex items-center justify-between border border-nxtup-line rounded-lg px-3 py-2.5"
              >
                <span className="text-xs text-nxtup-muted">
                  {new Date(s.created_at).toLocaleDateString('es', {
                    day: 'numeric',
                    month: 'short',
                  })}{' '}
                  · {s.mine.count} servicios · {s.mine.percent}%
                </span>
                <span className="text-sm font-bold text-nxtup-active tabular-nums">
                  ${s.mine.barber_part}
                </span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
