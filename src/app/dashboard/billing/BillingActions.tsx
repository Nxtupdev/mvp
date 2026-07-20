'use client'

import { useState } from 'react'
import { CreditCard, Settings } from 'lucide-react'

/**
 * Botones de billing. `subscribe` → Stripe Checkout; `manage` → Billing
 * Portal. Ambos POST-ean a su endpoint, que devuelve una { url } de Stripe
 * a la que redirigimos.
 */
export default function BillingActions({
  mode,
}: {
  mode: 'subscribe' | 'manage'
}) {
  const [loading, setLoading] = useState(false)

  async function go(endpoint: string) {
    if (loading) return
    setLoading(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !j.url) {
        window.alert(j.error ?? 'No se pudo continuar. Intenta de nuevo.')
        return
      }
      window.location.href = j.url as string
    } catch {
      window.alert('No se pudo continuar. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'manage') {
    return (
      <button
        type="button"
        onClick={() => go('/api/billing/portal')}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-nxtup-line px-5 py-2.5 text-sm font-bold hover:border-white transition-colors disabled:opacity-50"
      >
        <Settings size={16} aria-hidden />
        {loading ? 'Abriendo…' : 'Gestionar suscripción'}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={() => go('/api/billing/checkout')}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-2.5 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition disabled:opacity-50"
    >
      <CreditCard size={16} aria-hidden />
      {loading ? 'Abriendo…' : 'Suscribirse'}
    </button>
  )
}
