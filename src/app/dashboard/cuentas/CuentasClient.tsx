'use client'

import { useState } from 'react'
import { Printer, Scissors, Trash2 } from 'lucide-react'
import { useLocale } from '@/lib/i18n'
import SplitSlider from '@/components/SplitSlider'

type Service = { id: string; name: string; price: number | null }

/** Botón "Cerrar cuentas" (082): liquida todo lo confirmado sin cierre. */
export function SettleButton({
  unsettledCount,
  pendingCount,
}: {
  unsettledCount: number
  pendingCount: number
}) {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)

  async function settle() {
    if (loading || unsettledCount === 0) return
    const warn =
      pendingCount > 0
        ? `\n\n${t('tickets.settle.pendingWarn', { n: String(pendingCount) })}`
        : ''
    if (!window.confirm(t('tickets.settle.confirm', { n: String(unsettledCount) }) + warn)) return
    setLoading(true)
    try {
      const res = await fetch('/api/tickets/settle', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(j.error ?? t('billing.error'))
        return
      }
      window.location.reload()
    } catch {
      window.alert(t('billing.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={settle}
      disabled={loading || unsettledCount === 0}
      className="inline-flex items-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition disabled:opacity-40"
    >
      <Scissors size={16} aria-hidden />
      {loading ? t('billing.opening') : t('tickets.settle.cta')}
    </button>
  )
}

export function PrintButton() {
  const { t } = useLocale()
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 rounded-lg border border-nxtup-line px-4 py-3 text-sm font-bold text-nxtup-muted hover:border-white hover:text-white transition-colors"
    >
      <Printer size={16} aria-hidden />
      {t('tickets.print')}
    </button>
  )
}

/** Deslizador de % de UN barbero (override), guarda al soltar. */
export function BarberSplit({
  barberId,
  initial,
  hasOverride,
}: {
  barberId: string
  initial: number
  hasOverride: boolean
}) {
  const { t } = useLocale()
  const [value, setValue] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [saving, setSaving] = useState(false)

  async function save(next: number | null) {
    if (saving) return
    setSaving(true)
    try {
      const res = await fetch('/api/tickets/split', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ barber_id: barberId, percent: next }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        window.alert(j.error ?? t('billing.error'))
        setValue(saved)
        return
      }
      if (next !== null) {
        setSaved(next)
      } else {
        window.location.reload() // vuelve al default del shop
      }
    } catch {
      window.alert(t('billing.error'))
      setValue(saved)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="print:hidden">
      <SplitSlider
        value={value}
        onChange={setValue}
        disabled={saving}
        barberLabel={t('settings.tickets.barber')}
        shopLabel={t('settings.tickets.house')}
      />
      <div className="flex items-center justify-between mt-1">
        {value !== saved ? (
          <button
            type="button"
            onClick={() => save(value)}
            disabled={saving}
            className="text-xs font-bold text-nxtup-active underline underline-offset-4 disabled:opacity-50"
          >
            {saving ? t('settings.saving') : t('tickets.split.save', { pct: String(value) })}
          </button>
        ) : (
          <span className="text-xs text-nxtup-dim">
            {hasOverride ? t('tickets.split.custom') : t('tickets.split.default')}
          </span>
        )}
        {hasOverride && value === saved && (
          <button
            type="button"
            onClick={() => save(null)}
            disabled={saving}
            className="text-xs text-nxtup-dim underline underline-offset-4 hover:text-white"
          >
            {t('tickets.split.useDefault')}
          </button>
        )}
      </div>
    </div>
  )
}

/** Acciones del dueño sobre una línea: cambiar servicio o eliminarla. */
export function TicketLineAdmin({
  ticketId,
  services,
  isPending,
}: {
  ticketId: string
  services: Service[]
  isPending: boolean
}) {
  const { t } = useLocale()
  const [editing, setEditing] = useState(false)
  const [serviceId, setServiceId] = useState('')
  const [busy, setBusy] = useState(false)

  async function savePatch() {
    if (busy || !serviceId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service_id: serviceId }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(j.error ?? t('billing.error'))
        return
      }
      window.location.reload()
    } catch {
      window.alert(t('billing.error'))
    } finally {
      setBusy(false)
    }
  }

  async function remove() {
    if (busy) return
    if (!window.confirm(t('tickets.line.deleteConfirm'))) return
    setBusy(true)
    try {
      const res = await fetch(`/api/tickets/${ticketId}`, { method: 'DELETE' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(j.error ?? t('billing.error'))
        return
      }
      window.location.reload()
    } catch {
      window.alert(t('billing.error'))
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <span className="flex items-center gap-2 print:hidden">
        <select
          value={serviceId}
          onChange={e => setServiceId(e.target.value)}
          className="bg-nxtup-line text-white text-xs rounded px-2 py-1 border border-nxtup-dim"
        >
          <option value="">{t('tickets.line.pick')}</option>
          {services.map(s => (
            <option key={s.id} value={s.id} className="bg-nxtup-bg">
              {s.name} · ${Number(s.price ?? 0)}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={savePatch}
          disabled={busy || !serviceId}
          className="text-xs font-bold text-nxtup-active disabled:opacity-40"
        >
          {t('tickets.line.save')}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs text-nxtup-dim"
        >
          ×
        </button>
      </span>
    )
  }

  return (
    <span className="flex items-center gap-2 print:hidden">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={`text-xs underline underline-offset-4 ${
          isPending ? 'text-nxtup-break font-bold' : 'text-nxtup-dim hover:text-white'
        }`}
      >
        {isPending ? t('tickets.line.fill') : t('tickets.line.edit')}
      </button>
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        aria-label={t('tickets.line.delete')}
        className="text-nxtup-dim hover:text-nxtup-busy transition-colors"
      >
        <Trash2 size={13} aria-hidden />
      </button>
    </span>
  )
}
