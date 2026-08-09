'use client'

// Editor de horario semanal — portado del producto de citas de Mamacita
// (WeeklyScheduleEditor) y adaptado a la piel de NXTUP: sin shadcn,
// checkbox nativo + <input type="time">, labels vía i18n.
// Una fila por día: [✓ Día] [abre] – [cierra] | "Cerrado".

import { useLocale } from '@/lib/i18n'
import {
  DAY_KEYS,
  type DaySchedule,
  type WeekSchedule,
} from '@/lib/business-hours'

export default function WeeklyScheduleEditor({
  value,
  onChange,
  disabled,
}: {
  value: WeekSchedule
  onChange: (v: WeekSchedule) => void
  disabled?: boolean
}) {
  const { t } = useLocale()

  const set = (key: string, patch: Partial<DaySchedule>) =>
    onChange({
      ...value,
      [key]: { ...value[key as keyof WeekSchedule], ...patch },
    })

  return (
    <div className="flex flex-col gap-2">
      {DAY_KEYS.map(key => {
        const day = value[key]
        const invalid = day.enabled && day.start >= day.end
        return (
          <div key={key} className="flex items-center gap-3">
            <label className="flex w-28 flex-shrink-0 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={day.enabled}
                disabled={disabled}
                onChange={e => set(key, { enabled: e.target.checked })}
                className="h-4 w-4 accent-salvia"
              />
              <span className="text-sm text-white">{t(`day.${key}`)}</span>
            </label>
            {day.enabled ? (
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="time"
                  value={day.start}
                  disabled={disabled}
                  onChange={e => set(key, { start: e.target.value })}
                  className="rounded-lg border border-nxtup-dim bg-nxtup-line px-2 py-1.5 text-sm text-white tabular-nums focus:border-white focus:outline-none"
                />
                <span className="text-nxtup-muted text-sm">–</span>
                <input
                  type="time"
                  value={day.end}
                  disabled={disabled}
                  onChange={e => set(key, { end: e.target.value })}
                  className="rounded-lg border border-nxtup-dim bg-nxtup-line px-2 py-1.5 text-sm text-white tabular-nums focus:border-white focus:outline-none"
                />
                {invalid && (
                  <span className="text-nxtup-busy text-xs">
                    {t('settings.hours.invalidRange')}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-nxtup-dim flex-1 text-sm">
                {t('settings.hours.closedDay')}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
