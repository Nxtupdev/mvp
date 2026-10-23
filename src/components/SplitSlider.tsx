'use client'

/**
 * Deslizador de reparto Barbero ⟷ Barbería (082). UN solo control:
 * ambos porcentajes cambian en vivo y suman 100 por construcción —
 * jamás un campo numérico (el "7"/"700" de dedo queda imposible).
 * Pasos de 5 (los tratos reales son 60/40, 70/30...).
 *
 * `value` = porcentaje del BARBERO.
 */
export default function SplitSlider({
  value,
  onChange,
  disabled = false,
  barberLabel = 'Barbero',
  shopLabel = 'Barbería',
}: {
  value: number
  onChange: (next: number) => void
  disabled?: boolean
  barberLabel?: string
  shopLabel?: string
}) {
  const pct = Math.min(100, Math.max(0, Math.round(value / 5) * 5))
  return (
    <div className={disabled ? 'opacity-50' : ''}>
      <div className="flex items-end justify-between mb-2">
        <div>
          <p className="text-nxtup-muted text-[10px] uppercase tracking-widest font-bold">
            {barberLabel}
          </p>
          <p className="text-2xl font-black tabular-nums text-nxtup-active">{pct}%</p>
        </div>
        <div className="text-right">
          <p className="text-nxtup-muted text-[10px] uppercase tracking-widest font-bold">
            {shopLabel}
          </p>
          <p className="text-2xl font-black tabular-nums">{100 - pct}%</p>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={pct}
        disabled={disabled}
        onChange={e => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none cursor-pointer accent-[#34D399] bg-nxtup-line"
        aria-label={`${barberLabel} ${pct}% · ${shopLabel} ${100 - pct}%`}
      />
    </div>
  )
}
