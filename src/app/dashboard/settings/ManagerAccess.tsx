'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useLocale } from '@/lib/i18n'

// ──────────────────────────────────────────────────────────────
// ManagerAccess — "Acceso de encargado" (068).
//
// El dueño crea links permanentes del Centro de Mando para gente
// de confianza (encargados) y los revoca cuando quiera. Reutiliza
// la infraestructura de la 043 (shop_control_tokens + /panel/
// [shop_id]?t=...): esta sección solo escribe filas con
// expires_at = null (permanente) y lista/revoca las suyas vía la
// RLS de la 043 ("Owners manage their shop control tokens").
//
// El filtro .is('expires_at', null) deja fuera los tokens
// temporales de staff (demos de la 043) — aquí solo se manejan
// accesos de encargado.
// ──────────────────────────────────────────────────────────────

type AccessRow = {
  id: string
  token: string
  label: string | null
  created_at: string
}

// 32 bytes aleatorios → base64url, mismo formato y entropía que el
// endpoint de staff (admin/panel-tokens usa randomBytes(32).base64url).
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export default function ManagerAccessSection({ shopId }: { shopId: string }) {
  const { t, locale } = useLocale()
  const [rows, setRows] = useState<AccessRow[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState<'create' | string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('shop_control_tokens')
      .select('id, token, label, created_at')
      .eq('shop_id', shopId)
      .is('expires_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setRows((data as AccessRow[]) ?? []))
  }, [shopId])

  const panelUrl = (token: string) =>
    `${window.location.origin}/panel/${shopId}?t=${token}`

  async function create() {
    const label = name.trim()
    if (!label) return
    setBusy('create')
    setError(null)
    const supabase = createClient()
    const token = generateToken()
    const { data, error: insertErr } = await supabase
      .from('shop_control_tokens')
      .insert({ shop_id: shopId, token, label, expires_at: null })
      .select('id, token, label, created_at')
      .single()
    if (insertErr || !data) {
      setError(t('settings.access.errorCreate'))
    } else {
      setRows(prev => [data as AccessRow, ...prev])
      setName('')
    }
    setBusy(null)
  }

  async function copyLink(row: AccessRow) {
    try {
      await navigator.clipboard.writeText(panelUrl(row.token))
      setCopiedId(row.id)
      setTimeout(() => setCopiedId(prev => (prev === row.id ? null : prev)), 2000)
    } catch {
      // Clipboard bloqueado (contexto no seguro / permisos) — mostrar el
      // link con prompt para que el dueño lo copie a mano.
      prompt(t('settings.access.copy'), panelUrl(row.token))
    }
  }

  async function revoke(row: AccessRow) {
    const who = row.label ?? '—'
    if (!confirm(t('settings.access.revokeConfirm', { name: who }))) return
    setBusy(row.id)
    setError(null)
    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('shop_control_tokens')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', row.id)
    if (updateErr) {
      setError(t('settings.access.errorRevoke'))
    } else {
      setRows(prev => prev.filter(r => r.id !== row.id))
    }
    setBusy(null)
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xs uppercase tracking-[0.3em] text-nxtup-muted font-bold mb-2">
          {t('settings.access.heading')}
        </h2>
        <p className="text-nxtup-dim text-xs leading-relaxed max-w-prose">
          {t('settings.access.blurb')}
        </p>
      </div>

      <div className="border border-nxtup-line rounded-xl p-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[180px]">
            <label
              htmlFor="manager-access-name"
              className="text-nxtup-muted text-[10px] uppercase tracking-widest mb-1 block"
            >
              {t('settings.access.nameLabel')}
            </label>
            <input
              id="manager-access-name"
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void create()
                }
              }}
              placeholder={t('settings.access.namePlaceholder')}
              maxLength={40}
              className="w-full bg-transparent border border-nxtup-line rounded-md px-3 py-2 text-sm text-white placeholder:text-nxtup-dim focus:border-nxtup-dim focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={create}
            disabled={busy !== null || !name.trim()}
            className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-md disabled:opacity-40 transition-opacity active:scale-[0.98]"
          >
            {busy === 'create'
              ? t('settings.access.creating')
              : t('settings.access.create')}
          </button>
        </div>

        {rows.length === 0 ? (
          <p className="text-nxtup-dim text-xs">{t('settings.access.empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map(row => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-nxtup-line rounded-lg px-3 py-2"
              >
                <div>
                  <p className="text-white text-sm font-medium">{row.label ?? '—'}</p>
                  <p className="text-nxtup-dim text-[11px]">
                    {t('settings.access.since')}{' '}
                    {new Date(row.created_at).toLocaleDateString(
                      locale === 'en' ? 'en-US' : 'es-DO',
                      { day: 'numeric', month: 'short', year: 'numeric' },
                    )}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => copyLink(row)}
                    disabled={busy !== null}
                    className="px-3 py-1.5 border border-nxtup-dim text-nxtup-muted hover:text-white hover:border-white text-xs rounded-md disabled:opacity-40 transition-colors"
                  >
                    {copiedId === row.id
                      ? t('settings.access.copied')
                      : t('settings.access.copy')}
                  </button>
                  <button
                    type="button"
                    onClick={() => revoke(row)}
                    disabled={busy !== null}
                    className="px-3 py-1.5 border border-nxtup-dim text-nxtup-muted hover:text-nxtup-busy hover:border-nxtup-busy text-xs rounded-md disabled:opacity-40 transition-colors"
                  >
                    {busy === row.id ? '…' : t('settings.access.revoke')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-nxtup-busy text-sm">{error}</p>}
      </div>
    </section>
  )
}
