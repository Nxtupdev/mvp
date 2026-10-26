'use client'

import {
  CUSTOM_NAME_MAX,
  MAX_LINE_AMOUNT,
  PRICE_STEP,
  needsReview,
  normalizeCustomName,
  roundMoney,
  type TicketItem,
} from '@/lib/ticket-items'

type Service = { id: string; name: string; price: number | null }

/**
 * Selector de "¿Qué le hiciste?" con PRECIO LIBRE (085) — una sola
 * pieza para las tres hojas del barbero (cierre del corte, Mis
 * clientes, pendiente en Mi cuenta).
 *
 * Tocar un servicio agrega su línea con el precio de lista ya puesto
 * (tocar de nuevo la quita); el precio se ajusta con −5/+5 o se
 * teclea. "Otro" agrega una categoría propia con nombre y precio, solo
 * para reportes (no toca los servicios de Configuración). Controlado:
 * el padre guarda `items` y arma el envío con itemsPayload().
 */
export default function TicketItemsPicker({
  services,
  items,
  onChange,
  compact = false,
}: {
  services: Service[]
  items: TicketItem[]
  onChange: (items: TicketItem[]) => void
  compact?: boolean
}) {
  function toggleService(s: Service) {
    const on = items.some(i => i.serviceId === s.id)
    onChange(
      on
        ? items.filter(i => i.serviceId !== s.id)
        : [
            ...items,
            {
              serviceId: s.id,
              name: s.name,
              amount: Number(s.price ?? 0),
              listPrice: s.price == null ? null : Number(s.price),
            },
          ],
    )
  }

  function update(idx: number, patch: Partial<TicketItem>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx))
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {services.map(s => {
          const on = items.some(i => i.serviceId === s.id)
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => toggleService(s)}
              className={`rounded-xl border text-left transition-colors ${
                compact ? 'px-2 py-2.5' : 'px-3 py-3.5'
              } ${on ? 'border-nxtup-active bg-nxtup-active/10' : 'border-nxtup-line hover:border-white'}`}
            >
              <p className={`font-bold ${compact ? 'text-xs' : 'text-sm'} ${on ? 'text-nxtup-active' : 'text-white'}`}>
                {s.name}
              </p>
              <p className={`text-nxtup-muted tabular-nums ${compact ? 'text-xs' : 'text-sm'}`}>
                ${Number(s.price ?? 0)}
              </p>
            </button>
          )
        })}
        <button
          type="button"
          onClick={() =>
            onChange([...items, { serviceId: null, name: '', amount: 0, listPrice: null }])
          }
          className={`rounded-xl border border-dashed border-nxtup-dim text-left hover:border-white transition-colors ${
            compact ? 'px-2 py-2.5' : 'px-3 py-3.5'
          }`}
        >
          <p className={`font-bold text-white ${compact ? 'text-xs' : 'text-sm'}`}>+ Otro</p>
          <p className={`text-nxtup-muted ${compact ? 'text-xs' : 'text-sm'}`}>Tinte, diseño…</p>
        </button>
      </div>

      {items.length > 0 && (
        <ul className="flex flex-col gap-2">
          {items.map((it, idx) => (
            <li
              key={`${it.serviceId ?? 'otro'}-${idx}`}
              className={`flex flex-wrap items-center gap-2 rounded-xl border px-2.5 py-2 ${
                it.amount > 0 && needsReview(it.amount, it.listPrice)
                  ? 'border-nxtup-break/70'
                  : 'border-nxtup-line'
              }`}
            >
              {it.serviceId ? (
                <span className="flex-1 min-w-0 truncate text-white text-sm font-semibold">
                  {it.name}
                </span>
              ) : (
                <>
                  {/* Nombre propio en su fila: a lo ancho de un teléfono no cabe junto al precio. */}
                  <input
                    value={it.name}
                    onChange={e => update(idx, { name: e.target.value })}
                    onBlur={e => update(idx, { name: normalizeCustomName(e.target.value) })}
                    maxLength={CUSTOM_NAME_MAX}
                    placeholder="¿Qué fue? Ej. Tinte de pelo"
                    aria-label="Nombre del servicio"
                    className="basis-full min-w-0 bg-nxtup-line text-white rounded-lg px-2.5 py-2 text-sm border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
                  />
                  <span className="flex-1" aria-hidden />
                </>
              )}
              <button
                type="button"
                onClick={() => update(idx, { amount: Math.max(0, roundMoney(it.amount - PRICE_STEP)) })}
                aria-label={`Bajar $${PRICE_STEP}`}
                className="w-10 h-10 shrink-0 rounded-lg border border-nxtup-line text-white font-black active:scale-95"
              >
                −
              </button>
              <label className="flex items-center shrink-0 rounded-lg bg-nxtup-line border border-nxtup-dim focus-within:border-white px-2 h-10">
                <span className="text-nxtup-muted text-sm">$</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={MAX_LINE_AMOUNT}
                  value={it.amount === 0 ? '' : it.amount}
                  onChange={e => {
                    const n = Number(e.target.value)
                    update(idx, { amount: Number.isFinite(n) && n >= 0 ? n : 0 })
                  }}
                  placeholder="0"
                  aria-label={`Precio de ${it.name || 'el servicio'}`}
                  className="w-14 bg-transparent text-white text-base font-black tabular-nums text-right focus:outline-none placeholder:text-nxtup-dim [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
              </label>
              <button
                type="button"
                onClick={() => update(idx, { amount: roundMoney(it.amount + PRICE_STEP) })}
                aria-label={`Subir $${PRICE_STEP}`}
                className="w-10 h-10 shrink-0 rounded-lg border border-nxtup-line text-white font-black active:scale-95"
              >
                +
              </button>
              <button
                type="button"
                onClick={() => remove(idx)}
                aria-label="Quitar"
                className="shrink-0 text-nxtup-dim hover:text-white text-xl leading-none px-1"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function itemsTotal(items: TicketItem[]): number {
  return roundMoney(items.reduce((s, i) => s + (i.amount || 0), 0))
}

/** Lo que falta para poder guardar, o null si está completo. */
export function itemsProblem(items: TicketItem[]): string | null {
  if (items.length === 0) return 'Elige el servicio'
  if (items.some(i => !i.serviceId && !normalizeCustomName(i.name))) return 'Ponle nombre al "Otro"'
  if (items.some(i => !(i.amount > 0))) return 'Ponle el precio'
  if (items.some(i => i.amount > MAX_LINE_AMOUNT)) return `Máximo $${MAX_LINE_AMOUNT} por servicio`
  return null
}

/**
 * Freno del error de dedo: si algún precio se aleja mucho del de lista
 * (o una categoría propia pasa de $200), pregunta antes de guardar.
 * true = seguir.
 */
export function confirmOutliers(items: TicketItem[]): boolean {
  const odd = items.filter(i => needsReview(i.amount, i.listPrice))
  if (odd.length === 0) return true
  const lines = odd
    .map(i =>
      i.listPrice != null
        ? `$${i.amount} por ${i.name} (el precio normal es $${i.listPrice})`
        : `$${i.amount} por ${normalizeCustomName(i.name) || 'Otro'}`,
    )
    .join('\n')
  return window.confirm(`Revisa el precio:\n${lines}\n\n¿Está bien?`)
}

/** Cuerpo `items` de la API: servicio por id (el server pone el nombre) o nombre propio. */
export function itemsPayload(items: TicketItem[]) {
  return items.map(i =>
    i.serviceId
      ? { service_id: i.serviceId, amount: roundMoney(i.amount) }
      : { name: normalizeCustomName(i.name), amount: roundMoney(i.amount) },
  )
}
