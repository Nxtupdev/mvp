'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { RotateCcw } from 'lucide-react'

/**
 * Botón "Resetear demo" — visible SOLO para la cuenta demo (el layout
 * lo renderiza tras chequear el email). Llama a /api/demo/reset, que
 * reseed la barbería demo con timestamps actuales. Tras el reset,
 * router.refresh() re-baja la data server-side (la cola/barberos también
 * llegan por realtime, pero refresh asegura el estado inicial fresco).
 */
export default function ResetDemoButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)

  async function reset() {
    if (loading) return
    const ok = window.confirm(
      'Resetear el demo a estado fresco? Se borran los cambios de la prueba y se refrescan las horas.',
    )
    if (!ok) return
    setLoading(true)
    try {
      const res = await fetch('/api/demo/reset', { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        window.alert(j.error ?? 'No se pudo resetear el demo.')
        return
      }
      setDone(true)
      router.refresh()
      setTimeout(() => setDone(false), 2500)
    } catch {
      window.alert('No se pudo resetear el demo.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      type="button"
      onClick={reset}
      disabled={loading}
      title="Resetear la barbería demo a estado fresco"
      className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-nxtup-break/40 text-nxtup-break px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider whitespace-nowrap hover:border-nxtup-break hover:bg-nxtup-break/10 transition-colors disabled:opacity-50"
    >
      <RotateCcw size={13} className={loading ? 'animate-spin' : ''} aria-hidden />
      {loading ? 'Reseteando…' : done ? 'Listo ✓' : 'Resetear demo'}
    </button>
  )
}
