'use client'

import { useState } from 'react'
import TicketItemsPicker, {
  confirmOutliers,
  itemsPayload,
  itemsProblem,
} from '@/components/TicketItemsPicker'
import type { TicketItem } from '@/lib/ticket-items'

/**
 * Línea PENDIENTE en Mi cuenta (082): el barbero cerró la hoja sin
 * elegir y la completa aquí — mismo selector de la hoja del cierre
 * (precio ajustable, "Otro") + Terminar (PATCH solo-pending, solo-propia).
 */
export default function PendingFill({
  barberId,
  ticketId,
  services,
}: {
  barberId: string
  ticketId: string
  services: { id: string; name: string; price: number | null }[]
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TicketItem[]>([])
  const [sending, setSending] = useState(false)

  const problem = itemsProblem(items)

  async function confirm() {
    if (sending || problem) return
    if (!confirmOutliers(items)) return
    setSending(true)
    try {
      const res = await fetch(`/api/barbers/${barberId}/tickets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, items: itemsPayload(items) }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        window.alert(j.error ?? 'No se pudo guardar')
        return
      }
      window.location.reload()
    } catch {
      window.alert('Error de red')
    } finally {
      setSending(false)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center justify-between border border-nxtup-break/50 rounded-lg px-3 py-2 text-left"
      >
        <span className="text-sm text-nxtup-break font-semibold">
          ¿Qué le hiciste? · toca para completar
        </span>
        <span className="text-nxtup-break" aria-hidden>
          →
        </span>
      </button>
    )
  }

  return (
    <div className="border border-nxtup-break/50 rounded-xl p-3 flex flex-col gap-2">
      <TicketItemsPicker services={services} items={items} onChange={setItems} compact />
      <button
        type="button"
        onClick={confirm}
        disabled={sending || problem !== null}
        className="w-full rounded-lg bg-nxtup-active text-black px-4 py-2.5 text-sm font-black uppercase tracking-wider disabled:opacity-40"
      >
        {sending ? 'Guardando…' : problem ?? 'Terminar'}
      </button>
    </div>
  )
}
