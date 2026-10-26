'use client'

import { useState } from 'react'
import TicketItemsPicker, {
  confirmOutliers,
  itemsPayload,
  itemsProblem,
  itemsTotal,
} from '@/components/TicketItemsPicker'
import type { TicketItem } from '@/lib/ticket-items'

type Service = { id: string; name: string; price: number | null }

/**
 * Botón + hoja para registrar un servicio desde "Mis clientes" (083).
 *
 * Dos usos:
 *   * SIN entryId → "+ Registrar servicio": cliente que no pasó por la
 *     cola (citas atendidas de corrido). Nombre opcional.
 *   * CON entryId → "Marcar servicio" de un turno de la cola que quedó
 *     sin línea. El nombre ya viene del turno.
 *
 * Misma mecánica que la hoja del cierre (TicketItemsPicker): precio de
 * lista ajustable, "Otro" para categorías propias, un solo "Terminar".
 * La línea es un ticket confirmado normal: entra a Cuentas, Reportes y
 * Cierre del dueño igual que cualquier otra.
 */
export default function ServiceSheetButton({
  barberId,
  services,
  entryId = null,
  fixedName = null,
  variant = 'primary',
  label,
}: {
  barberId: string
  services: Service[]
  entryId?: string | null
  fixedName?: string | null
  variant?: 'primary' | 'inline'
  label: string
}) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<TicketItem[]>([])
  const [name, setName] = useState('')
  const [sending, setSending] = useState(false)

  const total = itemsTotal(items)
  const problem = itemsProblem(items)

  function close() {
    setOpen(false)
    setItems([])
    setName('')
  }

  async function send() {
    if (sending || problem) return
    if (!confirmOutliers(items)) return
    setSending(true)
    try {
      const res = await fetch(`/api/barbers/${barberId}/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entry_id: entryId,
          items: itemsPayload(items),
          ...(entryId ? {} : { client_name: name.trim() || undefined }),
        }),
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          variant === 'primary'
            ? 'w-full rounded-xl bg-nxtup-active text-black px-5 py-3.5 text-sm font-black uppercase tracking-wider active:scale-[0.98] transition'
            : 'text-xs font-bold text-nxtup-break underline underline-offset-4'
        }
      >
        {label}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-2xl border border-nxtup-line bg-nxtup-bg p-5 flex flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-white font-black text-xl">
                  {entryId ? '¿Qué le hiciste?' : '¿Qué servicio hiciste?'}
                </p>
                {fixedName && <p className="text-nxtup-muted text-sm">a {fixedName}</p>}
              </div>
              <button
                type="button"
                onClick={close}
                disabled={sending}
                aria-label="Cerrar"
                className="text-nxtup-dim hover:text-white text-2xl leading-none px-2"
              >
                ×
              </button>
            </div>

            {!entryId && (
              <label className="flex flex-col gap-1 text-xs text-nxtup-muted">
                Nombre del cliente (opcional)
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={40}
                  placeholder="Ej. Pedro"
                  className="bg-nxtup-line text-white rounded-lg px-3 py-2.5 text-sm border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
                />
              </label>
            )}

            <TicketItemsPicker services={services} items={items} onChange={setItems} />

            <button
              type="button"
              onClick={send}
              disabled={sending || problem !== null}
              className="w-full rounded-xl bg-nxtup-active text-black px-5 py-4 text-base font-black uppercase tracking-wider disabled:opacity-40 transition active:scale-[0.98]"
            >
              {sending ? 'Guardando…' : problem ?? `Terminar · $${total}`}
            </button>
            <p className="text-nxtup-dim text-xs text-center">
              Ajusta el precio con − y + si cobraste distinto.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
