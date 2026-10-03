'use client'

import { useMemo, useSyncExternalStore } from 'react'

/**
 * Lecturas del navegador y del reloj SIN setState dentro de efectos.
 *
 * La regla react-hooks/set-state-in-effect prohíbe el patrón
 * `useEffect(() => setX(window.algo), [])`, y react-hooks/purity
 * prohíbe `Date.now()` en render. `useSyncExternalStore` resuelve
 * los dos: el servidor recibe un valor fijo (sin desajuste de
 * hidratación) y el cliente lee el valor real en el primer render.
 */

const noopSubscribe = () => () => {}

/**
 * Un valor que solo existe en el navegador (origin, soporte de una
 * API, modo standalone). `getter` debe ser determinista entre dos
 * llamadas seguidas. En el servidor devuelve `serverValue`.
 */
export function useClientValue<T>(getter: () => T, serverValue: T): T {
  return useSyncExternalStore(noopSubscribe, getter, () => serverValue)
}

export function useOrigin(): string {
  return useClientValue(() => window.location.origin, '')
}

const subscribeResize = (onChange: () => void) => {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}
const readViewportWidth = () => window.innerWidth
const serverWidth = () => null

/** Ancho del viewport en px, actualizado al redimensionar. `null` en el servidor. */
export function useViewportWidth(): number | null {
  return useSyncExternalStore(subscribeResize, readViewportWidth, serverWidth)
}

// ── Reloj compartido ──────────────────────────────────────────
// Un ticker por intervalo, compartido entre todos los componentes que
// lo piden. El snapshot es un número estable hasta el siguiente tick,
// que es lo que useSyncExternalStore exige.
// Toda la mutación vive fuera del hook (react-hooks/immutability): el
// hook solo recibe dos funciones estables por intervalo.
type Ticker = {
  value: number
  listeners: Set<() => void>
  timer: ReturnType<typeof setInterval> | null
  subscribe: (onChange: () => void) => () => void
  read: () => number
}
const tickers = new Map<number, Ticker>()

function ticker(intervalMs: number): Ticker {
  const existing = tickers.get(intervalMs)
  if (existing) return existing
  const t: Ticker = {
    value: 0,
    listeners: new Set(),
    timer: null,
    subscribe(onChange) {
      t.listeners.add(onChange)
      if (!t.timer) {
        t.timer = setInterval(() => {
          t.value = Date.now()
          t.listeners.forEach(fn => fn())
        }, intervalMs)
      }
      return () => {
        t.listeners.delete(onChange)
        if (t.listeners.size === 0 && t.timer) {
          clearInterval(t.timer)
          t.timer = null
        }
      }
    },
    read() {
      if (t.value === 0) t.value = Date.now()
      return t.value
    },
  }
  tickers.set(intervalMs, t)
  return t
}

const serverNull = () => null

/**
 * Milisegundos actuales, refrescados cada `intervalMs`. `null` en el
 * servidor. Deriva fechas con `new Date(now)`, que sí es puro.
 */
export function useNow(intervalMs: number): number | null {
  const t = ticker(intervalMs)
  return useSyncExternalStore(t.subscribe, t.read, serverNull)
}

/** Igual que useNow pero como Date (memoizada por tick). */
export function useNowDate(intervalMs: number): Date | null {
  const now = useNow(intervalMs)
  return useMemo(() => (now == null ? null : new Date(now)), [now])
}
