'use client'

import { useEffect, useState } from 'react'

type ShopOption = { id: string; name: string }

type TokenRow = {
  id: string
  shop_id: string
  shop_name: string
  label: string | null
  expires_at: string
  created_at: string
  revoked_at: string | null
  is_active: boolean
}

type CreatedToken = {
  id: string
  shop_id: string
  shop_name: string
  token: string
  url: string
  label: string | null
  expires_at: string
}

const DURATION_PRESETS = [
  { label: '1 hora', hours: 1 },
  { label: '24 horas', hours: 24 },
  { label: '7 días', hours: 24 * 7 },
  { label: '30 días', hours: 24 * 30 },
]

export default function AdminPanelTokensManager({
  shops,
}: {
  shops: ShopOption[]
}) {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedShop, setSelectedShop] = useState<string>(shops[0]?.id ?? '')
  const [createHours, setCreateHours] = useState(24 * 7)
  const [createLabel, setCreateLabel] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<CreatedToken | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    let cancel = false
    const load = async () => {
      try {
        const res = await fetch('/api/admin/panel-tokens')
        const data = await res.json()
        if (cancel) return
        if (res.ok) setTokens(data.tokens ?? [])
        else setError(data.error ?? 'No se pudo cargar la lista')
      } catch {
        if (!cancel) setError('Error de red al cargar')
      } finally {
        if (!cancel) setLoading(false)
      }
    }
    load()
    return () => {
      cancel = true
    }
  }, [])

  async function createToken() {
    if (!selectedShop) {
      setError('Selecciona un shop primero')
      return
    }
    setCreating(true)
    setError('')
    setJustCreated(null)
    setCopied(false)
    try {
      const res = await fetch('/api/admin/panel-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          shop_id: selectedShop,
          hours: createHours,
          label: createLabel.trim() || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'No se pudo generar el link')
        return
      }
      setJustCreated(data as CreatedToken)
      setCreateLabel('')
      const listRes = await fetch('/api/admin/panel-tokens')
      const listData = await listRes.json()
      if (listRes.ok) setTokens(listData.tokens ?? [])
    } catch {
      setError('Error de red al crear el token')
    } finally {
      setCreating(false)
    }
  }

  async function revokeToken(id: string) {
    if (!confirm('¿Revocar este link? Quien lo tenga pierde acceso al instante.')) return
    try {
      const res = await fetch(`/api/admin/panel-tokens?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'No se pudo revocar')
        return
      }
      setTokens(prev =>
        prev.map(t =>
          t.id === id
            ? { ...t, revoked_at: new Date().toISOString(), is_active: false }
            : t,
        ),
      )
      if (justCreated?.id === id) setJustCreated(null)
    } catch {
      setError('Error de red al revocar')
    }
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('No se pudo copiar al portapapeles')
    }
  }

  return (
    <main className="min-h-screen bg-nxtup-bg text-white">
      <div className="max-w-3xl w-full mx-auto px-4 sm:px-6 py-8">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
          NXTUP · Admin
        </p>
        <h1 className="text-3xl font-black tracking-tight mb-2">
          Links del Centro de Mando
        </h1>
        <p className="text-nxtup-muted text-sm mb-8 max-w-prose">
          Genera links temporales que dan acceso solo al Centro de Mando de un shop
          específico — sin que el dueño tenga que entrar al dashboard. Tú generas
          aquí, le mandas el URL al dueño, él lo abre y maneja sus barberos.
          Revoca cuando quieras y el link muere al instante.
        </p>

        {error && (
          <div className="bg-nxtup-busy/15 border border-nxtup-busy rounded-lg px-4 py-3 mb-6 text-sm">
            {error}
          </div>
        )}

        {/* ── Sección: generar link ───────────────────────────── */}
        <section className="rounded-2xl bg-nxtup-line/40 border border-nxtup-line p-5 mb-8">
          <h2 className="text-lg font-bold mb-4">Generar nuevo link</h2>

          <label className="block mb-4">
            <span className="text-nxtup-muted text-xs uppercase tracking-widest font-bold">
              Shop
            </span>
            <select
              value={selectedShop}
              onChange={e => setSelectedShop(e.target.value)}
              className="mt-2 w-full bg-nxtup-bg border border-nxtup-dim rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-white"
            >
              {shops.length === 0 ? (
                <option value="">No hay shops</option>
              ) : (
                shops.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))
              )}
            </select>
          </label>

          <label className="block mb-4">
            <span className="text-nxtup-muted text-xs uppercase tracking-widest font-bold">
              Etiqueta (opcional · solo para que te acuerdes)
            </span>
            <input
              type="text"
              value={createLabel}
              onChange={e => setCreateLabel(e.target.value)}
              placeholder="ej. Demo Los Compadres"
              maxLength={80}
              className="mt-2 w-full bg-nxtup-bg border border-nxtup-dim rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-white"
            />
          </label>

          <div className="mb-5">
            <span className="text-nxtup-muted text-xs uppercase tracking-widest font-bold block mb-2">
              Duración
            </span>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {DURATION_PRESETS.map(p => (
                <button
                  key={p.hours}
                  type="button"
                  onClick={() => setCreateHours(p.hours)}
                  className={`rounded-md py-2.5 text-xs font-bold tracking-wide uppercase transition-colors ${
                    createHours === p.hours
                      ? 'bg-white text-black'
                      : 'bg-transparent border border-nxtup-dim text-nxtup-muted hover:text-white hover:border-nxtup-muted'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={createToken}
            disabled={creating || !selectedShop}
            className="w-full sm:w-auto rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-black tracking-wider uppercase hover:bg-emerald-300 transition-colors disabled:opacity-50"
          >
            {creating ? 'Generando…' : 'Generar link'}
          </button>

          {justCreated && (
            <div className="mt-5 p-4 rounded-lg bg-emerald-950/40 border border-emerald-500/40">
              <p className="text-emerald-300 text-xs uppercase tracking-widest font-bold mb-2">
                ✓ Link generado para {justCreated.shop_name} · Cópialo
              </p>
              <code className="block w-full bg-black/40 rounded px-3 py-2 text-xs break-all font-mono mb-3">
                {justCreated.url}
              </code>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyToClipboard(justCreated.url)}
                  className="rounded-md bg-white text-black px-4 py-2 text-xs font-bold tracking-wide uppercase hover:bg-emerald-100 transition-colors"
                >
                  {copied ? '¡Copiado!' : 'Copiar link'}
                </button>
                <a
                  href={justCreated.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md border border-nxtup-dim px-4 py-2 text-xs font-bold tracking-wide uppercase hover:border-white transition-colors"
                >
                  Abrir
                </a>
              </div>
              <p className="text-nxtup-muted text-[11px] mt-3">
                Expira:{' '}
                <span className="tabular-nums">
                  {new Date(justCreated.expires_at).toLocaleString()}
                </span>
              </p>
            </div>
          )}
        </section>

        {/* ── Sección: lista global ───────────────────────────── */}
        <section>
          <h2 className="text-lg font-bold mb-3">Links generados</h2>
          {loading ? (
            <p className="text-nxtup-muted text-sm">Cargando…</p>
          ) : tokens.length === 0 ? (
            <p className="text-nxtup-muted text-sm">No hay links generados aún.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {tokens.map(t => (
                <li
                  key={t.id}
                  className="rounded-xl bg-nxtup-line/40 border border-nxtup-line p-4 flex items-center gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">
                      {t.shop_name}
                      {t.label && (
                        <span className="text-nxtup-muted font-normal">
                          {' '}
                          · {t.label}
                        </span>
                      )}
                    </p>
                    <p className="text-nxtup-muted text-[11px] mt-0.5 tabular-nums">
                      Creado {new Date(t.created_at).toLocaleString()} · Expira{' '}
                      {new Date(t.expires_at).toLocaleString()}
                    </p>
                  </div>
                  <StatusBadge token={t} />
                  {t.is_active && (
                    <button
                      type="button"
                      onClick={() => revokeToken(t.id)}
                      className="rounded-md border border-nxtup-busy/50 text-nxtup-busy px-3 py-2 text-[11px] font-bold tracking-wider uppercase hover:bg-nxtup-busy/20 transition-colors"
                    >
                      Revocar
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}

function StatusBadge({ token }: { token: TokenRow }) {
  if (token.revoked_at) {
    return (
      <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-nxtup-dim/30 text-nxtup-muted">
        Revocado
      </span>
    )
  }
  if (!token.is_active) {
    return (
      <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-nxtup-dim/30 text-nxtup-muted">
        Expirado
      </span>
    )
  }
  return (
    <span className="text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded bg-nxtup-active/20 text-nxtup-active">
      Activo
    </span>
  )
}
