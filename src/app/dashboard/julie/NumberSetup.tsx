'use client'

import { useState } from 'react'
import { Phone, Search } from 'lucide-react'
import { useLocale } from '@/lib/i18n'

// Fase 2 del lado Mamacita: portar el número propio del dueño (LOA +
// documentos del carrier). La opción se muestra deshabilitada hasta que
// exista — voltear esto cuando Mamacita publique el port-in.
const PORT_ENABLED = false

/**
 * Wizard de compra del número de Julie: área code → lista de números
 * disponibles (inventario Twilio vía Mamacita) → el dueño ELIGE el suyo
 * → compra. Si el elegido se vendió en la ventana (Twilio no reserva),
 * el server devuelve alternativas frescas y se vuelve a elegir.
 */
export default function NumberSetup({ failReason }: { failReason: string | null }) {
  const { t } = useLocale()
  const [areaCode, setAreaCode] = useState('')
  const [numbers, setNumbers] = useState<string[] | null>(null)
  const [fallbackNote, setFallbackNote] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [buying, setBuying] = useState(false)
  const [taken, setTaken] = useState(false)

  async function search() {
    if (searching || areaCode.replace(/\D/g, '').length !== 3) return
    setSearching(true)
    setTaken(false)
    setPicked(null)
    try {
      const res = await fetch('/api/julie/number/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ area_code: areaCode.replace(/\D/g, '') }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || !Array.isArray(j.numbers)) {
        window.alert(j.error ?? t('billing.error'))
        return
      }
      setNumbers(j.numbers)
      setFallbackNote(typeof j.fallback_note === 'string' ? j.fallback_note : null)
    } catch {
      window.alert(t('billing.error'))
    } finally {
      setSearching(false)
    }
  }

  async function buy() {
    if (buying || !picked) return
    setBuying(true)
    try {
      const res = await fetch('/api/julie/number/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ choice: 'buy', requested_number: picked }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        window.alert(j.error ?? t('billing.error'))
        return
      }
      if (j.status === 'failed' && j.fail_reason === 'number_taken') {
        // Carrera: el número se vendió mientras decidía. Lista fresca.
        setTaken(true)
        setPicked(null)
        if (Array.isArray(j.numbers)) setNumbers(j.numbers)
        return
      }
      window.location.reload()
    } catch {
      window.alert(t('billing.error'))
    } finally {
      setBuying(false)
    }
  }

  /** '+19195551234' → '(919) 555-1234' solo para mostrar. */
  function pretty(e164: string): string {
    const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
  }

  return (
    <section className="border border-nxtup-line rounded-2xl p-6 flex flex-col gap-5">
      <div>
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
          {t('julieNum.setupLabel')}
        </p>
        <p className="text-sm text-nxtup-muted">{t('julieNum.setupIntro')}</p>
      </div>

      {failReason && !numbers && (
        <p className="text-sm text-nxtup-busy">{t('julieNum.previousFailed')}</p>
      )}

      {/* Elección: comprar (activo) / portar (fase 2, deshabilitado) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="border border-nxtup-active/40 rounded-xl px-4 py-3">
          <p className="text-white font-semibold text-sm">{t('julieNum.buyTitle')}</p>
          <p className="text-nxtup-dim text-xs mt-0.5">{t('julieNum.buyDesc')}</p>
        </div>
        <div
          className={`border border-nxtup-line rounded-xl px-4 py-3 ${PORT_ENABLED ? '' : 'opacity-50'}`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-white font-semibold text-sm">{t('julieNum.portTitle')}</p>
            {!PORT_ENABLED && (
              <span className="text-[10px] uppercase tracking-wider font-bold border border-nxtup-line rounded-full px-2 py-0.5 text-nxtup-muted whitespace-nowrap">
                {t('billing.julie.badge')}
              </span>
            )}
          </div>
          <p className="text-nxtup-dim text-xs mt-0.5">{t('julieNum.portDesc')}</p>
        </div>
      </div>

      {/* Búsqueda por área code */}
      <div className="flex gap-3">
        <input
          inputMode="numeric"
          maxLength={3}
          placeholder={t('julieNum.areaPlaceholder')}
          value={areaCode}
          onChange={e => setAreaCode(e.target.value.replace(/\D/g, ''))}
          className="w-28 bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim text-center text-lg font-bold tracking-widest"
        />
        <button
          type="button"
          onClick={search}
          disabled={searching || areaCode.length !== 3}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-nxtup-line px-5 py-3 text-sm font-bold hover:border-white transition-colors disabled:opacity-50"
        >
          <Search size={16} aria-hidden />
          {searching ? t('julieNum.searching') : t('julieNum.searchCta')}
        </button>
      </div>

      {taken && <p className="text-sm text-nxtup-break">{t('julieNum.taken')}</p>}

      {numbers && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-nxtup-muted">
            {numbers.length > 0 ? t('julieNum.pickTitle') : t('julieNum.noneFound')}
          </p>
          {fallbackNote && <p className="text-xs text-nxtup-dim">{fallbackNote}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {numbers.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setPicked(n)}
                className={`rounded-lg px-4 py-3 text-sm font-bold tracking-wide border transition-colors ${
                  picked === n
                    ? 'border-nxtup-active text-nxtup-active'
                    : 'border-nxtup-line text-white hover:border-white'
                }`}
              >
                {pretty(n)}
              </button>
            ))}
          </div>
          {picked && (
            <button
              type="button"
              onClick={buy}
              disabled={buying}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition disabled:opacity-50"
            >
              <Phone size={16} aria-hidden />
              {buying ? t('julieNum.buying') : t('julieNum.buyCta', { number: pretty(picked) })}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
