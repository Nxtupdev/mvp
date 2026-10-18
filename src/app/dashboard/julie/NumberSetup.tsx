'use client'

import { useState } from 'react'
import { ArrowLeftRight, Phone, Search } from 'lucide-react'
import { JULIE_PORT_ENABLED } from '@/lib/billing'
import { useLocale } from '@/lib/i18n'

/**
 * Wizard del número de Julie. Dos caminos:
 *
 *   COMPRA — área code → lista de números disponibles (inventario
 *   Twilio vía Mamacita) → el dueño ELIGE el suyo → compra. Si el
 *   elegido se vendió en la ventana (Twilio no reserva), el server
 *   devuelve alternativas frescas y se vuelve a elegir.
 *
 *   PORTE (fase 2, detrás de JULIE_PORT_ENABLED) — captura SOLO lo no
 *   sensible: número a portar + titularidad + WhatsApp de contacto.
 *   Los documentos del carrier (cuenta, PIN, factura, LOA) los pide
 *   Mamacita por WhatsApp en info_required — jamás pasan por NXTUP.
 */
export default function NumberSetup({ failReason }: { failReason: string | null }) {
  const { t } = useLocale()
  const [mode, setMode] = useState<'buy' | 'port'>('buy')

  // compra
  const [areaCode, setAreaCode] = useState('')
  const [numbers, setNumbers] = useState<string[] | null>(null)
  const [fallbackNote, setFallbackNote] = useState<string | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [searching, setSearching] = useState(false)
  const [buying, setBuying] = useState(false)
  const [taken, setTaken] = useState(false)

  // porte
  const [currentNumber, setCurrentNumber] = useState('')
  const [ownerPhone, setOwnerPhone] = useState('')
  const [titular, setTitular] = useState(false)
  const [porting, setPorting] = useState(false)

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

  async function startPort() {
    if (porting || !titular) return
    setPorting(true)
    try {
      const res = await fetch('/api/julie/number/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          choice: 'port',
          current_number: currentNumber,
          owner_phone: ownerPhone,
          titular,
        }),
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
      setPorting(false)
    }
  }

  /** '+19195551234' → '(919) 555-1234' solo para mostrar. */
  function pretty(e164: string): string {
    const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/)
    return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164
  }

  const phoneOk = (v: string) => {
    const d = v.replace(/\D/g, '')
    return d.length === 10 || (d.length === 11 && d.startsWith('1'))
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

      {/* Elección: comprar / portar (fase 2 tras JULIE_PORT_ENABLED) */}
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setMode('buy')}
          className={`text-left border rounded-xl px-4 py-3 transition-colors ${
            mode === 'buy' ? 'border-nxtup-active/60' : 'border-nxtup-line hover:border-white'
          }`}
        >
          <p className="text-white font-semibold text-sm">{t('julieNum.buyTitle')}</p>
          <p className="text-nxtup-dim text-xs mt-0.5">{t('julieNum.buyDesc')}</p>
        </button>
        <button
          type="button"
          disabled={!JULIE_PORT_ENABLED}
          onClick={() => JULIE_PORT_ENABLED && setMode('port')}
          className={`text-left border rounded-xl px-4 py-3 transition-colors ${
            !JULIE_PORT_ENABLED
              ? 'border-nxtup-line opacity-50 cursor-not-allowed'
              : mode === 'port'
                ? 'border-nxtup-active/60'
                : 'border-nxtup-line hover:border-white'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-white font-semibold text-sm">{t('julieNum.portTitle')}</p>
            {!JULIE_PORT_ENABLED && (
              <span className="text-[10px] uppercase tracking-wider font-bold border border-nxtup-line rounded-full px-2 py-0.5 text-nxtup-muted whitespace-nowrap">
                {t('billing.julie.badge')}
              </span>
            )}
          </div>
          <p className="text-nxtup-dim text-xs mt-0.5">{t('julieNum.portDesc')}</p>
        </button>
      </div>

      {mode === 'buy' ? (
        <>
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
        </>
      ) : (
        <>
          {/* Captura del porte: SOLO lo no sensible */}
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-nxtup-muted font-semibold">
                {t('julieNum.port.numberLabel')}
              </span>
              <input
                inputMode="tel"
                placeholder="(919) 555-1234"
                value={currentNumber}
                onChange={e => setCurrentNumber(e.target.value)}
                className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs text-nxtup-muted font-semibold">
                {t('julieNum.port.waLabel')}
              </span>
              <input
                inputMode="tel"
                placeholder="(919) 555-0000"
                value={ownerPhone}
                onChange={e => setOwnerPhone(e.target.value)}
                className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
              />
            </label>
            <label className="flex items-start gap-3 text-sm text-nxtup-muted cursor-pointer">
              <input
                type="checkbox"
                checked={titular}
                onChange={e => setTitular(e.target.checked)}
                className="mt-0.5 h-5 w-5 accent-[#34D399]"
              />
              {t('julieNum.port.titular')}
            </label>
            <p className="text-xs text-nxtup-dim">{t('julieNum.port.notice')}</p>
            <button
              type="button"
              onClick={startPort}
              disabled={porting || !titular || !phoneOk(currentNumber) || !phoneOk(ownerPhone)}
              className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-bold uppercase tracking-wider hover:brightness-110 transition disabled:opacity-50"
            >
              <ArrowLeftRight size={16} aria-hidden />
              {porting ? t('julieNum.port.sending') : t('julieNum.port.cta')}
            </button>
            <p className="text-xs text-nxtup-dim">{t('julieNum.port.infoNote')}</p>
          </div>
        </>
      )}
    </section>
  )
}
