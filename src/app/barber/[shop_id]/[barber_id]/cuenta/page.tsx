import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { barberPercent, barberTotals, type TicketRow } from '@/lib/tickets'
import {
  aggregateReport,
  resolvePeriod,
  type ReportLine,
  type SettlementTotals,
} from '@/lib/ticket-report'
import PendingFill from './PendingFill'
import BarberTabBar from '../BarberTabBar'

export const metadata = { title: 'Mi cuenta — NXTUP' }

/**
 * Mi cuenta (082) — lo que el barbero ve de SU dinero, y SOLO lo suyo
 * (jamás números de otros barberos ni de la casa). Mismo modelo de
 * acceso que su panel (el link es la identidad); el PIN de 4 dígitos
 * quedó pospuesto por Francisco (ver memoria nxtup-pin-barbero).
 *
 * Secciones: MI REPORTE (cualquier periodo: hoy/semana/mes/rango,
 * liquidado o no — "¿cuánto gané este mes?"), POR LIQUIDAR (sus líneas
 * sin cierre, agrupadas por día) + LIQUIDACIONES (su fila de cada
 * comprobante congelado).
 */
export default async function MiCuentaPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop_id: string; barber_id: string }>
  searchParams: Promise<{ period?: string; from?: string; to?: string }>
}) {
  const { shop_id, barber_id } = await params
  const sp = await searchParams
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
      .select('id, name, timezone, tickets_enabled, barber_split_percent')
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

  // ── Mi reporte por periodo (solo lo suyo; % congelado en lo liquidado)
  const tz = shop.timezone ?? 'America/New_York'
  const range = resolvePeriod(sp.period, sp.from, sp.to, tz)
  const { data: periodLines } = await admin
    .from('tickets')
    .select('barber_id, service_name, amount, settlement_id')
    .eq('barber_id', barber_id)
    .eq('status', 'confirmed')
    .gte('created_at', range.startIso)
    .lt('created_at', range.endIso)
    .limit(2000)
  // % congelados de EXACTAMENTE los cierres que toca el periodo (no los
  // 20 recientes de la lista: un rango viejo puede tocar cierres viejos).
  const periodSettlementIds = Array.from(
    new Set((periodLines ?? []).map(l => l.settlement_id).filter((x): x is string => !!x)),
  )
  const frozen = new Map<string, SettlementTotals>()
  if (periodSettlementIds.length > 0) {
    const { data: periodSets } = await admin
      .from('settlements')
      .select('id, totals')
      .in('id', periodSettlementIds)
    for (const st of periodSets ?? []) {
      frozen.set(st.id, (st.totals as SettlementTotals) ?? [])
    }
  }
  const myReport = aggregateReport(
    (periodLines ?? []) as ReportLine[],
    () => pct,
    frozen,
  )
  const mine = myReport.perBarber[0]
  const periodTabs = [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Esta semana' },
    { key: 'month', label: 'Este mes' },
  ]
  const fmtYmd = (ymd: string) =>
    new Date(`${ymd}T12:00:00`).toLocaleDateString('es', { day: 'numeric', month: 'short' })

  const rows = (unsettled ?? []) as TicketRow[]
  const totals = barberTotals(rows, pct)

  // Agrupar por día (como el papelito) — en la hora LOCAL de la
  // barbería: sin timeZone, el servidor (UTC) ponía un corte del
  // viernes 9pm bajo "sábado" (caso Prueba Barber, 23-oct).
  const byDay = new Map<string, TicketRow[]>()
  for (const r of rows) {
    const day = new Date(r.created_at).toLocaleDateString('es', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
      timeZone: tz,
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
    <main className="min-h-[100dvh] px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] max-w-md mx-auto flex flex-col gap-6">
      {/* Marco de app (23-oct): sin "← Mi panel" — la barra inferior
          lleva la navegación, como en cualquier app instalada. */}
      <BarberTabBar shopId={shop_id} barberId={barber_id} ticketsEnabled />
      <div>
        <h1 className="text-3xl font-black tracking-tight">Mi cuenta</h1>
        <p className="text-nxtup-muted text-sm">
          {barber.name} · {shop.name} · tu parte: {pct}%
        </p>
      </div>

      {/* Mi reporte por periodo */}
      <section className="border border-nxtup-line rounded-2xl p-5 flex flex-col gap-3">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
          Mi reporte
        </p>
        <div className="grid grid-cols-3 gap-1 border border-nxtup-line rounded-xl p-1">
          {periodTabs.map(tab => (
            <Link
              key={tab.key}
              href={`?period=${tab.key}`}
              className={`rounded-lg px-1 py-2 text-center text-xs font-bold transition-colors ${
                range.period === tab.key
                  ? 'bg-nxtup-line text-white'
                  : 'text-nxtup-muted hover:text-white'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </div>
        {/* Rango libre detrás de "Otras fechas" (23-oct: con las fechas
            precargadas iguales al periodo visto, tocar Ver no cambiaba
            nada y parecía roto). Abierto solo si el rango está activo. */}
        <details open={range.period === 'range'} className="group">
          <summary
            className={`list-none cursor-pointer text-xs font-bold underline underline-offset-4 [&::-webkit-details-marker]:hidden ${
              range.period === 'range' ? 'text-white' : 'text-nxtup-muted'
            }`}
          >
            Otras fechas
          </summary>
          <form method="get" className="mt-2 grid grid-cols-2 gap-2">
            <input type="hidden" name="period" value="range" />
            <label className="flex flex-col gap-1 text-[11px] text-nxtup-muted min-w-0">
              Desde
              <input
                type="date"
                name="from"
                defaultValue={range.fromYmd}
                required
                className="w-full min-w-0 bg-nxtup-line text-white rounded-lg px-2 py-2 text-sm border border-nxtup-dim"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] text-nxtup-muted min-w-0">
              Hasta
              <input
                type="date"
                name="to"
                defaultValue={range.toYmd}
                required
                className="w-full min-w-0 bg-nxtup-line text-white rounded-lg px-2 py-2 text-sm border border-nxtup-dim"
              />
            </label>
            <button
              type="submit"
              className="col-span-2 rounded-lg px-3 py-2.5 text-sm font-bold bg-white text-black active:scale-[0.98] transition"
            >
              Ver estas fechas
            </button>
          </form>
        </details>
        <p
          className={`text-sm font-bold ${
            range.period === 'range' ? 'text-white' : 'text-nxtup-dim'
          }`}
        >
          {range.period === 'range' ? 'Fechas: ' : ''}
          {range.fromYmd === range.toYmd
            ? fmtYmd(range.fromYmd)
            : `${fmtYmd(range.fromYmd)} – ${fmtYmd(range.toYmd)}`}
        </p>
        {mine ? (
          <>
            <div className="flex items-end justify-between">
              <p className="text-4xl font-black tabular-nums text-nxtup-active">
                ${mine.barber_part}
              </p>
              <p className="text-nxtup-muted text-sm tabular-nums">
                de ${mine.total} · {mine.count} servicios
              </p>
            </div>
            <div className="flex flex-col gap-1">
              {myReport.perService.map(sv => (
                <div key={sv.name} className="flex items-center justify-between text-sm">
                  <span className="text-white">
                    {sv.name} <span className="text-nxtup-dim">× {sv.count}</span>
                  </span>
                  <span className="font-bold tabular-nums">${sv.total}</span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="text-nxtup-dim text-sm">Sin servicios en este periodo.</p>
        )}
      </section>

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
                    timeZone: tz,
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
