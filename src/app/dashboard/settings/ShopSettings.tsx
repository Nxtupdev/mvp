'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type BreakMode = 'guaranteed' | 'not_guaranteed'

type Shop = {
  id: string
  name: string
  max_queue_size: number
  first_break_minutes: number
  next_break_minutes: number
  // Legacy toggle — kept on the type for back-compat with rows that
  // still set it, but the new break_mode field is what the API reads.
  keep_position_on_break: boolean
  break_position_grace_minutes: number
  break_mode: BreakMode
  trusted_public_ip: string | null
  timezone: string
  is_open: boolean
  logo_url: string | null
}

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'Eastern (NY, Miami) — DST' },
  { value: 'America/Santo_Domingo', label: 'Santo Domingo (RD) — UTC-4 fijo' },
  { value: 'America/Chicago', label: 'Central (Chicago, CDMX*) — DST' },
  { value: 'America/Mexico_City', label: 'Ciudad de México — DST' },
  { value: 'America/Denver', label: 'Mountain (Denver) — DST' },
  { value: 'America/Los_Angeles', label: 'Pacific (LA) — DST' },
  { value: 'America/Bogota', label: 'Bogotá — UTC-5 fijo' },
  { value: 'America/Lima', label: 'Lima — UTC-5 fijo' },
  { value: 'America/Caracas', label: 'Caracas — UTC-4 fijo' },
] as const

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export default function ShopSettings({
  shop: initial,
  userEmail,
  currentIp,
}: {
  shop: Shop
  userEmail: string
  currentIp: string | null
}) {
  const router = useRouter()
  const [shop, setShop] = useState(initial)
  const [name, setName] = useState(initial.name)
  const [maxQueue, setMaxQueue] = useState(initial.max_queue_size)
  const [firstBreak, setFirstBreak] = useState(initial.first_break_minutes)
  const [nextBreak, setNextBreak] = useState(initial.next_break_minutes)
  const [breakMode, setBreakMode] = useState<BreakMode>(initial.break_mode ?? 'guaranteed')
  const [graceMinutes, setGraceMinutes] = useState(initial.break_position_grace_minutes)
  const [timezone, setTimezone] = useState(initial.timezone || 'America/New_York')
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState('')

  const dirty =
    name.trim() !== shop.name ||
    maxQueue !== shop.max_queue_size ||
    firstBreak !== shop.first_break_minutes ||
    nextBreak !== shop.next_break_minutes ||
    breakMode !== shop.break_mode ||
    graceMinutes !== shop.break_position_grace_minutes ||
    timezone !== shop.timezone

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (saving || !dirty || !name.trim()) return
    setSaving(true)
    setError('')
    const supabase = createClient()

    // Compute the diff before saving so we can write a single
    // shop_settings_changed activity log entry. Helps the owner see
    // exactly when rules changed when reviewing disputes.
    const changes: Record<string, { from: unknown; to: unknown }> = {}
    if (name.trim() !== shop.name) changes.name = { from: shop.name, to: name.trim() }
    if (maxQueue !== shop.max_queue_size)
      changes.max_queue_size = { from: shop.max_queue_size, to: maxQueue }
    if (firstBreak !== shop.first_break_minutes)
      changes.first_break_minutes = { from: shop.first_break_minutes, to: firstBreak }
    if (nextBreak !== shop.next_break_minutes)
      changes.next_break_minutes = { from: shop.next_break_minutes, to: nextBreak }
    if (breakMode !== shop.break_mode)
      changes.break_mode = { from: shop.break_mode, to: breakMode }
    if (graceMinutes !== shop.break_position_grace_minutes)
      changes.break_position_grace_minutes = {
        from: shop.break_position_grace_minutes,
        to: graceMinutes,
      }
    if (timezone !== shop.timezone)
      changes.timezone = { from: shop.timezone, to: timezone }

    const { data, error: updateErr } = await supabase
      .from('shops')
      .update({
        name: name.trim(),
        max_queue_size: maxQueue,
        first_break_minutes: firstBreak,
        next_break_minutes: nextBreak,
        break_mode: breakMode,
        break_position_grace_minutes: graceMinutes,
        timezone,
      })
      .eq('id', shop.id)
      .select(
        'id, name, max_queue_size, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, break_mode, trusted_public_ip, timezone, is_open, logo_url',
      )
      .single()

    if (updateErr) {
      setError(updateErr.message)
    } else if (data) {
      setShop(data as Shop)
      setSavedAt(new Date())
      // Best-effort audit log entry. Failure here doesn't block the save.
      if (Object.keys(changes).length > 0) {
        await supabase.from('activity_log').insert({
          shop_id: shop.id,
          action: 'shop_settings_changed',
          metadata: { changes },
        })
      }
      router.refresh()
    }
    setSaving(false)
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-2xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">Settings</h1>
      <p className="text-nxtup-muted text-sm mb-8">
        Configuración del shop. Los cambios afectan al display, check-in y barber app.
      </p>

      <form onSubmit={handleSave} className="flex flex-col gap-6">
        <Field label="Shop name">
          <input
            required
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
          />
        </Field>

        <Field label="Max queue size" hint="Cupos disponibles a la vez">
          <input
            type="number"
            min={1}
            max={100}
            value={maxQueue}
            onChange={e => setMaxQueue(Number(e.target.value))}
            className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none tabular-nums"
          />
        </Field>

        <div>
          <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-1 font-bold">
            Breaks
          </p>
          <p className="text-nxtup-dim text-xs mb-4 leading-relaxed">
            El primer break del turno suele ser más largo (almuerzo). Los breaks
            siguientes son más cortos (baño, fumar). Se reinicia el contador cuando
            el barbero termina su turno.
          </p>
          <div className="grid grid-cols-2 gap-4">
            <Field label="First break (min)" hint="Almuerzo / break largo">
              <input
                type="number"
                min={1}
                max={180}
                value={firstBreak}
                onChange={e => setFirstBreak(Number(e.target.value))}
                className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none tabular-nums"
              />
            </Field>
            <Field label="Next break (min)" hint="Cualquier break después del primero">
              <input
                type="number"
                min={1}
                max={120}
                value={nextBreak}
                onChange={e => setNextBreak(Number(e.target.value))}
                className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none tabular-nums"
              />
            </Field>
          </div>
        </div>

        <div>
          <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-1 font-bold">
            Reglas de la cola
          </p>
          <p className="text-nxtup-dim text-xs mb-4 leading-relaxed">
            Cada barbería opera diferente. Estas reglas determinan qué pasa con la
            posición FIFO de un barbero cuando toma break.
          </p>

          {/* Two-radio picker. The wording is intentionally direct so
              the owner reads the trade-off without ambiguity — this
              setting affects every barber's daily reality. */}
          <fieldset className="flex flex-col gap-2">
            <legend className="sr-only">Política del turno durante break</legend>

            <BreakModeOption
              value="guaranteed"
              selected={breakMode === 'guaranteed'}
              onChange={setBreakMode}
              title="Turno garantizado"
              body="El barbero conserva su posición FIFO mientras esté en break y vuelva dentro del tiempo + gracia. Predictable: si vuelve a tiempo, recupera el turno pase lo que pase."
            />

            <BreakModeOption
              value="not_guaranteed"
              selected={breakMode === 'not_guaranteed'}
              onChange={setBreakMode}
              title="Turno no garantizado"
              body="Igual al anterior, PERO si alguien que estaba debajo en la fila toma un walk-in y lo termina durante el break, el barbero pierde su turno aunque regrese a tiempo. Empuja a tomar break en momentos tranquilos."
            />
          </fieldset>

          <div className="mt-4">
            <Field
              label="Minutos de gracia post-break"
              hint="Tiempo extra después del break antes de perder la posición. Aplica a ambos modos."
            >
              <input
                type="number"
                min={0}
                max={60}
                value={graceMinutes}
                onChange={e => setGraceMinutes(Number(e.target.value))}
                className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none tabular-nums"
              />
            </Field>
          </div>
        </div>

        <Field
          label="Zona horaria del shop"
          hint="Define qué es 'hoy' para las stats, la bitácora y los resets diarios. Cambiala si el shop opera en otra ciudad."
        >
          <select
            value={timezone}
            onChange={e => setTimezone(e.target.value)}
            className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none"
          >
            {TIMEZONE_OPTIONS.map(o => (
              <option key={o.value} value={o.value} className="bg-nxtup-bg">
                {o.label}
              </option>
            ))}
            {/* Allow the current value even if it's not in our preset list */}
            {!TIMEZONE_OPTIONS.find(o => o.value === timezone) && (
              <option value={timezone} className="bg-nxtup-bg">
                {timezone}
              </option>
            )}
          </select>
        </Field>

        {error && <p className="text-nxtup-busy text-sm">{error}</p>}

        <div className="flex items-center gap-4">
          <button
            type="submit"
            disabled={saving || !dirty || !name.trim()}
            className="px-5 py-3 bg-white text-black font-semibold rounded-lg disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {saving ? 'Saving...' : 'Save changes'}
          </button>
          {savedAt && !dirty && (
            <span className="text-nxtup-active text-sm">Saved</span>
          )}
        </div>
      </form>

      <hr className="border-nxtup-line my-10" />

      <AntiCheatSection
        shop={shop}
        currentIp={currentIp}
        onUpdated={(s) => { setShop(s); router.refresh() }}
      />

      <hr className="border-nxtup-line my-10" />

      <LogoSection shop={shop} onUpdated={(s) => { setShop(s); router.refresh() }} />

      <hr className="border-nxtup-line my-10" />

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-[0.3em] text-nxtup-muted font-bold mb-3">
          Account
        </h2>
        <div className="flex items-center justify-between border border-nxtup-line rounded-xl px-4 py-3">
          <div>
            <p className="text-nxtup-muted text-xs uppercase tracking-widest mb-1">
              Email
            </p>
            <p className="text-white font-medium">{userEmail}</p>
          </div>
          <form action="/auth/signout" method="POST">
            <button
              type="submit"
              className="text-nxtup-muted hover:text-nxtup-busy text-sm transition-colors"
            >
              Sign out
            </button>
          </form>
        </div>
      </section>
    </main>
  )
}

