import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolvePeriod } from '@/lib/ticket-report'
import BarberTabBar from '../BarberTabBar'
import PendingFill from '../cuenta/PendingFill'
import ServiceSheetButton from './ServiceSheetButton'

export const metadata = { title: 'Mis clientes — NXTUP' }

/**
 * Mis clientes (25-oct, idea de Francisco): el día del barbero, cliente
 * por cliente, con lo que se le marcó. Visible para TODAS las barberías
 * (ver a quién atendiste hoy sirve siempre); los servicios, las líneas
 * pendientes y "+ Registrar servicio" solo con cuentas por porcentaje.
 *
 * Fuentes del día (hora LOCAL de la barbería):
 *   * Turnos de la cola de este barbero: los terminados hoy + los que
 *     tiene ahora (llamado / en silla).
 *   * Tickets de hoy: los del cierre (con turno) y los MANUALES (sin
 *     turno, citas atendidas de corrido — 083).
 *   * Tickets PENDIENTES de días anteriores (que no se pierdan).
 * Admin client: la página es anónima (link del barbero) y los grants
 * por columna de la 069 no exponen todo a anon. Sin teléfonos.
 */

type Entry = {
  id: string
  client_name: string | null
  status: string
  called_at: string | null
  completed_at: string | null
  created_at: string
}

type Ticket = {
  id: string
  entry_id: string | null
  service_name: string | null
  amount: number
  status: string
  created_at: string
}

type Row =
  | { kind: 'entry'; at: string; entry: Entry; tickets: Ticket[] }
  | { kind: 'manual'; at: string; name: string | null; tickets: Ticket[] }

