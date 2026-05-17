'use client'

import { useEffect, useState } from 'react'
import { useLocale } from '@/lib/i18n'
import InstallDemo from './InstallDemo'

// ============================================================
// InstallButton — the visible "Install app" affordance.
//
// Why this exists at all: browser vendors hide the native PWA install
// prompt behind obscure UI (Chrome's address-bar icon, Safari's Share
// menu) on purpose, so most users never find it. Without a button INSIDE
// the app, the PWA might as well not be installable.
//
// Per-platform behavior:
//   * Android Chrome / Desktop Chrome / Edge → we catch the
//     `beforeinstallprompt` event the browser fires, stash it, and call
//     prompt() when the user taps. This is the "real" install flow.
//   * iOS Safari → no programmatic prompt exists at all. We open a small
//     modal with the 3-step manual instructions (Share → Add to Home).
//   * Already installed (display-mode: standalone) → render nothing.
//   * Anything else (Firefox, in-app webviews, etc.) → render nothing,
//     so we don't show a button that does nothing when tapped.
// ============================================================

// The TS lib types don't include this event yet — declare what we use.
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

type Variant = 'prominent' | 'subtle' | 'banner'

export function InstallButton({
  variant = 'prominent',
  className = '',
}: {
  variant?: Variant
  className?: string
}) {
  const { t } = useLocale()
  const [installEvent, setInstallEvent] =
    useState<BeforeInstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [showIOSModal, setShowIOSModal] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return

    // Already installed? Two ways to detect:
    //   - display-mode standalone (covers Android + desktop Chrome PWAs)
    //   - navigator.standalone (iOS-specific legacy flag)
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS-only flag — typed on a copy of navigator to avoid lib changes.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
    if (standalone) {
      setIsInstalled(true)
      return
    }

    // iOS detection — Apple still ships UA strings with "iPhone"/"iPad",
    // plus iPad-as-Mac heuristic (Safari 13+ on iPad pretends to be Mac
    // but exposes touch support).
    const ua = window.navigator.userAgent
    const ios =
      /iPad|iPhone|iPod/.test(ua) ||
      (ua.includes('Mac') && 'ontouchend' in document)
    setIsIOS(ios)

    const onBeforeInstall = (e: Event) => {
      // Block the browser from showing its own mini-infobar — we want to
      // own when the prompt appears (it's tied to our button tap).
      e.preventDefault()
      setInstallEvent(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setInstallEvent(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  // Hide cases:
  //   - already installed
  //   - non-iOS browser that never fired beforeinstallprompt (Firefox,
  //     in-app webviews) — showing a dead button is worse than nothing.
  if (isInstalled) return null
  if (!isIOS && !installEvent) return null

  const handleClick = async () => {
    if (isIOS) {
      setShowIOSModal(true)
      return
    }
    if (!installEvent) return
    await installEvent.prompt()
    // Wait for the user's choice so we can clear the event (a prompt
    // can only be used once — Chrome rejects re-prompts).
    await installEvent.userChoice.catch(() => undefined)
    setInstallEvent(null)
  }

  const label = variant === 'subtle' ? t('install.button.short') : t('install.button')

  // The 'banner' variant is a full-width strip with a short pitch on
  // the left and the install action on the right. Designed for the
  // top of the dashboard layout — visible on every page until the
  // owner installs the app, then disappears entirely.
  if (variant === 'banner') {
    return (
      <>
        <div
          className={`flex items-center justify-between gap-3 px-4 sm:px-6 py-3 bg-nxtup-line/40 border-b border-nxtup-line ${className}`}
        >
          <p className="text-nxtup-muted text-xs sm:text-sm min-w-0">
            <span className="text-white font-semibold">NXTUP</span>{' '}
            <span className="hidden sm:inline">— {t('install.button.aria')}</span>
            <span className="sm:hidden">en tu pantalla de inicio</span>
          </p>
          <button
            type="button"
            onClick={handleClick}
            aria-label={t('install.button.aria')}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md bg-white text-black text-xs font-bold tracking-tight transition-all active:scale-[0.97] hover:opacity-90 flex-shrink-0"
          >
            <DownloadIcon />
            <span>{t('install.button')}</span>
          </button>
        </div>
        {showIOSModal && (
          <IOSInstructions onClose={() => setShowIOSModal(false)} />
        )}
      </>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label={t('install.button.aria')}
        className={
          variant === 'prominent'
            ? `inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-white text-black text-sm font-bold tracking-tight transition-all active:scale-[0.97] hover:opacity-90 ${className}`
            : `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-nxtup-muted hover:text-white text-sm transition-colors ${className}`
        }
      >
        <DownloadIcon />
        <span>{label}</span>
      </button>

      {showIOSModal && (
        <IOSInstructions onClose={() => setShowIOSModal(false)} />
      )}
    </>
  )
}

// ──────────────────────────────────────────────────────────────
// Modal — iOS-only fallback instructions.
//
// iOS Safari has no JS API for the install prompt, so the best we can
// do is show the user exactly which buttons to tap. The Share icon is
// rendered inline (SF Symbols-style) so they recognize it immediately.
// ──────────────────────────────────────────────────────────────

function IOSInstructions({ onClose }: { onClose: () => void }) {
  const { t } = useLocale()
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="install-ios-title"
      className="fixed inset-0 bg-black/80 flex items-end sm:items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-nxtup-bg border border-nxtup-line rounded-2xl p-6 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <h2
          id="install-ios-title"
          className="text-white text-xl font-black tracking-tight mb-4"
        >
          {t('install.ios.title')}
        </h2>

        {/* Animated walkthrough — cycles through the 3 iOS taps so the
            user knows what each button looks like before hunting for
            them in Safari. */}
        <div className="mb-5">
          <InstallDemo />
        </div>

        <ol className="flex flex-col gap-4 mb-6">
          <Step
            n={1}
            title={t('install.ios.step1')}
            detail={t('install.ios.step1.detail')}
            icon={<ShareIcon />}
          />
          <Step
            n={2}
            title={t('install.ios.step2')}
            detail={t('install.ios.step2.detail')}
            icon={<PlusSquareIcon />}
          />
          <Step
            n={3}
            title={t('install.ios.step3')}
            detail={t('install.ios.step3.detail')}
          />
        </ol>

        <p className="text-nxtup-muted text-xs mb-5">{t('install.ios.outro')}</p>

        <button
          type="button"
          onClick={onClose}
          className="w-full py-3 rounded-lg bg-white text-black font-bold text-sm tracking-tight active:scale-[0.98] transition-transform"
        >
          {t('install.ios.close')}
        </button>
      </div>
    </div>
  )
}

function Step({
  n,
  title,
  detail,
  icon,
}: {
  n: number
  title: string
  detail: string
  icon?: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex-shrink-0 w-7 h-7 rounded-full bg-nxtup-line text-white text-xs font-black flex items-center justify-center tabular-nums">
        {n}
      </span>
      <div className="flex-1">
        <p className="text-white text-sm font-semibold flex items-center gap-2">
          {title}
          {icon}
        </p>
        <p className="text-nxtup-muted text-xs">{detail}</p>
      </div>
    </li>
  )
}

// ──────────────────────────────────────────────────────────────
// Inline icons (kept here so the component is single-file/copy-pastable).
// ──────────────────────────────────────────────────────────────

function DownloadIcon() {
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
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}

// Apple's Share glyph — square with up-arrow coming out the top.
function ShareIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-blue-400"
      aria-hidden="true"
    >
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

// "Add to Home Screen" iOS menu glyph — plus sign in a square.
function PlusSquareIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-nxtup-muted"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}
