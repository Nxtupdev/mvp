'use client'

/**
 * AppointmentScreen — pregunta "¿Tienes cita con un barbero?" (066).
 *
 * Va DESPUÉS de la identidad (nuevo/recurrente) y ANTES del checkin.
 * [No, vengo sin cita] = botón grande primero (el 90% del tráfico) →
 * checkin normal. [Sí] despliega el grid de barberos (con sus fotos)
 * y tocar uno dispara el checkin con la cita amarrada a él.
 *
 * Incluye TODOS los barberos del shop (hasta offline — la cita puede
 * ser con uno que aún no llega; su tarjeta de confirmación le espera).
 */

import { useState } from 'react'
import { Avatar } from '@/components/avatars'
import { useLocale } from '@/lib/i18n'

export type KioskBarber = {
  id: string
  name: string
  avatar: string | null
}

export function AppointmentScreen({
  barbers,
  onSubmit,
  onBack,
  submitting,
  serverError,
  currentStep,
  totalSteps,
}: {
  barbers: KioskBarber[]
  /** null = sin cita (walk-in normal); id = cita con ese barbero. */
  onSubmit: (appointmentBarberId: string | null) => void
  onBack: () => void
  submitting: boolean
  serverError: string | null
  currentStep: number
  totalSteps: number
}) {
  const { t } = useLocale()
  const [choosing, setChoosing] = useState(false)

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 sm:px-12">
      <div className="w-full max-w-2xl">
        <p className="text-zinc-500 mb-2 text-xs uppercase tracking-[0.25em]">
          {t('kiosk.step', { n: currentStep, total: totalSteps })}
        </p>
        <h1
          className="bg-gradient-to-br from-zinc-50 to-salvia/80 bg-clip-text font-display text-4xl tracking-tight text-transparent sm:text-6xl"
          style={{ letterSpacing: '-0.03em' }}
        >
          {choosing ? t('kiosk.appt.pick') : t('kiosk.appt.title')}
        </h1>

        {!choosing ? (
          <div className="mt-10 flex flex-col gap-4">
            <button
              type="button"
              disabled={submitting}
              onClick={() => onSubmit(null)}
              className="flex h-20 items-center justify-center rounded-2xl bg-salvia text-lg font-bold text-zinc-950 transition-all active:scale-[0.98] disabled:opacity-50 sm:h-24 sm:text-xl"
            >
              {submitting ? '…' : t('kiosk.appt.no')}
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setChoosing(true)}
              className="flex h-20 items-center justify-center rounded-2xl bg-white/[0.03] text-lg font-semibold text-white ring-1 ring-white/[0.07] transition-all hover:bg-white/[0.06] hover:ring-white/[0.14] active:scale-[0.98] disabled:opacity-50 sm:h-24 sm:text-xl"
            >
              📅 {t('kiosk.appt.yes')}
            </button>
          </div>
        ) : (
          <>
            {/* Scroll PROPIO del grid: el kiosko es viewport fijo con
                overflow-hidden — con shops de muchos barberos (Fade
                Factory tiene 13) el grid se desbordaba y se cortaba sin
                forma de llegar a los de abajo. max-h + overflow-y-auto
                lo hace scrolleable con el dedo dentro de su área. */}
            <div className="mt-8 grid max-h-[52vh] grid-cols-3 gap-3 overflow-y-auto overscroll-contain pr-1 sm:grid-cols-4">
              {barbers.map(b => (
                <button
                  key={b.id}
                  type="button"
                  disabled={submitting}
                  onClick={() => onSubmit(b.id)}
                  className="flex flex-col items-center gap-2 rounded-2xl bg-white/[0.03] px-3 py-4 ring-1 ring-white/[0.07] transition-all hover:bg-white/[0.06] hover:ring-salvia/40 active:scale-[0.98] disabled:opacity-50"
                >
                  <Avatar avatar={b.avatar} name={b.name} size={56} />
                  <span className="max-w-full truncate text-sm font-semibold text-white sm:text-base">
                    {b.name}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => setChoosing(false)}
              className="mt-6 text-sm text-zinc-500 underline underline-offset-4 hover:text-zinc-300"
            >
              {t('kiosk.back')}
            </button>
          </>
        )}

        {serverError && (
          <p className="text-nxtup-busy mt-4 text-sm">{serverError}</p>
        )}

        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          className="mt-8 text-sm text-zinc-600 hover:text-zinc-400"
        >
          ← {t('kiosk.back')}
        </button>
      </div>
    </div>
  )
}
