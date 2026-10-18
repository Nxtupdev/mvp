'use client'

import { useState } from 'react'
import { Phone, PhoneOff } from 'lucide-react'
import { useLocale } from '@/lib/i18n'

/**
 * Botón de activar/desactivar el add-on Julie. POST-ea a
 * /api/billing/julie y recarga: el cobro prorrateado ocurre server-side
 * dentro de la suscripción existente (sin redirect a Stripe). La
 * desactivación pide confirmación — apaga a Julie al instante y el mes
 * pagado no se reembolsa.
 */
export default function JulieActions({
  mode,
}: {
  mode: 'activate' | 'deactivate'
}) {
  const [loading, setLoading] = useState(false)
  const { t } = useLocale()

  async function go() {
    if (loading) return
    if (mode === 'deactivate' && !window.confirm(t('billing.julie.confirmOff'))) {
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/billing/julie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: mode }),
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
      setLoading(false)
    }
  }

  if (mode === 'deactivate') {
    return (
      <button
        type="button"
        onClick={go}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-nxtup-line px-5 py-2.5 text-sm font-bold text-nxtup-muted hover:border-white hover:text-white transition-colors disabled:opacity-50"
      >
        <PhoneOff size={16} aria-hidden />
        {loading ? t('billing.opening') : t('billing.julie.deactivate')}
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition disabled:opacity-50"
    >
      <Phone size={16} aria-hidden />
      {loading ? t('billing.opening') : t('billing.julie.activate')}
    </button>
  )
}
