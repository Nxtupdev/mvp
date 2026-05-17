'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { Avatar } from './avatars'

// ============================================================
// ShareBarberModal — the missing piece in onboarding a new barber.
//
// Barbers don't sign up or create an account; their identity is the
// URL `/barber/[shop_id]/[barber_id]`. So the *only* way the owner
// gets them into the system is by sending that URL to them. This
// modal makes that one task feel built-in instead of left as homework:
//
//   * QR code — the in-shop path. Owner shows their screen, barber
//     scans with the phone camera, link opens in their default browser.
//   * Copy link — generic fallback, perfect for pasting into WhatsApp,
//     SMS, or anywhere else by hand.
//   * WhatsApp — wa.me deep-link with a pre-filled greeting in Spanish.
//     This is the realistic dominant channel in DR.
//   * Native share — when the browser supports navigator.share (modern
//     iOS Safari + Android Chrome), surface the OS share sheet so the
//     owner can send via AirDrop, Messages, etc.
// ============================================================

export default function ShareBarberModal({
  barberId,
  barberName,
  barberAvatar,
  shopId,
  shopName,
  onClose,
}: {
  barberId: string
  barberName: string
  // Widened from AvatarId — see migration 015 / shop avatars.
  barberAvatar: string | null
  shopId: string
  shopName: string
  onClose: () => void
}) {
  // Use the live origin so the URL works whether the dashboard is open
  // on getnxtup.com, a Vercel preview, or localhost during dev.
  const url = useMemo(() => {
    if (typeof window === 'undefined') return ''
    return `${window.location.origin}/barber/${shopId}/${barberId}`
  }, [shopId, barberId])

  const message = useMemo(() => {
    return `Hola ${barberName}, este es tu panel de NXTUP en ${shopName}. Ábrelo y al final podés instalar la app en tu celular:\n\n${url}`
  }, [barberName, shopName, url])

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [canNativeShare, setCanNativeShare] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  // Generate the QR as a data URL once the modal mounts. The size is
  // chosen so the image stays crisp at ~240px display while still
  // being scannable from across a barber chair.
  useEffect(() => {
    if (!url) return
    let cancelled = false
    QRCode.toDataURL(url, {
      width: 480,
      margin: 1,
      color: { dark: '#000000', light: '#FFFFFF' },
      errorCorrectionLevel: 'M',
    })
      .then(d => {
        if (!cancelled) setQrDataUrl(d)
      })
      .catch(() => {
        // QR is a nice-to-have. If generation fails (shouldn't, but
        // defensive), the modal still works via Copy + WhatsApp.
        if (!cancelled) setQrDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [url])

  // Web Share API check — only available in secure contexts on
  // browsers that implement it. We feature-detect inside an effect
  // so SSR stays happy.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      setCanNativeShare(true)
    }
  }, [])

  // Esc-to-close + focus management. Keeps the modal accessible to
  // keyboard users on the desktop dashboard view.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    closeButtonRef.current?.focus()
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      // Some browsers reject clipboard in non-HTTPS contexts. Fall
      // back to a select-all on a hidden input would be overkill —
      // the user can long-press the visible URL text below instead.
    }
  }

  function handleWhatsApp() {
    // wa.me works on web (opens web.whatsapp.com) AND on mobile
    // (opens the native WhatsApp app). No phone number = opens chat
    // picker so the owner chooses who to send to.
    const wa = `https://wa.me/?text=${encodeURIComponent(message)}`
    window.open(wa, '_blank', 'noopener')
  }

  async function handleNativeShare() {
    try {
      await navigator.share({
        title: `NXTUP — ${barberName}`,
        text: message,
        url,
      })
    } catch {
      // User dismissed share sheet — nothing to do.
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-barber-title"
      className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-nxtup-bg border border-nxtup-line rounded-2xl p-6 w-full max-w-sm max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header: who you're sharing with */}
        <div className="flex items-center gap-3 mb-5">
          <Avatar avatar={barberAvatar} name={barberName} size={40} />
          <div className="flex-1 min-w-0">
            <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
              Compartir con
            </p>
            <h2
              id="share-barber-title"
              className="text-white text-lg font-black tracking-tight truncate"
            >
              {barberName}
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="text-nxtup-muted hover:text-white text-sm px-2 py-1"
          >
            ✕
          </button>
        </div>

        {/* QR code — primary in-shop path */}
        <div className="bg-white rounded-xl p-4 mb-4 flex items-center justify-center">
          {qrDataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt={`QR para abrir el panel de ${barberName}`}
              width={240}
              height={240}
              className="w-60 h-60"
            />
          ) : (
            <div className="w-60 h-60 flex items-center justify-center text-black/40 text-sm">
              Generando QR...
            </div>
          )}
        </div>
        <p className="text-nxtup-muted text-xs text-center mb-5">
          Que escanee este código con la cámara de su celular.
        </p>

        {/* The URL itself — long-press to select on mobile */}
        <div className="bg-nxtup-line border border-nxtup-dim rounded-lg px-3 py-2 mb-4">
          <p
            className="text-nxtup-muted text-[10px] uppercase tracking-[0.2em] font-bold mb-1"
          >
            Link
          </p>
          <p className="text-white text-xs font-mono break-all select-all">
            {url}
          </p>
        </div>

        {/* Remote-sharing actions */}
        <div className="flex flex-col gap-2 mb-5">
          <button
            type="button"
            onClick={handleCopy}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-white text-black font-bold text-sm tracking-tight active:scale-[0.98] transition-transform"
          >
            {copied ? (
              <>
                <CheckIcon />
                <span>Copiado</span>
              </>
            ) : (
              <>
                <CopyIcon />
                <span>Copiar link</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleWhatsApp}
            className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg bg-emerald-600 text-white font-bold text-sm tracking-tight active:scale-[0.98] transition-transform hover:bg-emerald-500"
          >
            <WhatsAppIcon />
            <span>Enviar por WhatsApp</span>
          </button>

          {canNativeShare && (
            <button
              type="button"
              onClick={handleNativeShare}
              className="w-full inline-flex items-center justify-center gap-2 py-3 rounded-lg border border-nxtup-dim text-white font-medium text-sm tracking-tight active:scale-[0.98] transition-transform"
            >
              <ShareIcon />
              <span>Más opciones...</span>
            </button>
          )}
        </div>

        <p className="text-nxtup-dim text-[11px] leading-relaxed text-center">
          El barbero verá su panel para marcar Active / Busy / Break. Desde
          ahí puede instalar la app en su pantalla de inicio.
        </p>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Inline icons
// ──────────────────────────────────────────────────────────────

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function WhatsAppIcon() {
  // Simplified WhatsApp glyph — speech bubble with a phone inside.
  // Brand guidelines technically restrict the exact logo so we draw a
  // recognisable but generic chat-with-phone mark.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 0-8.5 15.2L2 22l4.9-1.5A10 10 0 1 0 12 2zm5.4 14.2c-.2.6-1.2 1.2-1.7 1.3-.4.1-1 .1-1.6-.1-.4-.1-.9-.3-1.6-.6-2.8-1.2-4.6-4-4.7-4.2-.1-.2-1.1-1.5-1.1-2.9 0-1.3.7-2 1-2.3.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.4.2.5.7 1.7.8 1.8.1.1.1.3 0 .5-.1.2-.2.3-.3.5l-.4.5c-.1.1-.3.3-.1.6.2.3.7 1.2 1.6 2 1.1.9 2 1.2 2.3 1.4.3.1.5.1.6 0 .2-.2.7-.8.9-1.1.2-.3.4-.2.7-.1.3.1 1.7.8 2 .9.3.1.5.2.6.4.1.2.1.9-.1 1.5z" />
    </svg>
  )
}

function ShareIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}
