'use client'

import { useState } from 'react'

/**
 * Línea PENDIENTE en Mi cuenta (082): el barbero cerró la hoja sin
 * elegir y la completa aquí — misma mecánica de botones de selección
 * con precio heredado + Terminar (PATCH solo-pending, solo-propia).
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
  const [picked, setPicked] = useState<string[]>([])
  const [sending, setSending] = useState(false)

  async function confirm() {
    if (sending || picked.length === 0) return
    setSending(true)
    try {
      const res = await fetch(`/api/barbers/${barberId}/tickets`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id: ticketId, service_ids: picked }),
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
      <div className="grid grid-cols-2 gap-2">
        {services.map(s => {
          const on = picked.includes(s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() =>
                setPicked(p => (on ? p.filter(x => x !== s.id) : [...p, s.id]))
              }
              className={`rounded-lg border px-2 py-2.5 text-left transition-colors ${
                on
                  ? 'border-nxtup-active bg-nxtup-active/10'
                  : 'border-nxtup-line hover:border-white'
              }`}
            >
              <p className={`font-bold text-xs ${on ? 'text-nxtup-active' : 'text-white'}`}>
                {s.name}
              </p>
              <p className="text-nxtup-muted text-xs tabular-nums">
                ${Number(s.price ?? 0)}
              </p>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={confirm}
        disabled={sending || picked.length === 0}
        className="w-full rounded-lg bg-nxtup-active text-black px-4 py-2.5 text-sm font-black uppercase tracking-wider disabled:opacity-40"
      >
        {sending ? 'Guardando…' : 'Terminar'}
      </button>
    </div>
  )
}