function LogoSection({
  shop,
  onUpdated,
}: {
  shop: Shop
  onUpdated: (next: Shop) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState<'upload' | 'remove' | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!pendingFile) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(pendingFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingFile])

  function pickFile(file: File | null | undefined) {
    if (!file) return
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Formato no soportado. Usa PNG, JPG, WebP o SVG.')
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError('El logo debe pesar menos de 2 MB.')
      return
    }
    setError('')
    setPendingFile(file)
  }

  async function handleUpload() {
    if (!pendingFile || busy) return
    setBusy('upload')
    setError('')

    const supabase = createClient()
    const ext = pendingFile.name.split('.').pop()?.toLowerCase() || 'png'
    const path = `${shop.id}/logo.${ext}`

    // If a previous logo lived at a different extension, remove it so we don't orphan files.
    if (shop.logo_url) {
      const oldPath = extractStoragePath(shop.logo_url)
      if (oldPath && oldPath !== path) {
        await supabase.storage.from('shop-logos').remove([oldPath])
      }
    }

    const { error: uploadErr } = await supabase.storage
      .from('shop-logos')
      .upload(path, pendingFile, { upsert: true, contentType: pendingFile.type })

    if (uploadErr) {
      setError(uploadErr.message)
      setBusy(null)
      return
    }

    // Cache-bust by appending updated_at marker
    const {
      data: { publicUrl },
    } = supabase.storage.from('shop-logos').getPublicUrl(path)
    const cacheBusted = `${publicUrl}?t=${Date.now()}`

    const { data: updated, error: updateErr } = await supabase
      .from('shops')
      .update({ logo_url: cacheBusted })
      .eq('id', shop.id)
      .select(
        'id, name, max_queue_size, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, break_mode, trusted_public_ip, timezone, is_open, logo_url',
      )
      .single()

    if (updateErr) {
      setError(updateErr.message)
    } else if (updated) {
      onUpdated(updated as Shop)
      setPendingFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    setBusy(null)
  }

  async function handleRemove() {
    if (!shop.logo_url || busy) return
    if (!confirm('Eliminar logo del shop?')) return
    setBusy('remove')
    setError('')

    const supabase = createClient()
    const path = extractStoragePath(shop.logo_url)
    if (path) {
      await supabase.storage.from('shop-logos').remove([path])
    }

    const { data: updated, error: updateErr } = await supabase
      .from('shops')
      .update({ logo_url: null })
      .eq('id', shop.id)
      .select(
        'id, name, max_queue_size, first_break_minutes, next_break_minutes, keep_position_on_break, break_position_grace_minutes, break_mode, trusted_public_ip, timezone, is_open, logo_url',
      )
      .single()

    if (updateErr) {
      setError(updateErr.message)
    } else if (updated) {
      onUpdated(updated as Shop)
    }
    setBusy(null)
  }

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-xs uppercase tracking-[0.3em] text-nxtup-muted font-bold">
        Logo
      </h2>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={e => pickFile(e.target.files?.[0])}
      />

      <div className="flex items-center gap-4 border border-nxtup-line rounded-xl p-4">
        <div className="w-16 h-16 rounded-md bg-nxtup-line flex items-center justify-center overflow-hidden flex-shrink-0">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Logo preview" className="w-full h-full object-contain" />
          ) : shop.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={shop.logo_url} alt="Current logo" className="w-full h-full object-contain" />
          ) : (
            <span className="text-nxtup-dim text-xs">No logo</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          {pendingFile ? (
            <>
              <p className="text-white text-sm font-medium truncate">{pendingFile.name}</p>
              <p className="text-nxtup-muted text-xs">
                {Math.round(pendingFile.size / 1024)} KB · listo para subir
              </p>
            </>
          ) : shop.logo_url ? (
            <>
              <p className="text-white text-sm font-medium">Logo actual</p>
              <p className="text-nxtup-muted text-xs">Se muestra en el dashboard, display y check-in</p>
            </>
          ) : (
            <>
              <p className="text-white text-sm font-medium">Sin logo</p>
              <p className="text-nxtup-muted text-xs">PNG, JPG, WebP o SVG · max 2 MB</p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2 items-stretch">
          {pendingFile ? (
            <>
              <button
                type="button"
                onClick={handleUpload}
                disabled={busy !== null}
                className="px-3 py-1.5 bg-white text-black text-xs font-semibold rounded-md disabled:opacity-40 transition-opacity active:scale-[0.98]"
              >
                {busy === 'upload' ? 'Subiendo...' : 'Save logo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setPendingFile(null)
                  if (fileInputRef.current) fileInputRef.current.value = ''
                }}
                disabled={busy !== null}
                className="text-nxtup-muted hover:text-white text-xs px-2 py-1 transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={busy !== null}
                className="px-3 py-1.5 bg-nxtup-bg border border-nxtup-dim hover:border-white text-white text-xs font-medium rounded-md disabled:opacity-40 transition-colors"
              >
                {shop.logo_url ? 'Replace' : 'Upload'}
              </button>
              {shop.logo_url && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={busy !== null}
                  className="text-nxtup-muted hover:text-nxtup-busy text-xs px-2 py-1 transition-colors disabled:opacity-40"
                >
                  {busy === 'remove' ? 'Removing...' : 'Remove'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {error && <p className="text-nxtup-busy text-sm">{error}</p>}
    </section>
  )
}

function extractStoragePath(publicUrl: string): string | null {
  // publicUrl looks like:
  //   https://<project>.supabase.co/storage/v1/object/public/shop-logos/<shop_id>/logo.png?t=...
  // We want: <shop_id>/logo.png
  try {
    const url = new URL(publicUrl)
    const marker = '/object/public/shop-logos/'
    const idx = url.pathname.indexOf(marker)
    if (idx === -1) return null
    return url.pathname.slice(idx + marker.length)
  } catch {
    return null
  }
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-nxtup-muted text-xs uppercase tracking-widest block mb-2">
        {label}
      </label>
      {children}
      {hint && <p className="text-nxtup-dim text-xs mt-1.5">{hint}</p>}
    </div>
  )
}

function AntiCheatSection({
  shop,
  currentIp,
  onUpdated,
}: {
  shop: Shop
  currentIp: string | null
  onUpdated: (next: Shop) => void
}) {
  const [busy, setBusy] = useState<'save' | 'clear' | null>(null)
  const [error, setError] = useState('')

  const trusted = shop.trusted_public_ip
  const enabled = Boolean(trusted)
  const isHereNow = enabled && currentIp && currentIp === trusted

  async function save() {
    if (busy) return
    setBusy('save')
    setError('')
    const res = await fetch('/api/shops/refresh-ip', { method: 'POST' })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
    } else {
      onUpdated({ ...shop, trusted_public_ip: data.trusted_public_ip })
    }
    setBusy(null)
  }

  async function clear() {
    if (busy) return
    if (
      !confirm(
        'Desactivar la protección? Los barberos podrán entrar a la fila desde cualquier red.',
      )
    )
      return
    setBusy('clear')
    setError('')
    const res = await fetch('/api/shops/refresh-ip', { method: 'DELETE' })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Error al desactivar')
    } else {
      onUpdated({ ...shop, trusted_public_ip: null })
    }
    setBusy(null)
  }

  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-xs uppercase tracking-[0.3em] text-nxtup-muted font-bold mb-2">
          Anti-trampa por ubicación
        </h2>
        <p className="text-nxtup-dim text-xs leading-relaxed max-w-prose">
          Solo se permite entrar a la fila desde la conexión WiFi de la
          barbería. Registrá la IP del shop una vez parado adentro y conectado
          al WiFi. Si tu internet cambia (raro pero pasa), volvé a tocar
          &quot;Registrar IP actual&quot;.
        </p>
      </div>

      <div className="border border-nxtup-line rounded-xl p-4 flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-nxtup-muted text-[10px] uppercase tracking-widest mb-1">
              IP registrada del shop
            </p>
            <p className="text-white font-mono tabular-nums">
              {trusted ?? <span className="text-nxtup-dim">No registrada</span>}
            </p>
          </div>
          <div>
            <p className="text-nxtup-muted text-[10px] uppercase tracking-widest mb-1">
              Tu IP ahora mismo
            </p>
            <p className="text-white font-mono tabular-nums">
              {currentIp ?? <span className="text-nxtup-dim">—</span>}
            </p>
          </div>
        </div>

        {enabled && (
          <p
            className={`text-xs font-medium ${
              isHereNow ? 'text-nxtup-active' : 'text-nxtup-break'
            }`}
          >
            {isHereNow
              ? '✓ Estás conectado desde la red del shop'
              : 'No estás conectado desde la red del shop'}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={save}
            disabled={busy !== null || !currentIp}
            className="px-4 py-2 bg-white text-black text-sm font-semibold rounded-md disabled:opacity-40 transition-opacity active:scale-[0.98]"
          >
            {busy === 'save'
              ? 'Guardando…'
              : enabled
                ? 'Refrescar IP del shop'
                : 'Registrar IP actual'}
          </button>
          {enabled && (
            <button
              type="button"
              onClick={clear}
              disabled={busy !== null}
              className="px-4 py-2 border border-nxtup-dim text-nxtup-muted hover:text-nxtup-busy hover:border-nxtup-busy text-sm rounded-md disabled:opacity-40 transition-colors"
            >
              {busy === 'clear' ? 'Desactivando…' : 'Desactivar protección'}
            </button>
          )}
        </div>

        {error && <p className="text-nxtup-busy text-sm">{error}</p>}
      </div>
    </section>
  )
}

// ──────────────────────────────────────────────────────────────
// BreakModeOption — one of the two radio-style cards in the
// Reglas de la cola section. Made a component so the visual
// treatment stays consistent between the two options without
// copy-paste drift.
// ──────────────────────────────────────────────────────────────

function BreakModeOption({
  value,
  selected,
  onChange,
  title,
  body,
}: {
  value: BreakMode
  selected: boolean
  onChange: (next: BreakMode) => void
  title: string
  body: string
}) {
  return (
    <label
      className={`flex items-start gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-colors ${
        selected
          ? 'border-white bg-nxtup-line/50'
          : 'border-nxtup-line hover:border-nxtup-dim'
      }`}
    >
      <input
        type="radio"
        name="break-mode"
        value={value}
        checked={selected}
        onChange={() => onChange(value)}
        className="mt-1 h-4 w-4 accent-white cursor-pointer flex-shrink-0"
      />
      <div className="flex-1">
        <p className="text-white font-medium text-sm">{title}</p>
        <p className="text-nxtup-muted text-xs mt-1 leading-relaxed">{body}</p>
      </div>
    </label>
  )
}
