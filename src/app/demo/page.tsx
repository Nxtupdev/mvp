import Link from 'next/link'
import { Phone } from 'lucide-react'
import {
  buildBarberOrder,
  buildHeldPositions,
  sortByQueueOrder,
} from '@/lib/queue-order'
import { getDemoBoard } from '@/lib/demo-board'

// ISR: el tablero se re-renderiza a lo sumo cada 30s; el HTML cacheado se
// sirve a TODOS los visitantes → 1 golpe a la DB por intervalo, no por
// visitante. NO cambiar a force-dynamic ni agregar realtime.
export const revalidate = 30

export const metadata = {
  title: 'NXTUP — Demo en vivo',
  description:
    'Mira una barbería NXTUP funcionando en vivo: barberos, turnos y cola en tiempo real, sin trampa.',
}

// El TV corre en la tienda, pero /demo se renderiza en el server (UTC), así
// que la hora del ETA se formatea EXPLÍCITAMENTE en la zona del shop demo.
const SHOP_TZ = 'America/New_York'

function etaClock(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleTimeString('es', {
    timeZone: SHOP_TZ,
    hour: 'numeric',
    minute: '2-digit',
  })
}

const STATUS: Record<string, { label: string; dot: string; text: string }> = {
  available: { label: 'Disponible', dot: 'bg-nxtup-active', text: 'text-nxtup-active' },
  busy: { label: 'Ocupado', dot: 'bg-nxtup-busy', text: 'text-nxtup-busy' },
  break: { label: 'En descanso', dot: 'bg-nxtup-break', text: 'text-nxtup-break' },
}

export default async function DemoPage() {
  const board = await getDemoBoard()

  const order = buildBarberOrder(board.barbers)
  const held = buildHeldPositions(board.barbers)
  const barbers = sortByQueueOrder(board.barbers, order)

  // Cliente que cada barbero ocupado está atendiendo (in_progress / called).
  const clientByBarber = new Map<string, string>()
  for (const e of board.entries) {
    if ((e.status === 'in_progress' || e.status === 'called') && e.barber_id) {
      clientByBarber.set(e.barber_id, e.client_name)
    }
  }
  const waiting = board.entries.filter(e => e.status === 'waiting')

  return (
    <main className="min-h-screen bg-nxtup-bg text-white flex flex-col">
      <header className="flex items-center justify-between gap-3 px-5 sm:px-8 py-4 border-b border-nxtup-line">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-lg font-black tracking-tight">NXTUP</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-nxtup-active/15 text-nxtup-active px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap">
            <span className="h-1.5 w-1.5 rounded-full bg-nxtup-active animate-pulse" />
            Demo en vivo
          </span>
        </div>
        <Link
          href="/signup"
          className="flex-shrink-0 rounded-lg bg-white text-black px-4 py-2 text-xs font-bold uppercase tracking-wider hover:bg-nxtup-active transition-colors whitespace-nowrap"
        >
          Crea tu barbería
        </Link>
      </header>

      <div className="flex-1 w-full max-w-4xl mx-auto px-5 sm:px-8 py-8">
        <p className="text-nxtup-muted text-sm mb-1">{board.shopName}</p>
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight mb-8">
          Así se ve tu barbería, en vivo y sin trampa
        </h1>

        <section className="mb-10">
          <h2 className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-4">
            Barberos
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {barbers.map(b => {
              const s = STATUS[b.status] ?? STATUS.available
              const pos = order.get(b.id)
              const heldPos = held.get(b.id)
              const cutting = clientByBarber.get(b.id)
              return (
                <div
                  key={b.id}
                  className="flex items-center gap-3 bg-nxtup-line/60 rounded-2xl px-4 py-3"
                >
                  <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-nxtup-bg text-white font-black">
                    {b.name.charAt(0)}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold truncate">{b.name}</p>
                    <p className={`flex items-center gap-1.5 text-xs font-bold ${s.text}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
                      {s.label}
                      {cutting && (
                        <span className="text-nxtup-muted font-medium truncate">
                          · con {cutting}
                        </span>
                      )}
                    </p>
                  </div>
                  {pos !== undefined && (
                    <span className="flex-shrink-0 text-nxtup-active font-black tabular-nums text-lg">
                      #{pos}
                    </span>
                  )}
                  {heldPos !== undefined && (
                    <span className="flex-shrink-0 text-nxtup-break text-[11px] font-bold uppercase tracking-wider">
                      vuelve #{heldPos}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </section>

        <section>
          <h2 className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-4">
            En cola · {waiting.length}
          </h2>
          {waiting.length === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">Sin cola — entra directo.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {waiting.map((e, idx) => {
                const enCamino = e.mamacita_entry_id !== null && e.arrived_at === null
                const clock = enCamino ? etaClock(e.eta_at) : null
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 bg-nxtup-line/40 rounded-xl px-4 py-3"
                  >
                    <span className="w-8 flex-shrink-0 text-center text-white font-black tabular-nums">
                      #{idx + 1}
                    </span>
                    <span className="flex-1 min-w-0 font-bold truncate">
                      {e.client_name}
                    </span>
                    {enCamino && (
                      <span className="flex-shrink-0 flex items-center gap-1.5 text-nxtup-break text-sm font-black tabular-nums">
                        <Phone size={14} aria-hidden />
                        {clock ? `~${clock}` : ''}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {board.displayMessage && (
          <p className="mt-10 text-center text-nxtup-break text-sm font-bold">
            {board.displayMessage}
          </p>
        )}
      </div>

      <footer className="border-t border-nxtup-line px-5 sm:px-8 py-6 text-center">
        <p className="text-nxtup-muted text-sm mb-3">
          Demo con data de ejemplo. En producción, cada tienda ve solo la suya.
        </p>
        <Link
          href="/signup"
          className="inline-block rounded-lg bg-nxtup-active text-black px-5 py-2.5 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition"
        >
          Empieza gratis
        </Link>
      </footer>
    </main>
  )
}
