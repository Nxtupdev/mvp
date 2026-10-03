'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { subscribeShopChanges } from '@/lib/realtime'
import { useLocale } from '@/lib/i18n'

// ──────────────────────────────────────────────────────────────
// ShopOpenSection — abrir y cerrar la barbería a mano (port del
// ShopOpenCard del dealer, oct-2026).
//
// Vivía como botón hero del dashboard En vivo; se mudó aquí porque
// con el horario semanal (062) la mayoría de los shops abren y
// cierran solos y el interruptor pasa a ser el respaldo — y el
// dashboard queda limpio, solo estado. Se actualiza en vivo si el
// cron del horario (o otro dispositivo) la cambia.
// ──────────────────────────────────────────────────────────────

export default function ShopOpenSection({
  shopId,
  initialOpen,
  hasHours,
}: {
  shopId: string
  initialOpen: boolean
  /** false = sin horario semanal configurado (el blurb lo recuerda). */
  hasHours: boolean
}) {
  const { t } = useLocale()
  const [open, setOpen] = useState(initialOpen)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const supabase = createClient()
    const refetch = async () => {
      const { data } = await supabase
        .from('shops')
        .select('is_open')
        .eq('id', shopId)
        .maybeSingle()
      if (data) setOpen(Boolean((data as { is_open: boolean }).is_open))
    }
    const channel = subscribeShopChanges(supabase, shopId, change => {
      if (change.table === 'shops') refetch()
    })
    return () => {
      supabase.removeChannel(channel)
    }
  }, [shopId])

  async function toggle() {
    if (busy) return
    setBusy(true)
    setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('shops')
      .update({ is_open: !open })
      .eq('id', shopId)
      .select('is_open')
      .single()
    setBusy(false)
    if (err || !data) {
      setError(t('settings.open.error'))
      return
    }
    setOpen(Boolean((data as { is_open: boolean }).is_open))
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-[0.3em] text-nxtup-muted font-bold">
        {t('settings.open.heading')}
      </h2>
      <div className="border border-nxtup-line rounded-xl px-4 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <span
              className={`w-2 h-2 rounded-full flex-shrink-0 ${open ? 'bg-nxtup-active' : 'bg-nxtup-busy'}`}
              aria-hidden
            />
            {open ? t('settings.open.isOpen') : t('settings.open.isClosed')}
          </p>
          <p className="text-nxtup-dim text-xs mt-1 max-w-prose leading-relaxed">
            {hasHours ? t('settings.open.blurbAuto') : t('settings.open.blurbManual')}
          </p>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={busy}
          className={`flex-shrink-0 px-4 py-2 rounded-md text-sm font-bold transition-colors disabled:opacity-40 ${
            open
              ? 'border border-nxtup-busy/50 text-nxtup-busy hover:bg-nxtup-busy/10'
              : 'bg-nxtup-active text-black hover:opacity-90'
          }`}
        >
          {busy ? '…' : open ? t('settings.open.close') : t('settings.open.open')}
        </button>
        {error && <p className="text-nxtup-busy text-xs w-full">{error}</p>}
      </div>
    </section>
  )
}