export default async function MisClientesPage({
  params,
}: {
  params: Promise<{ shop_id: string; barber_id: string }>
}) {
  const { shop_id, barber_id } = await params
  const admin = createAdminClient()

  const [{ data: barber }, { data: shop }] = await Promise.all([
    admin.from('barbers').select('id, name').eq('id', barber_id).eq('shop_id', shop_id).maybeSingle(),
    admin.from('shops').select('id, timezone').eq('id', shop_id).maybeSingle(),
  ])
  if (!barber || !shop) notFound()

  // Fail-open: sin la 082 la feature de cuentas simplemente no aparece.
  const { data: cfg } = await admin
    .from('shops')
    .select('tickets_enabled')
    .eq('id', shop_id)
    .maybeSingle()
  const ticketsEnabled = Boolean((cfg as { tickets_enabled?: boolean } | null)?.tickets_enabled)

  const tz = (shop as { timezone?: string | null }).timezone ?? 'America/New_York'
  const today = resolvePeriod('today', undefined, undefined, tz)

  const [{ data: doneToday }, { data: active }] = await Promise.all([
    admin
      .from('queue_entries')
      .select('id, client_name, status, called_at, completed_at, created_at')
      .eq('barber_id', barber_id)
      .eq('shop_id', shop_id)
      .eq('status', 'done')
      .gte('completed_at', today.startIso)
      .lt('completed_at', today.endIso)
      .limit(200),
    admin
      .from('queue_entries')
      .select('id, client_name, status, called_at, completed_at, created_at')
      .eq('barber_id', barber_id)
      .eq('shop_id', shop_id)
      .in('status', ['called', 'in_progress'])
      .limit(20),
  ])

  let tickets: Ticket[] = []
  const names = new Map<string, string>()
  let services: { id: string; name: string; price: number | null }[] = []
  if (ticketsEnabled) {
    const [{ data: todayTickets }, { data: oldPending }, { data: svc }] = await Promise.all([
      admin
        .from('tickets')
        .select('id, entry_id, service_name, amount, status, created_at')
        .eq('barber_id', barber_id)
        .gte('created_at', today.startIso)
        .lt('created_at', today.endIso)
        .limit(500),
      admin
        .from('tickets')
        .select('id, entry_id, service_name, amount, status, created_at')
        .eq('barber_id', barber_id)
        .eq('status', 'pending')
        .lt('created_at', today.startIso)
        .limit(50),
      admin
        .from('services')
        .select('id, name, price')
        .eq('shop_id', shop_id)
        .eq('active', true)
        .order('sort_order', { ascending: true }),
    ])
    tickets = [...((todayTickets ?? []) as Ticket[]), ...((oldPending ?? []) as Ticket[])]
    services = svc ?? []
    // Nombres de las líneas manuales (083), aparte y fail-open.
    const manualIds = tickets.filter(t => !t.entry_id).map(t => t.id)
    if (manualIds.length > 0) {
      const { data: nameRows } = await admin
        .from('tickets')
        .select('id, client_name')
        .in('id', manualIds)
      for (const r of (nameRows ?? []) as { id: string; client_name: string | null }[]) {
        if (r.client_name) names.set(r.id, r.client_name)
      }
    }
  }

  // ── Armar las filas del día ──────────────────────────────────────
  const entries = [...((active ?? []) as Entry[]), ...((doneToday ?? []) as Entry[])]
  const byEntry = new Map<string, Ticket[]>()
  const manual: Ticket[] = []
  for (const t of tickets) {
    if (t.entry_id) byEntry.set(t.entry_id, [...(byEntry.get(t.entry_id) ?? []), t])
    else manual.push(t)
  }

  const rows: Row[] = entries.map(e => ({
    kind: 'entry',
    at: e.completed_at ?? e.called_at ?? e.created_at,
    entry: e,
    tickets: byEntry.get(e.id) ?? [],
  }))
  // Tickets con turno que no está en la lista (turno de otro día con
  // pendiente vieja): se muestran como manuales para no perderlos.
  const listedEntries = new Set(entries.map(e => e.id))
  for (const [entryId, ts] of byEntry) {
    if (!listedEntries.has(entryId)) manual.push(...ts)
  }
  // Un registro manual con varios servicios comparte created_at y nombre.
  const manualGroups = new Map<string, Ticket[]>()
  for (const t of manual) {
    const key = `${t.created_at}|${names.get(t.id) ?? ''}`
    manualGroups.set(key, [...(manualGroups.get(key) ?? []), t])
  }
  for (const [, ts] of manualGroups) {
    rows.push({ kind: 'manual', at: ts[0].created_at, name: names.get(ts[0].id) ?? null, tickets: ts })
  }
  rows.sort((a, z) => Date.parse(z.at) - Date.parse(a.at))

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es', { hour: 'numeric', minute: '2-digit', timeZone: tz })
  const clientCount = rows.length

  return (
    <main className="min-h-[100dvh] px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))] max-w-md mx-auto flex flex-col gap-5">
      <BarberTabBar shopId={shop_id} barberId={barber_id} ticketsEnabled={ticketsEnabled} />
      <div>
        <h1 className="text-3xl font-black tracking-tight">Mis clientes</h1>
        <p className="text-nxtup-muted text-sm">
          {barber.name} · hoy · {clientCount} {clientCount === 1 ? 'cliente' : 'clientes'}
        </p>
      </div>

      {ticketsEnabled && services.length > 0 && (
        <ServiceSheetButton barberId={barber_id} services={services} label="+ Registrar servicio" />
      )}

      {rows.length === 0 ? (
        <p className="text-nxtup-dim text-sm">
          Todavía no has atendido clientes hoy.
          {ticketsEnabled ? ' Si atiendes una cita, regístrala con el botón de arriba.' : ''}
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map(r => {
            const confirmed = r.tickets.filter(t => t.status === 'confirmed')
            const pending = r.tickets.filter(t => t.status === 'pending')
            const total = confirmed.reduce((s, t) => s + Number(t.amount), 0)
            const name =
              r.kind === 'entry' ? r.entry.client_name ?? 'Cliente' : r.name ?? 'Cliente'
            const tag =
              r.kind === 'manual'
                ? 'registrado'
                : r.entry.status === 'in_progress'
                  ? 'en tu silla'
                  : r.entry.status === 'called'
                    ? 'llamado'
                    : null
            return (
              <div
                key={r.kind === 'entry' ? r.entry.id : r.tickets[0].id}
                className="border border-nxtup-line rounded-xl px-4 py-3 flex flex-col gap-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-white font-bold truncate">
                      {name}
                      {tag && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider font-bold text-nxtup-dim">
                          {tag}
                        </span>
                      )}
                    </p>
                    <p className="text-nxtup-dim text-xs">{fmtTime(r.at)}</p>
                  </div>
                  {ticketsEnabled && confirmed.length > 0 && (
                    <p className="text-white font-black tabular-nums">${Math.round(total * 100) / 100}</p>
                  )}
                </div>
                {ticketsEnabled && confirmed.length > 0 && (
                  <p className="text-nxtup-muted text-sm">
                    {confirmed.map(t => t.service_name ?? '—').join(' · ')}
                  </p>
                )}
                {ticketsEnabled &&
                  pending.map(t => (
                    <PendingFill key={t.id} barberId={barber_id} ticketId={t.id} services={services} />
                  ))}
                {ticketsEnabled &&
                  r.kind === 'entry' &&
                  r.tickets.length === 0 &&
                  r.entry.status === 'done' &&
                  services.length > 0 && (
                    <ServiceSheetButton
                      barberId={barber_id}
                      services={services}
                      entryId={r.entry.id}
                      fixedName={r.entry.client_name}
                      variant="inline"
                      label="Sin servicio marcado · marcar"
                    />
                  )}
              </div>
            )
          })}
        </div>
      )}
    </main>
  )
}
