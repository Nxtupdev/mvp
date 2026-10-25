import Link from 'next/link'
import FloorTabs from '../FloorTabs'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import { barberPercent, barberTotals, type TicketRow } from '@/lib/tickets'
import { SettleButton, PrintButton, SplitRow, TicketLineAdmin } from './CuentasClient'

export const metadata = { title: 'Cuentas — NXTUP' }

/**
 * Cuentas del dueño (082): el papelito, digital. Líneas confirmadas sin
 * liquidar agrupadas por barbero y por día, totales con el % de cada
 * uno, deslizador de override, botón "Cerrar cuentas" (liquida y
 * congela el comprobante) e historial de cierres. Lee con la RLS del
 * dueño; las acciones van por rutas (service role).
 */
export default async function CuentasPage() {
  const { locale, t } = await getServerI18n()
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, timezone')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')
  // Etiquetas de día en la hora LOCAL de la barbería (sin esto el
  // servidor, en UTC, ponía cortes del viernes 9pm bajo "sábado").
  const tz = (shop as { timezone?: string | null }).timezone ?? 'America/New_York'

  // Fail-open (082 sin correr → feature apagada).
  const { data: cfgRow } = await supabase
    .from('shops')
    .select('tickets_enabled, barber_split_percent')
    .eq('id', shop.id)
    .maybeSingle()
  const cfg = cfgRow as
    | { tickets_enabled?: boolean; barber_split_percent?: number }
    | null

  if (!cfg?.tickets_enabled) {
    return (
      <main className="flex-1 px-4 sm:px-6 py-8 max-w-2xl w-full mx-auto">
        <h1 className="text-3xl font-black tracking-tight mb-2">{t('tickets.title')}</h1>
        <p className="text-nxtup-muted text-sm mb-6">{t('tickets.disabled')}</p>
        <Link
          href="/dashboard/settings"
          className="inline-flex items-center gap-2 rounded-lg border border-nxtup-line px-5 py-2.5 text-sm font-bold hover:border-white transition-colors"
        >
          {t('tickets.goSettings')} →
        </Link>
      </main>
    )
  }
  const shopDefault = cfg.barber_split_percent ?? 60

  const [{ data: barbers }, { data: unsettled }, { data: settlements }, { data: services }] =
    await Promise.all([
      supabase
        .from('barbers')
        .select('id, name, split_percent')
        .eq('shop_id', shop.id)
        .order('name'),
      supabase
        .from('tickets')
        .select('id, barber_id, service_name, amount, status, created_at')
        .eq('shop_id', shop.id)
        .is('settlement_id', null)
        .order('created_at', { ascending: false })
        .limit(1000),
      supabase
        .from('settlements')
        .select('id, created_at, range_start, range_end, totals')
        .eq('shop_id', shop.id)
        .order('created_at', { ascending: false })
        .limit(12),
      supabase
        .from('services')
        .select('id, name, price')
        .eq('shop_id', shop.id)
        .eq('active', true)
        .order('sort_order', { ascending: true }),
    ])

  const rows = (unsettled ?? []) as TicketRow[]
  const confirmedCount = rows.filter(r => r.status === 'confirmed').length
  const pendingCount = rows.length - confirmedCount
  const grandTotal =
    Math.round(
      rows
        .filter(r => r.status === 'confirmed')
        .reduce((s, r) => s + Number(r.amount), 0) * 100,
    ) / 100

  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: tz,
    })

  type SettleTotal = {
    barber_id: string
    name: string
    percent: number
    count: number
    total: number
    barber_part: number
    house_part: number
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      {/* Cuentas vive en el selector del piso (25-oct), junto a Live,
          Stats y Clientes. */}
      <FloorTabs showAccounts />
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-3xl font-black tracking-tight">{t('tickets.title')}</h1>
        <PrintButton />
      </div>
      <p className="text-nxtup-muted text-sm mb-6">{shop.name}</p>

      {/* Reportes por periodo (hoy/semana/mes/rango), liquidado o no. */}
      <Link
        href="/dashboard/cuentas/reportes"
        className="print:hidden flex items-center justify-between gap-3 border border-nxtup-line rounded-xl px-4 py-3 mb-6 hover:border-white transition-colors group"
      >
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm">{t('reports.title')}</p>
          <p className="text-nxtup-dim text-xs">{t('reports.linkHint')}</p>
        </div>
        <span
          className="text-nxtup-muted group-hover:text-white transition-colors flex-shrink-0"
          aria-hidden
        >
          →
        </span>
      </Link>

      {/* Por liquidar + cierre */}
      <section className="border border-nxtup-active/40 rounded-2xl p-6 mb-8 print:border-black">
        <p className="text-nxtup-active text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
          {t('tickets.unsettled')}
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-4xl font-black tabular-nums">${grandTotal}</p>
            <p className="text-nxtup-muted text-sm">
              {t('tickets.unsettledMeta', { n: String(confirmedCount) })}
            </p>
            {pendingCount > 0 && (
              <p className="text-nxtup-break text-xs mt-1">
                {t('tickets.pendingNote', { n: String(pendingCount) })}
              </p>
            )}
          </div>
          <div className="print:hidden">
            <SettleButton unsettledCount={confirmedCount} pendingCount={pendingCount} />
          </div>
        </div>
      </section>

      {/* Por barbero (rediseño 23-oct, pedido de Francisco: con 15
          barberos las tarjetas abiertas eran un scroll eterno). Una FILA
          por barbero (orden por producción, punto naranja si tiene
          pendientes) y el detalle a un toque con <details> nativo: sin
          JS, accesible, y el reparto escondido tras "cambiar". */}
      <section className="mb-10">
        {(() => {
          const list = (barbers ?? [])
            .map(b => {
              const bRows = rows.filter(r => r.barber_id === b.id)
              const pct = barberPercent(shopDefault, b.split_percent)
              return { b, bRows, pct, totals: barberTotals(bRows, pct) }
            })
            .filter(x => x.bRows.length > 0)
            .sort((a, z) => z.totals.total - a.totals.total)

          if (list.length === 0) {
            return <p className="text-nxtup-dim text-sm">{t('tickets.empty')}</p>
          }

          return (
            <div className="border border-nxtup-line rounded-2xl divide-y divide-nxtup-line overflow-hidden print:border-black">
              {list.map(({ b, bRows, pct, totals }) => {
                const byDay = new Map<string, TicketRow[]>()
                for (const r of bRows) {
                  const d = fmtDay(r.created_at)
                  byDay.set(d, [...(byDay.get(d) ?? []), r])
                }
                return (
                  <details key={b.id} className="group">
                    <summary className="flex items-center gap-3 px-4 py-3.5 cursor-pointer list-none hover:bg-white/[0.03] transition-colors [&::-webkit-details-marker]:hidden">
                      <span className="flex-1 min-w-0 flex items-center gap-2">
                        <span className="text-white font-bold truncate">{b.name}</span>
                        {totals.pending > 0 && (
                          <span
                            className="h-2 w-2 rounded-full bg-nxtup-break flex-shrink-0"
                            aria-label={t('tickets.row.hasPending')}
                          />
                        )}
                      </span>
                      <span className="text-nxtup-dim text-xs tabular-nums hidden sm:inline">
                        {t('tickets.row.count', { n: String(totals.count) })}
                      </span>
                      <span className="text-right tabular-nums">
                        <span className="block text-white font-black">${totals.total}</span>
                        <span className="block text-nxtup-active text-xs">
                          {t('tickets.row.part', { amount: `$${totals.barber_part}` })}
                        </span>
                      </span>
                      <span
                        className="text-nxtup-muted transition-transform group-open:rotate-90 print:hidden"
                        aria-hidden
                      >
                        ›
                      </span>
                    </summary>

                    <div className="px-4 pb-4 pt-1 bg-white/[0.02]">
                      <SplitRow
                        barberId={b.id}
                        pct={pct}
                        hasOverride={b.split_percent !== null && b.split_percent !== undefined}
                      />
                      {Array.from(byDay.entries()).map(([day, dayRows]) => (
                        <div key={day} className="mt-3">
                          <p className="text-nxtup-dim text-[10px] uppercase tracking-[0.3em] font-bold mb-1.5">
                            {day}
                          </p>
                          <div className="flex flex-col gap-1">
                            {dayRows.map(r => (
                              <div
                                key={r.id}
                                className="flex items-center justify-between gap-3 border border-nxtup-line rounded-lg px-3 py-1.5"
                              >
                                <span
                                  className={`text-sm ${
                                    r.status === 'pending' ? 'text-nxtup-break' : 'text-white'
                                  }`}
                                >
                                  {r.status === 'pending'
                                    ? t('tickets.line.pending')
                                    : r.service_name ?? '—'}
                                </span>
                                <span className="flex items-center gap-3">
                                  <span className="text-sm font-bold tabular-nums">
                                    ${Number(r.amount)}
                                  </span>
                                  <TicketLineAdmin
                                    ticketId={r.id}
                                    services={services ?? []}
                                    isPending={r.status === 'pending'}
                                  />
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
          )
        })()}
      </section>

      {/* Historial de cierres */}
      <section>
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
          {t('tickets.history')}
        </p>
        {(settlements ?? []).length === 0 ? (
          <p className="text-nxtup-dim text-sm">{t('tickets.historyEmpty')}</p>
        ) : (
          <div className="flex flex-col gap-3">
            {(settlements ?? []).map(s => {
              const totals = (s.totals as SettleTotal[] | null) ?? []
              const sum = Math.round(totals.reduce((a, x) => a + x.total, 0) * 100) / 100
              return (
                <div key={s.id} className="border border-nxtup-line rounded-xl p-4 print:border-black">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-white font-bold text-sm">
                      {new Date(s.created_at).toLocaleDateString(locale, {
                        day: 'numeric',
                        month: 'long',
                        timeZone: tz,
                      })}
                    </p>
                    <p className="text-sm font-black tabular-nums">${sum}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    {totals.map(x => (
                      <p key={x.barber_id} className="text-xs text-nxtup-muted tabular-nums">
                        {x.name} · ${x.total} → {t('tickets.card.split', {
                          barber: `$${x.barber_part}`,
                          house: `$${x.house_part}`,
                          pct: String(x.percent),
                        })}
                      </p>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </main>
  )
}
