import Link from 'next/link'
import FloorTabs from '../../FloorTabs'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import { barberPercent } from '@/lib/tickets'
import {
  aggregateReport,
  resolvePeriod,
  type ReportLine,
  type SettlementTotals,
} from '@/lib/ticket-report'
import { PrintButton } from '../CuentasClient'

export const metadata = { title: 'Reportes — NXTUP' }

/**
 * Cuentas → Reportes (082): cualquier periodo (hoy / semana / mes /
 * rango), liquidado o no. Totales de la barbería, tabla por barbero y
 * desglose por servicio; imprimible. Periodos en la hora LOCAL del
 * shop y % congelado para líneas liquidadas (ver lib/ticket-report).
 * Sin JS: el selector son links y el rango un <form method="get">.
 */
export default async function ReportesPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const sp = await searchParams
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

  const { data: cfgRow } = await supabase
    .from('shops')
    .select('tickets_enabled, barber_split_percent')
    .eq('id', shop.id)
    .maybeSingle()
  const cfg = cfgRow as { tickets_enabled?: boolean; barber_split_percent?: number } | null
  if (!cfg?.tickets_enabled) redirect('/dashboard/cuentas')

  const tz = shop.timezone ?? 'America/New_York'
  const range = resolvePeriod(sp.period, sp.from, sp.to, tz)

  const [{ data: barbers }, { data: lines }] = await Promise.all([
    supabase.from('barbers').select('id, name, split_percent').eq('shop_id', shop.id),
    supabase
      .from('tickets')
      .select('barber_id, service_name, amount, settlement_id')
      .eq('shop_id', shop.id)
      .eq('status', 'confirmed')
      .gte('created_at', range.startIso)
      .lt('created_at', range.endIso)
      .limit(5000),
  ])

  // % congelados de los cierres que tocan este periodo.
  const settlementIds = Array.from(
    new Set((lines ?? []).map(l => l.settlement_id).filter((x): x is string => !!x)),
  )
  const frozen = new Map<string, SettlementTotals>()
  if (settlementIds.length > 0) {
    const { data: sets } = await supabase
      .from('settlements')
      .select('id, totals')
      .in('id', settlementIds)
    for (const s of sets ?? []) frozen.set(s.id, (s.totals as SettlementTotals) ?? [])
  }

  const shopDefault = cfg.barber_split_percent ?? 60
  const names = new Map((barbers ?? []).map(b => [b.id, b.name]))
  const report = aggregateReport(
    (lines ?? []) as ReportLine[],
    id =>
      barberPercent(
        shopDefault,
        (barbers ?? []).find(b => b.id === id)?.split_percent ?? null,
      ),
    frozen,
  )

  const fmtYmd = (ymd: string) =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  const rangeLabel =
    range.fromYmd === range.toYmd
      ? fmtYmd(range.fromYmd)
      : `${fmtYmd(range.fromYmd)} – ${fmtYmd(range.toYmd)}`

  const tabs: { key: string; label: string; href: string }[] = [
    { key: 'today', label: t('reports.today'), href: '?period=today' },
    { key: 'week', label: t('reports.week'), href: '?period=week' },
    { key: 'month', label: t('reports.month'), href: '?period=month' },
  ]

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      <FloorTabs showAccounts />
      <Link
        href="/dashboard/cuentas"
        className="print:hidden text-nxtup-dim text-xs underline underline-offset-4"
      >
        ← {t('tickets.title')}
      </Link>
      <div className="flex items-start justify-between gap-4 mt-2 mb-1">
        <h1 className="text-3xl font-black tracking-tight">{t('reports.title')}</h1>
        <PrintButton />
      </div>
      <p className="text-nxtup-muted text-sm mb-6">
        {shop.name} · {rangeLabel}
      </p>

      {/* Selector de periodo */}
      <div className="print:hidden flex flex-col gap-3 mb-8">
        <div className="grid grid-cols-3 gap-1 border border-nxtup-line rounded-xl p-1">
          {tabs.map(tab => (
            <Link
              key={tab.key}
              href={tab.href}
              className={`rounded-lg px-1 py-2 text-center text-xs sm:text-sm font-bold transition-colors ${
                range.period === tab.key
                  ? 'bg-nxtup-line text-white'
                  : 'text-nxtup-muted hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        <form method="get" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="range" />
          <label className="flex flex-col gap-1 text-xs text-nxtup-muted">
            {t('reports.from')}
            <input
              type="date"
              name="from"
              defaultValue={range.fromYmd}
              required
              className="bg-nxtup-line text-white rounded-lg px-3 py-2 border border-nxtup-dim focus:border-white focus:outline-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-nxtup-muted">
            {t('reports.to')}
            <input
              type="date"
              name="to"
              defaultValue={range.toYmd}
              required
              className="bg-nxtup-line text-white rounded-lg px-3 py-2 border border-nxtup-dim focus:border-white focus:outline-none"
            />
          </label>
          <button
            type="submit"
            className={`rounded-lg px-4 py-2 text-sm font-bold border transition-colors ${
              range.period === 'range'
                ? 'border-white text-white'
                : 'border-nxtup-line text-nxtup-muted hover:border-white hover:text-white'
            }`}
          >
            {t('reports.apply')}
          </button>
        </form>
      </div>

      {report.count === 0 ? (
        <p className="text-nxtup-dim text-sm">{t('reports.empty')}</p>
      ) : (
        <>
          {/* Totales de la barbería */}
          <section className="grid grid-cols-3 gap-3 mb-8">
            {[
              { label: t('reports.generated'), value: report.total, tone: 'text-white' },
              { label: t('reports.barbersPart'), value: report.barber_part, tone: 'text-nxtup-active' },
              { label: t('reports.housePart'), value: report.house_part, tone: 'text-white' },
            ].map(k => (
              <div key={k.label} className="border border-nxtup-line rounded-xl p-3 print:border-black">
                <p className="text-nxtup-muted text-[10px] uppercase tracking-widest font-bold mb-1">
                  {k.label}
                </p>
                <p className={`text-xl sm:text-2xl font-black tabular-nums ${k.tone}`}>
                  ${k.value}
                </p>
              </div>
            ))}
          </section>

          {/* Por barbero */}
          <section className="mb-8">
            <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
              {t('reports.byBarber')}
            </p>
            <div className="border border-nxtup-line rounded-2xl divide-y divide-nxtup-line overflow-hidden print:border-black">
              {report.perBarber.map(b => (
                <div key={b.barber_id} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-white font-bold truncate">
                      {names.get(b.barber_id) ?? '—'}
                    </span>
                    <span className="block text-nxtup-dim text-xs">
                      {t('tickets.row.count', { n: String(b.count) })}
                    </span>
                  </span>
                  <span className="text-right tabular-nums">
                    <span className="block text-white font-black">${b.total}</span>
                    <span className="block text-xs">
                      <span className="text-nxtup-active">${b.barber_part}</span>
                      <span className="text-nxtup-dim"> · ${b.house_part}</span>
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-nxtup-dim text-[11px] mt-1.5">{t('reports.barberLegend')}</p>
          </section>

          {/* Por servicio */}
          <section>
            <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
              {t('reports.byService')}
            </p>
            <div className="border border-nxtup-line rounded-2xl divide-y divide-nxtup-line overflow-hidden print:border-black">
              {report.perService.map(s => (
                <div key={s.name} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-white text-sm">
                    {s.name} <span className="text-nxtup-dim">× {s.count}</span>
                  </span>
                  <span className="text-white font-bold tabular-nums">${s.total}</span>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  )
}
