/**
 * Líneas de ticket con PRECIO LIBRE (085). Puro: lo usan la hoja del
 * barbero, la API y Cuentas del dueño, así las reglas son una sola.
 *
 * El barbero parte del precio de lista del servicio y lo ajusta (±5 o
 * tecleado) — una rayita, una gelatina, un tinte mueven el precio. O
 * agrega una categoría propia ("Otro") que solo existe para reportes.
 */

/** Paso de los botones − / + en la hoja. */
export const PRICE_STEP = 5

/** Tope duro por línea: un monto mayor es un error de dedo, no un corte. */
export const MAX_LINE_AMOUNT = 500

/** Sin precio de lista (categoría propia), arriba de esto se pregunta. */
const CUSTOM_REVIEW_OVER = 200

/** Largo máximo del nombre de una categoría propia. */
export const CUSTOM_NAME_MAX = 40

export type TicketItem = {
  /** null = categoría propia del barbero ("Otro"). */
  serviceId: string | null
  name: string
  amount: number
  /** Precio de lista del servicio; null en categorías propias. */
  listPrice: number | null
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * ¿Monto sospechoso? Más del doble o menos de la mitad del precio de
 * lista (650 en vez de 65 → sí). Sin lista, solo arriba de $200. La
 * hoja del barbero pregunta antes de guardar; Cuentas lo marca
 * "revisar" para que el dueño llame a confirmar.
 */
export function needsReview(amount: number, listPrice: number | null): boolean {
  if (listPrice != null && listPrice > 0) {
    return amount > listPrice * 2 || amount < listPrice / 2
  }
  return amount > CUSTOM_REVIEW_OVER
}

/** "  tinte   de pelo " → "Tinte de pelo": que el reporte no parta categorías por mayúsculas o espacios. */
export function normalizeCustomName(raw: string): string {
  const s = raw.replace(/\s+/g, ' ').trim().slice(0, CUSTOM_NAME_MAX)
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

/** Monto válido para guardar: número > 0 y ≤ tope, redondeado a centavos. null = inválido. */
export function parseAmount(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n) || n <= 0 || n > MAX_LINE_AMOUNT) return null
  return roundMoney(n)
}
