'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

type TokenRow = {
  id: string
  label: string | null
  expires_at: string
  created_at: string
  revoked_at: string | null
  is_active: boolean
}

type CreatedToken = {
  id: string
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

export default function PanelTokensManager({
  shop,
}: {
  shop: { id: string; name: string }
}) {
  const [tokens, setTokens] = useState<TokenRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [creating, setCreating] = useState(false)
  const [createHours, setCreateHours] = useState(24)
  const [createLabel, setCreateLabel] = useState('')
  const [justCreated, setJustCreated] = useState<CreatedToken | null>(null)
  const [copied, setCopied] = useState(false)

  // ── Cargar lista al montar ────────────────────────────────────
  useEffect(() => {
    let cancel = false
    const load = async () => {
      try {
        const res = await fetch('/api/dashboard/panel-tokens')
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
    setCreating(true)
    setError('')
    setJustCreated(null)
    setCopied(false)
    try {
      const res = await fetch('/api/dashboard/panel-tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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
      // Refresh list
      const listRes = await fetch('/api/dashboard/panel-tokens')
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
      const res = await fetch(`/api/dashboard/panel-tokens?id=${id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'No se pudo revocar')
        return
      }
      // Optimistic: marcar revoked en memoria
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
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      <Link
        href="/dashboard/settings"
        className="text-nxtup-muted hover:text-white text-xs uppercase tracking-[0.2em] inline-flex items-center gap-1 mb-4 transition-colors"
      >
        ← Settings
      </Link>
      <h1 className="text-3xl font-black tracking-tight mb-2">
        Acceso temporal al Centro de Mando
      </h1>
      <p className="text-nxtup-muted text-sm mb-8 max-w-prose">
        Genera un link de acceso al Centro de Mando de <strong>{shop.name}</strong> con expiración.
        Quien reciba el link puede ver y manejar los estados de los barberos —
        sin tener cuenta ni acceso al resto del dashboard. Lo puedes revocar cuando quieras.
      </p>

      {error && (
        <div className="bg-nxtup-busy/15 border border-nxtup-busy rounded-lg px-4 py-3 mb-6 text-sm text-white">
          {error}
        </div>
      )}

      {/* ── Sección: generar nuevo link ──────────────────────────── */}
      <section className="rounded-2xl bg-nxtup-line/40 border border-nxtup-line p-5 mb-8">
        <h2 className="text-white text-lg font-bold mb-4">Generar nuevo link</h2>

        <label className="block mb-4">
          <span className="text-nxtup-muted text-xs uppercase tracking-widest font-bold">
            Etiqueta (opcional)
          </span>
          <input
            type="text"
            value={createLabel}
            onChange={e => setCreateLabel(e.target.value)}
            placeholder="ej. Demo Los Compadres"
            maxLength={80}
            className="mt-2 w-full bg-nxtup-bg border border-nxtup-dim rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white"
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
          disabled={creating}
          className="w-full sm:w-auto rounded-lg bg-nxtup-active text-black px-5 py-3 text-sm font-black tracking-wider uppercase hover:bg-emerald-300 transition-colors disabled:opacity-50"
        >
          {creating ? 'Generando…' : 'Generar link'}
        </button>

        {justCreated && (
          <div className="mt-5 p-4 rounded-lg bg-emerald-950/40 border border-emerald-500/40">
            <p className="text-emerald-300 text-xs uppercase tracking-widest font-bold mb-2">
              ✓ Link generado · Cópialo ahora
            </p>
            <code className="block w-full bg-black/40 rounded px-3 py-2 text-white text-xs break-all font-mono mb-3">
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
                className="rounded-md border border-nxtup-dim text-white px-4 py-2 text-xs font-bold tracking-wide uppercase hover:border-white transition-colors"
              >
                Abrir
              </a>
            </div>
            <p className="text-nxtup-muted text-[11px] mt-3">
              Expira:{' '}
              <span className="text-white tabular-nums">
                {new Date(justCreated.expires_at).toLocaleString()}
              </span>
            </p>
          </div>
        )}
      </section>

      {/* ── Sección: lista de tokens ─────────────────────────────── */}
      <section>
        <h2 className="text-white text-lg font-bold mb-3">Links generados</h2>
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
                  <p className="text-white text-sm font-bold truncate">
                    {t.label || <span className="text-nxtup-muted italic">Sin etiqueta</span>}
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
