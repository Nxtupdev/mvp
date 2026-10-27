'use client'

import { useEffect, useState } from 'react'
import { Play, X } from 'lucide-react'

export type Tutorial = {
  file: string
  title: string
  desc: string
  /** "1:05" — se muestra en la fila. */
  duration: string
}

/**
 * Lista de video-tutoriales: una fila por video (nombre, descripción,
 * duración y "Ver"). El video se abre encima a pantalla completa, así
 * la página no carga ni muestra 5+ reproductores verticales que obligaban
 * a hacer scroll (pedido de Francisco, 26-oct). Solo se baja el video
 * que se abre.
 */
export default function TutorialList({
  tutorials,
  watchLabel,
  closeLabel,
}: {
  tutorials: Tutorial[]
  watchLabel: string
  closeLabel: string
}) {
  const [open, setOpen] = useState<Tutorial | null>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <ul className="flex flex-col divide-y divide-nxtup-line border border-nxtup-line rounded-2xl overflow-hidden">
        {tutorials.map(v => (
          <li key={v.file}>
            <button
              type="button"
              onClick={() => setOpen(v)}
              className="w-full flex items-center gap-4 px-4 py-3.5 text-left hover:bg-white/[0.03] transition-colors"
            >
              <span
                className="shrink-0 grid place-items-center w-11 h-11 rounded-full bg-nxtup-active/15 text-nxtup-active"
                aria-hidden
              >
                <Play size={18} fill="currentColor" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-white font-semibold text-sm">{v.title}</span>
                <span className="block text-nxtup-dim text-xs mt-0.5">{v.desc}</span>
              </span>
              <span className="shrink-0 flex flex-col items-end gap-1">
                <span className="rounded-full border border-nxtup-active/50 text-nxtup-active text-xs font-bold px-3 py-1">
                  {watchLabel}
                </span>
                <span className="text-nxtup-dim text-[11px] tabular-nums">{v.duration}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={open.title}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex flex-col items-center justify-center p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="w-full max-w-sm flex items-center justify-between gap-3 mb-3"
            onClick={e => e.stopPropagation()}
          >
            <p className="text-white font-semibold text-sm truncate">{open.title}</p>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label={closeLabel}
              className="shrink-0 grid place-items-center w-10 h-10 rounded-full bg-white/10 text-white hover:bg-white/20"
            >
              <X size={20} />
            </button>
          </div>
          <video
            key={open.file}
            controls
            autoPlay
            playsInline
            onClick={e => e.stopPropagation()}
            className="w-auto max-w-full max-h-[80dvh] aspect-[9/16] rounded-xl bg-black"
            src={`/tutoriales/${open.file}`}
          />
        </div>
      )}
    </>
  )
}
