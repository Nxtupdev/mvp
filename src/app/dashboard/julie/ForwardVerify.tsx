'use client'

import { useState } from 'react'
import { PhoneForwarded } from 'lucide-react'
import { useLocale } from '@/lib/i18n'

/**
 * Botón "Verificar desvío" (079): consulta si la llamada de prueba del
 * dueño llegó al número de Julie. verified → recarga (la página pasa a
 * "número activo"); callerid_ok=false → advertencia persistente en
 * pantalla; verified=false → pedir la llamada de prueba y reintentar.
 */
export default function ForwardVerify() {
  const { t } = useLocale()
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function verify() {
    if (loading) return
    setLoading(true)
    setNotice(null)
    try {
      const res = await fetch('/api/julie/number/verify', { method: 'POST' })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        setNotice(j.error ?? t('billing.error'))
        return
      }
      if (j.verified) {
        if (j.callerid_ok === false) {
          // Verificado pero el carrier no pasa el caller ID: avisar ANTES
          // de recargar para que el dueño lea la advertencia.
          window.alert(t('julieNum.fwd.calleridWarn'))
        }
        window.location.reload()
        return
      }
      setNotice(t('julieNum.fwd.notVerified'))
    } catch {
      setNotice(t('billing.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={verify}
        disabled={loading}
        className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition disabled:opacity-50"
      >
        <PhoneForwarded size={16} aria-hidden />
        {loading ? t('julieNum.fwd.verifying') : t('julieNum.fwd.verifyCta')}
      </button>
      {notice && <p className="text-sm text-nxtup-break">{notice}</p>}
    </div>
  )
}
