'use client'

import { useEffect, useState } from 'react'

// ============================================================
// InstallDemo — animated visual aid for the iOS install flow.
//
// Apple doesn't allow programmatic install on iOS, so the best we
// can do is teach the 3-tap dance: Share → Add to Home Screen → Add.
// Words alone don't cut it — most owners have never noticed where
// "Add to Home Screen" lives in the share sheet. This widget cycles
// through stylised mockups of the exact buttons they'll be looking
// for, with a pulsing "tap here" indicator on the right one.
//
// All SVG/CSS — no GIFs, no recordings, no external assets. Scales
// crisply at any size and stays under 10KB shipped.
// ============================================================

const FRAME_MS = 2400
const FRAME_COUNT = 3

export default function InstallDemo() {
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setFrame(f => (f + 1) % FRAME_COUNT)
    }, FRAME_MS)
    return () => clearInterval(id)
  }, [])

  return (
    <div
      // Aspect ratio chosen to roughly match an iPhone screen excerpt.
      // bg-zinc-900 reads as "phone background" without competing with
      // the modal's own bg.
      className="relative w-full aspect-[4/3] bg-zinc-900 rounded-xl overflow-hidden border border-nxtup-line"
      aria-hidden="true"
    >
      <Frame visible={frame === 0}>
        <SafariBarMock />
      </Frame>
      <Frame visible={frame === 1}>
        <ShareSheetMock />
      </Frame>
      <Frame visible={frame === 2}>
        <HomeScreenMock />
      </Frame>

      {/* Tiny step indicator dots at the bottom so users feel the loop
          progressing rather than being confused by content changes. */}
      <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1.5">
        {Array.from({ length: FRAME_COUNT }).map((_, i) => (
          <span
            key={i}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === frame ? 'w-4 bg-white' : 'w-1 bg-white/30'
            }`}
          />
        ))}
      </div>
    </div>
  )
}

// Crossfade wrapper — fades opacity instead of swapping nodes so the
// transitions feel smooth instead of jarring.
function Frame({
  visible,
  children,
}: {
  visible: boolean
  children: React.ReactNode
}) {
  return (
    <div
      className={`absolute inset-0 flex items-center justify-center transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      {children}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Frame 1 — Safari bottom toolbar with Share icon highlighted.
//
// We render a wide bar at the bottom of the frame (where Safari's
// bottom bar actually sits on iPhone) and put a pulsing ring on the
// Share button so the eye is drawn to it.
// ──────────────────────────────────────────────────────────────

function SafariBarMock() {
  return (
    <div className="w-full h-full relative flex flex-col">
      {/* Fake page content above the bar */}
      <div className="flex-1 flex items-center justify-center">
        <div className="text-white/30 text-[10px] uppercase tracking-[0.3em] font-bold">
          getnxtup.com
        </div>
      </div>

      {/* Safari-style toolbar */}
      <div className="bg-zinc-800 border-t border-zinc-700 px-4 py-3 flex items-center justify-around">
        <ToolbarIcon><BackArrow /></ToolbarIcon>
        <ToolbarIcon><ForwardArrow /></ToolbarIcon>
        <div className="relative">
          {/* Pulsing tap target — this is the icon the user needs to tap. */}
          <span className="absolute inset-0 -m-1 rounded-full bg-blue-500/30 animate-ping" />
          <span className="absolute inset-0 -m-0.5 rounded-full ring-2 ring-blue-400" />
          <ToolbarIcon highlight><AppleShareIcon /></ToolbarIcon>
        </div>
        <ToolbarIcon><BookIcon /></ToolbarIcon>
        <ToolbarIcon><TabsIcon /></ToolbarIcon>
      </div>

      {/* Caption */}
      <p className="absolute top-2 left-0 right-0 text-center text-white/70 text-[11px] font-semibold">
        1. Tocá <span className="text-blue-300">Compartir</span>
      </p>
    </div>
  )
}

function ToolbarIcon({
  children,
  highlight,
}: {
  children: React.ReactNode
  highlight?: boolean
}) {
  return (
    <div
      className={`p-1 ${highlight ? 'text-blue-400' : 'text-white/70'}`}
    >
      {children}
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Frame 2 — Share sheet with "Add to Home Screen" highlighted.
//
// The share sheet has dozens of rows — most users have never even
// scrolled to the bottom. We mock the relevant rows and put the
// pulsing indicator on the one they need.
// ──────────────────────────────────────────────────────────────

function ShareSheetMock() {
  return (
    <div className="w-full h-full relative px-2 pt-5 pb-7">
      <div className="bg-zinc-800 rounded-t-2xl h-full w-full overflow-hidden border border-zinc-700">
        {/* Sheet handle */}
        <div className="flex justify-center pt-1.5 pb-2">
          <span className="w-8 h-1 rounded-full bg-zinc-600" />
        </div>

        {/* App row at top — generic dots, hint of "lots of options here" */}
        <div className="flex items-center gap-3 px-4 pb-3 border-b border-zinc-700">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="w-7 h-7 rounded-lg bg-zinc-700" />
          ))}
        </div>

        {/* Action rows — the middle one is what we want them to tap */}
        <SheetRow icon={<CopyGlyph />} label="Copiar" />
        <SheetRow icon={<PlusSquareGlyph />} label="Añadir a inicio" highlight />
        <SheetRow icon={<BookmarkGlyph />} label="Añadir a Favoritos" />
      </div>

      <p className="absolute top-1 left-0 right-0 text-center text-white/70 text-[11px] font-semibold">
        2. Elegí <span className="text-blue-300">Añadir a inicio</span>
      </p>
    </div>
  )
}

function SheetRow({
  icon,
  label,
  highlight,
}: {
  icon: React.ReactNode
  label: string
  highlight?: boolean
}) {
  return (
    <div className="relative">
      {highlight && (
        // Animated tap ring that pulses to draw attention. Tailwind's
        // animate-ping is exactly the right effect here.
        <>
          <span className="absolute inset-x-2 inset-y-0.5 rounded-md bg-blue-500/15 animate-pulse" />
          <span className="absolute inset-x-2 inset-y-0.5 rounded-md ring-1 ring-blue-400/60" />
        </>
      )}
      <div className="relative flex items-center justify-between px-4 py-2.5 border-b border-zinc-700/50">
        <span className={highlight ? 'text-white text-xs font-semibold' : 'text-white/80 text-xs'}>
          {label}
        </span>
        <span className={highlight ? 'text-blue-300' : 'text-white/50'}>{icon}</span>
      </div>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Frame 3 — Home screen with the new NXTUP icon settling in.
//
// Closes the loop visually: "after the two taps, this is what you
// get." The icon scales in from nothing so the eye registers it as
// the destination of the flow.
// ──────────────────────────────────────────────────────────────

function HomeScreenMock() {
  return (
    <div className="w-full h-full relative p-4">
      <div className="grid grid-cols-4 gap-3">
        {/* Existing app icons — abstract placeholders */}
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className="aspect-square rounded-lg bg-zinc-700"
            style={{ opacity: 0.4 }}
          />
        ))}
        {/* The freshly installed NXTUP icon — scales in with a bounce */}
        <div className="relative flex flex-col items-center animate-pop">
          <div className="aspect-square w-full rounded-lg bg-white text-black flex items-center justify-center text-[10px] font-black tracking-tight">
            NXT
          </div>
          <span className="text-white text-[8px] mt-1 font-medium">NXTUP</span>
        </div>
      </div>

      <p className="absolute bottom-7 left-0 right-0 text-center text-white text-[11px] font-semibold">
        3. Listo — <span className="text-emerald-300">NXTUP en tu pantalla</span>
      </p>

      {/* Local keyframes — kept inline so the component remains
          drop-in and doesn't depend on a global CSS edit. */}
      <style>{`
        @keyframes pop {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        .animate-pop > div { animation: pop 0.6s ease-out both; }
      `}</style>
    </div>
  )
}

// ──────────────────────────────────────────────────────────────
// Icon glyphs — simplified takes on the iOS originals so users
// recognise the shapes when they appear in their own Safari.
// ──────────────────────────────────────────────────────────────

const ICON = 'currentColor'

function AppleShareIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" y1="2" x2="12" y2="15" />
    </svg>
  )
}

function BackArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}

function ForwardArrow() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  )
}

function BookIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function TabsIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <rect x="7" y="7" width="14" height="14" rx="2" />
    </svg>
  )
}

function CopyGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function PlusSquareGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="12" y1="8" x2="12" y2="16" />
      <line x1="8" y1="12" x2="16" y2="12" />
    </svg>
  )
}

function BookmarkGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ICON} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
    </svg>
  )
}
