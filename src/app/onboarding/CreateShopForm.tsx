'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2MB
const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']

export default function CreateShopForm() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!logoFile) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(logoFile)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [logoFile])

  function handleFile(file: File | null | undefined) {
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
    setLogoFile(file)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      router.push('/login')
      return
    }

    const { data: shop, error: insertError } = await supabase
      .from('shops')
      .insert({
        name: name.trim(),
        owner_id: user.id,
      })
      .select('id')
      .single()

    if (insertError || !shop) {
      setError(insertError?.message ?? 'No se pudo crear el shop.')
      setLoading(false)
      return
    }

    if (logoFile) {
      const ext = logoFile.name.split('.').pop()?.toLowerCase() || 'png'
      const path = `${shop.id}/logo.${ext}`
      const { error: uploadErr } = await supabase.storage
        .from('shop-logos')
        .upload(path, logoFile, { upsert: true, contentType: logoFile.type })

      if (uploadErr) {
        // Don't block onboarding — shop is created, owner can re-upload from settings.
        console.error('Logo upload failed:', uploadErr.message)
      } else {
        const {
          data: { publicUrl },
        } = supabase.storage.from('shop-logos').getPublicUrl(path)
        await supabase.from('shops').update({ logo_url: publicUrl }).eq('id', shop.id)
      }
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <label className="text-nxtup-muted text-xs uppercase tracking-widest block mb-2">
        Shop name
      </label>
      <input
        required
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Fade Factory"
        autoFocus
        className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim mb-6"
      />

      <label className="text-nxtup-muted text-xs uppercase tracking-widest block mb-2">
        Logo <span className="text-nxtup-dim normal-case tracking-normal">· optional</span>
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="sr-only"
        onChange={e => handleFile(e.target.files?.[0])}
      />

      {preview ? (
        <div className="flex items-center gap-4 bg-nxtup-line border border-nxtup-dim rounded-lg p-3 mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Logo preview"
            className="w-14 h-14 object-contain rounded-md bg-black/40"
          />
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">
              {logoFile?.name}
            </p>
            <p className="text-nxtup-muted text-xs">
              {logoFile && Math.round(logoFile.size / 1024)} KB
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setLogoFile(null)
              if (fileInputRef.current) fileInputRef.current.value = ''
            }}
            className="text-nxtup-muted hover:text-nxtup-busy text-xs px-2 py-1 transition-colors"
          >
            Remove
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full border border-dashed border-nxtup-dim hover:border-white rounded-lg px-4 py-6 mb-6 text-center transition-colors"
        >
          <p className="text-white text-sm font-medium">Upload logo</p>
          <p className="text-nxtup-dim text-xs mt-1">PNG, JPG, WebP o SVG · max 2 MB</p>
        </button>
      )}

      {error && <p className="text-nxtup-busy text-sm mb-4">{error}</p>}

      <button
        type="submit"
        disabled={loading || !name.trim()}
        className="w-full bg-white text-black font-semibold py-4 rounded-lg disabled:opacity-40 transition-all active:scale-[0.98]"
      >
        {loading ? 'Creating...' : 'Create shop'}
      </button>
    </form>
  )
}
