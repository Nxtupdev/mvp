'use client'

import { useState } from 'react'
import { useLocale } from '@/lib/i18n'

/**
 * "← Cambiar de método": abandona un porte aún en captura de datos
 * (info_required) y devuelve al dueño al wizard para elegir comprar o
 * desvío. Caso NuevaYol 21-oct: tocó portar sin querer y quedó atrapado.
 */
export default function CancelNumberFlow() {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)

  async function cancel() {
    if (loading) return
    if (!window.confirm(t('julieNum.cancel.confirm'))) return
    setLoading(true)
    try {
      const res = await fetch('/api/julie/number/cancel', { method: 'POST' })
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
      onClick={cancel}
      disabled={loading}
      className="self-start text-xs font-semibold text-nxtup-dim underline underline-offset-4 hover:text-white transition-colors disabled:opacity-50"
    >
      {loading ? t('julieNum.cancel.working') : `← ${t('julieNum.cancel.cta')}`}
    </button>
  )
}
