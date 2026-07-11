'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { debounce } from '@/lib/debounce'
import { useLocale } from '@/lib/i18n'

type Service = {
  id: string
  name: string
  price: number | null
  duration_minutes: number
  sort_order: number
  active: boolean
}

function parsePrice(v: string): number | null {
  const n = parseFloat(v.replace(',', '.').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n >= 0 ? n : null
}

export default function ServiceManager({
  shopId,
  initialServices,
}: {
  shopId: string
  initialServices: Service[]
}) {
  const { t } = useLocale()
  const [services, setServices] = useState<Service[]>(initialServices)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [duration, setDuration] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [pendingId, setPendingId] = useState<string | null>(null)

  // Avisar a Julie (Mamacita) DESPUÉS de guardar. Best-effort +
  // debounced para colapsar ediciones rápidas en un solo aviso. El
  // endpoint lee la lista fresca y firma el webhook server-side — el
  // secret nunca llega al cliente.
  const notifyJulie = useMemo(
    () =>
      debounce(() => {
        fetch('/api/mamacita/notify-profile', { method: 'POST' }).catch(() => {})
      }, 800),
    [],
  )

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (adding || !name.trim()) return
    setAdding(true)
    setError('')
    const supabase = createClient()
    const nextOrder =
      services.reduce((max, s) => Math.max(max, s.sort_order), 0) + 1
    const dur = parseInt(duration, 10)
    const { data, error: addErr } = await supabase
      .from('services')
      .insert({
        shop_id: shopId,
        name: name.trim(),
        price: parsePrice(price),
        duration_minutes: Number.isFinite(dur) && dur > 0 ? dur : 30,
        sort_order: nextOrder,
      })
      .select('id, name, price, duration_minutes, sort_order, active')
      .single()
    if (addErr) {
      setError(addErr.message)
    } else if (data) {
      setServices(prev => [...prev, data as Service])
      setName('')
      setPrice('')
      setDuration('')
      notifyJulie()
    }
    setAdding(false)
  }

  async function handlePatch(id: string, patch: Partial<Service>) {
    setPendingId(id)
    const supabase = createClient()
    const { error: upErr } = await supabase
      .from('services')
      .update(patch)
      .eq('id', id)
    if (!upErr) {
      setServices(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
      notifyJulie()
    } else {
      setError(upErr.message)
    }
    setPendingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('services.deleteConfirm'))) return
    setPendingId(id)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('services').delete().eq('id', id)
    if (!delErr) {
      setServices(prev => prev.filter(s => s.id !== id))
      notifyJulie()
    } else {
      setError(delErr.message)
    }
    setPendingId(null)
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-2xl w-full mx-auto">
      <Link
        href="/dashboard/settings"
        className="text-nxtup-muted hover:text-white text-xs uppercase tracking-[0.2em] inline-flex items-center gap-1 mb-4 transition-colors"
      >
        {t('services.back')}
      </Link>
      <h1 className="text-3xl font-black tracking-tight mb-2">{t('services.title')}</h1>
      <p className="text-nxtup-muted text-sm mb-8">{t('services.subtitle')}</p>

      <form
        onSubmit={handleAdd}
        className="border border-nxtup-line rounded-2xl p-4 mb-8 flex flex-col sm:flex-row gap-3"
      >
        <input
          required
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('services.namePlaceholder')}
          className="flex-1 bg-nxtup-bg text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
        />
        <div className="flex gap-3">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-nxtup-dim">$</span>
            <input
              inputMode="decimal"
              value={price}
              onChange={e => setPrice(e.target.value)}
              placeholder={t('services.pricePlaceholder')}
              className="w-24 bg-nxtup-bg text-white rounded-lg pl-7 pr-3 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
            />
          </div>
          <div className="relative">
            <input
              inputMode="numeric"
              value={duration}
              onChange={e => setDuration(e.target.value)}
              placeholder="30"
              className="w-20 bg-nxtup-bg text-white rounded-lg pl-3 pr-9 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-nxtup-dim text-sm">
              {t('kiosk.success.min')}
            </span>
          </div>
          <button
            type="submit"
            disabled={adding || !name.trim()}
            className="px-5 py-3 bg-white text-black font-semibold rounded-lg disabled:opacity-40 transition-all active:scale-[0.98] whitespace-nowrap"
          >
            {adding ? '...' : t('common.add')}
          </button>
        </div>
      </form>

      {error && <p className="text-nxtup-busy text-sm mb-4">{error}</p>}

      {services.length === 0 ? (
        <div className="border border-dashed border-nxtup-dim rounded-2xl py-16 text-center">
          <p className="text-nxtup-muted text-sm">{t('services.empty')}</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {services.map(s => (
            <ServiceRow
              key={s.id}
              service={s}
              pending={pendingId === s.id}
              onPatch={patch => handlePatch(s.id, patch)}
              onDelete={() => handleDelete(s.id)}
            />
          ))}
        </ul>
      )}
    </main>
  )
}

function ServiceRow({
  service,
  pending,
  onPatch,
  onDelete,
}: {
  service: Service
  pending: boolean
  onPatch: (patch: Partial<Service>) => void
  onDelete: () => void
}) {
  const { t } = useLocale()
  const [name, setName] = useState(service.name)
  const [price, setPrice] = useState(
    service.price != null ? String(service.price) : '',
  )
  const [duration, setDuration] = useState(String(service.duration_minutes))

  function commitName() {
    const v = name.trim()
    if (v && v !== service.name) onPatch({ name: v })
    else setName(service.name)
  }
  function commitPrice() {
    const next = parsePrice(price)
    if (next !== service.price) onPatch({ price: next })
    setPrice(next != null ? String(next) : '')
  }
  function commitDuration() {
    const n = parseInt(duration, 10)
    const next = Number.isFinite(n) && n > 0 ? n : service.duration_minutes
    if (next !== service.duration_minutes) onPatch({ duration_minutes: next })
    setDuration(String(next))
  }

  return (
    <li className="flex items-center gap-3 rounded-xl bg-nxtup-line border border-nxtup-line px-3 py-2.5">
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        onBlur={commitName}
        className="flex-1 min-w-0 bg-transparent text-white font-medium focus:outline-none"
      />
      <div className="relative flex-shrink-0">
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-nxtup-dim text-sm">$</span>
        <input
          inputMode="decimal"
          value={price}
          onChange={e => setPrice(e.target.value)}
          onBlur={commitPrice}
          placeholder="—"
          className="w-20 bg-nxtup-bg text-white rounded-md pl-6 pr-2 py-1.5 border border-nxtup-dim focus:border-white focus:outline-none text-right placeholder:text-nxtup-dim"
        />
      </div>
      <div className="relative flex-shrink-0">
        <input
          inputMode="numeric"
          value={duration}
          onChange={e => setDuration(e.target.value)}
          onBlur={commitDuration}
          className="w-16 bg-nxtup-bg text-white rounded-md pl-2 pr-8 py-1.5 border border-nxtup-dim focus:border-white focus:outline-none text-right"
        />
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-nxtup-dim text-xs">
          {t('kiosk.success.min')}
        </span>
      </div>
      <button
        onClick={onDelete}
        disabled={pending}
        className="text-nxtup-dim hover:text-nxtup-busy text-xs px-2 py-1 transition-colors disabled:opacity-40 flex-shrink-0"
        aria-label={t('common.delete')}
      >
        {t('common.delete')}
      </button>
    </li>
  )
}
