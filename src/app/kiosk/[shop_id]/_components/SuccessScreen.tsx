'use client'

/**
 * SuccessScreen — Pantalla final del kiosk check-in flow.
 *
 * Dos modos visuales según si el sistema asignó un barbero al momento:
 *
 *   ───────────────────────────────────────────────────────────────
 *   1. ASIGNADO (assignedBarber !== null)
 *   ───────────────────────────────────────────────────────────────
 *   ┌─────────────────────────────┬─────────────────┐
 *   │  ✓                          │  EN COLA        │
 *   │                             │  ──────         │
 *   │  ¡Bienvenido, Juan!         │  #1 Juan  ← Tú  │
 *   │                             │  #2 Pedro       │
 *   │   Ve con Carlos             │  #3 Luis        │
 *   │   Te está esperando ahora   │                 │
 *   │                             │                 │
 *   │   [    Listo    ]           │                 │
 *   └─────────────────────────────┴─────────────────┘
 *
 *   ───────────────────────────────────────────────────────────────
 *   2. EN ESPERA (assignedBarber === null)
 *   ───────────────────────────────────────────────────────────────
 *   ┌─────────────────────────────┬─────────────────┐
 *   │  ✓                          │  EN COLA        │
 *   │                             │  ──────         │
 *   │  ¡Bienvenido, Juan!         │  #1 Carlos      │
 *   │   ┌──────┐ ┌──────┐         │  #2 Pedro       │
 *   │   │  #3  │ │ 6-10 │         │  #3 Juan  ← Tú  │
 *   │   └──────┘ └──────┘         │  #4 Luis        │
 *   │   Relájate, te llamamos...  │                 │
 *   │   [    Listo    ]           │                 │
 *   └─────────────────────────────┴─────────────────┘
 *
 * Responsive:
 *   - Tablet landscape (lg+, ≥1024px): dos columnas lado a lado.
 *   - Tablet portrait / mobile: stacked — main arriba, lista abajo.
 *
 * Auto-reset: 30s después de montar, llamamos onDone() para limpiar
 * el state y volver al splash. Crítico para modo kiosk — los clientes
 * a veces se van sin tocar el botón, y el siguiente no debe ver el
 * nombre del anterior.
 *
 * Choreography (framer-motion):
 *   t=0.0  checkmark dibuja (su propia secuencia ~1.4s)
 *   t=0.8  bienvenida fade up
 *   t=1.0  callout barbero / stat cards stagger in
 *   t=1.4  texto / botón aparecen
 *   t=1.0  columna de cola fade in (paralelo al stagger principal)
 *
 * Reduced motion: colapsa a fades simples.
 */

import { motion, useReducedMotion, type Variants } from 'framer-motion'
import { useEffect } from 'react'

import { useLocale } from '@/lib/i18n'
import { QueueStatBlock } from './QueueStatBlock'
import { SuccessCheckmark } from './SuccessCheckmark'

const AUTO_RESET_MS = 30_000

// ────────────────────────────────────────────────────────────────────
// Types

type QueueEntry = {
  id: string
  name: string
  status: 'waiting' | 'called'
  position: number
}

type SuccessScreenProps = {
  /** Display name — typically firstName. */
  name: string
  /** True if the lookup found this phone in `clients` already. */
  isReturning: boolean
  /** Customer's position in the waiting queue (1-based). */
  queuePosition: number
  /** Estimated wait window in minutes. */
  etaMinutes: { min: number; max: number }
  /** Barbero al que se le asignó el cliente AL MOMENTO del check-in.
   *  null si no había barbero libre y el cliente quedó esperando. */
  assignedBarber: { id: string; name: string } | null
  /** Lista de clientes actualmente en cola (waiting + called) en el
   *  orden en que serán llamados. Incluye al cliente recién registrado. */
  queueList: QueueEntry[]
  /** ID del entry del cliente actual — usado para resaltarlo en la lista. */
  myEntryId: string | null
  /** Called when the user hits "Listo" OR after AUTO_RESET_MS. El
   *  padre debe resetear el state y volver al splash. */
  onDone: () => void
}

// ────────────────────────────────────────────────────────────────────
// Animation variants

const containerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      delayChildren: 0.8, // espera a que el checkmark se asiente
      staggerChildren: 0.15,
    },
  },
}

const itemVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
}

const asideVariants: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.6, delay: 1.0, ease: [0.16, 1, 0.3, 1] },
  },
}

const reducedContainerVariants: Variants = {
  initial: {},
  animate: { transition: { delayChildren: 0.3, staggerChildren: 0.05 } },
}

const reducedItemVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2 } },
}

const reducedAsideVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, delay: 0.3 } },
}

// ────────────────────────────────────────────────────────────────────
// Helpers

function interpolate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ''))
}

// ────────────────────────────────────────────────────────────────────
// Component

export function SuccessScreen({
  name,
  isReturning,
  queuePosition,
  etaMinutes,
  assignedBarber,
  queueList,
  myEntryId,
  onDone,
}: SuccessScreenProps) {
  const { t } = useLocale()
  const shouldReduceMotion = useReducedMotion()

  // Auto-reset timer — crítico para privacidad / hand-off al siguiente
  // cliente en modo kiosk. Cleared on unmount o manual Done para no
  // disparar un reset stale contra la siguiente pantalla.
  useEffect(() => {
    const id = window.setTimeout(onDone, AUTO_RESET_MS)
    return () => window.clearTimeout(id)
  }, [onDone])

  const welcomeTemplate = isReturning
    ? t('kiosk.success.welcomeBack')
    : t('kiosk.success.welcome')
  const welcomeText = interpolate(welcomeTemplate, { name })

  const containerV = shouldReduceMotion ? reducedContainerVariants : containerVariants
  const itemV = shouldReduceMotion ? reducedItemVariants : itemVariants
  const asideV = shouldReduceMotion ? reducedAsideVariants : asideVariants

  // Render ETA como "6-10" o solo "6" si min === max.
  const etaValue =
    etaMinutes.min === etaMinutes.max
      ? String(etaMinutes.min)
      : `${etaMinutes.min}-${etaMinutes.max}`

  const showQueueAside = queueList.length > 0

  return (
    <div className="flex flex-1 flex-col lg:flex-row gap-6 lg:gap-10 px-6 py-12 sm:px-12">
      {/* Main column — checkmark, welcome, primary CTA, button */}
      <div className="flex flex-1 flex-col items-center justify-center gap-8 sm:gap-10">
        {/* Checkmark animates on its own (self-contained) */}
        <SuccessCheckmark size={96} />

        {/* Stagger container — todo debajo del checkmark */}
        <motion.div
          initial="initial"
          animate="animate"
          variants={containerV}
          className="flex w-full max-w-2xl flex-col items-center gap-8 sm:gap-10"
        >
          {/* Bienvenida personalizada */}
          <motion.h1
            variants={itemV}
            className="
              bg-gradient-to-br from-zinc-50 to-emerald-400/80
              bg-clip-text text-center text-4xl font-light
              tracking-tight text-transparent
              sm:text-6xl
            "
            style={{ letterSpacing: '-0.03em' }}
          >
            {welcomeText}
          </motion.h1>

          {/* CTA principal: "Ve con X" si fue asignado, position+ETA si espera */}
          {assignedBarber ? (
            <motion.div
              variants={itemV}
              className="flex w-full flex-col items-center gap-3 text-center"
            >
              <div
                className="
                  rounded-3xl border border-emerald-400/30
                  bg-emerald-400/10 px-8 py-8 sm:px-12 sm:py-10
                  shadow-[0_0_60px_rgba(52,211,153,0.20)]
                "
              >
                <p
                  className="
                    text-3xl font-medium text-emerald-300
                    sm:text-5xl
                  "
                  style={{ letterSpacing: '-0.02em' }}
                >
                  {interpolate(t('kiosk.success.goWith'), {
                    name: assignedBarber.name,
                  })}
                </p>
                <p className="mt-2 text-sm text-emerald-200/70 sm:text-base">
                  {t('kiosk.success.goWithSub')}
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              variants={itemV}
              className="grid w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6"
            >
              <QueueStatBlock
                label={t('kiosk.success.position')}
                value={`#${queuePosition}`}
                tone="primary"
              />
              <QueueStatBlock
                label={t('kiosk.success.eta')}
                value={etaValue}
                unit={t('kiosk.success.min')}
              />
            </motion.div>
          )}

          {/* Texto tranquilizador — solo cuando está en espera. Cuando
              fue asignado, el "Te está esperando ahora" ya cumple esa
              función. */}
          {!assignedBarber && (
            <motion.p
              variants={itemV}
              className="
                max-w-md text-center text-base text-zinc-400
                sm:text-lg
              "
            >
              {t('kiosk.success.relax')}
            </motion.p>
          )}

          {/* Botón Listo */}
          <motion.button
            variants={itemV}
            type="button"
            onClick={onDone}
            whileTap={shouldReduceMotion ? undefined : { scale: 0.98 }}
            className="
              mt-2 flex h-16 w-full max-w-md items-center justify-center
              overflow-hidden rounded-2xl text-lg font-medium text-zinc-950
              bg-emerald-400 shadow-[0_0_40px_rgba(52,211,153,0.35)]
              transition-all duration-300
              hover:bg-emerald-300
              focus-visible:outline-none focus-visible:ring-2
              focus-visible:ring-emerald-400 focus-visible:ring-offset-2
              focus-visible:ring-offset-[#0A0A0B]
            "
          >
            {t('kiosk.success.done')}
          </motion.button>
        </motion.div>
      </div>

      {/* Columna lateral: lista de clientes en cola. Solo se renderiza
          si hay al menos un entry (defensivo — siempre debería incluir
          al cliente recién registrado, pero no asumimos). */}
      {showQueueAside && (
        <motion.aside
          initial="initial"
          animate="animate"
          variants={asideV}
          className="
            w-full lg:w-80 lg:flex-shrink-0
            flex flex-col
          "
          aria-label={t('kiosk.success.inQueueHeader')}
        >
          <div
            className="
              flex flex-col gap-3
              rounded-3xl border border-zinc-800/80 bg-zinc-950/50
              p-5 sm:p-6
              backdrop-blur-sm
              max-h-[60vh] lg:max-h-[70vh] overflow-y-auto
            "
          >
            <header className="flex items-baseline justify-between">
              <h2
                className="
                  text-[10px] font-bold uppercase tracking-[0.3em]
                  text-zinc-500
                "
              >
                {t('kiosk.success.inQueueHeader')}
              </h2>
              <span className="text-xs text-zinc-600 tabular-nums">
                {queueList.length}
              </span>
            </header>

            <ul className="flex flex-col gap-1">
              {queueList.map(entry => {
                const isMe = entry.id === myEntryId
                const isCalled = entry.status === 'called'
                return (
                  <li
                    key={entry.id}
                    className={`
                      flex items-center gap-3 rounded-xl px-3 py-2.5
                      transition-colors
                      ${
                        isMe
                          ? 'bg-emerald-400/15 border border-emerald-400/40'
                          : 'border border-transparent hover:bg-zinc-900/50'
                      }
                    `}
                  >
                    <span
                      className={`
                        text-base font-black tabular-nums w-8 text-center
                        ${isMe ? 'text-emerald-300' : 'text-zinc-500'}
                      `}
                    >
                      #{entry.position}
                    </span>
                    <span
                      className={`
                        flex-1 truncate text-base font-medium
                        ${isMe ? 'text-emerald-100' : 'text-zinc-200'}
                      `}
                    >
                      {entry.name}
                    </span>
                    {isMe && (
                      <span
                        className="
                          rounded-md bg-emerald-400/25 px-2 py-0.5
                          text-[10px] font-bold uppercase tracking-wider
                          text-emerald-200
                        "
                      >
                        {t('kiosk.success.you')}
                      </span>
                    )}
                    {!isMe && isCalled && (
                      <span
                        className="
                          rounded-md bg-amber-400/15 px-2 py-0.5
                          text-[10px] font-bold uppercase tracking-wider
                          text-amber-300
                        "
                      >
                        {t('kiosk.success.statusCalled')}
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </motion.aside>
      )}
    </div>
  )
}
