import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import { barberPercent, barberTotals, type TicketRow } from '@/lib/tickets'
import { SettleButton, PrintButton, BarberSplit, TicketLineAdmin } from './CuentasClient'

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
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

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
      <div className="flex items-start justify-between gap-4 mb-2">
        <h1 className="text-3xl font-black tracking-tight">{t('tickets.title')}</h1>
        <PrintButton />
      </div>
      <p className="text-nxtup-muted text-sm mb-8">{shop.name}</p>

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

      {/* Por barbero */}
      <section className="flex flex-col gap-6 mb-10">
        {(barbers ?? []).map(b => {
          const bRows = rows.filter(r => r.barber_id === b.id)
          if (bRows.length === 0) return null
          const pct = barberPercent(shopDefault, b.split_percent)
          const totals = barberTotals(bRows, pct)
          const byDay = new Map<string, TicketRow[]>()
          for (const r of bRows) {
            const d = fmtDay(r.created_at)
            byDay.set(d, [...(byDay.get(d) ?? []), r])
          }
          return (
            <div key={b.id} className="border border-nxtup-line rounded-2xl p-5 print:border-black">
              <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                <div>
                  <p className="text-white font-black text-xl">{b.name}</p>
                  <p className="text-nxtup-muted text-sm tabular-nums">
                    ${totals.total} · {t('tickets.card.split', {
                      barber: `$${totals.barber_part}`,
                      house: `$${totals.house_part}`,
                      pct: String(pct),
                    })}
                  </p>
                </div>
                <div className="w-56">
                  <BarberSplit
                    barberId={b.id}
                    initial={pct}
                    hasOverride={b.split_percent !== null && b.split_percent !== undefined}
                  />
                </div>
              </div>
              {Array.from(byDay.entries()).map(([day, dayRows]) => (
                <div key={day} className="mb-3">
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
          )
        })}
        {confirmedCount === 0 && pendingCount === 0 && (
          <p className="text-nxtup-dim text-sm">{t('tickets.empty')}</p>
        )}
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
