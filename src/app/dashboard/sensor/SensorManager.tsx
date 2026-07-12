'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

// POC — interno, español directo (descartable, no va a i18n).

type Device = { id: string; label: string; ip: string; barber_id: string | null }
type Barber = { id: string; name: string }
type SummaryRow = {
  device_id: string
  label: string
  ip: string
  total_scans: number
  arp_seen: number
  icmp_seen: number
  arp_not_icmp: number
  icmp_not_arp: number
  first_scan: string | null
  last_scan: string | null
}

export default function SensorManager({
  shopId,
  initialToken,
  initialDevices,
  summary,
  barbers,
}: {
  shopId: string
  initialToken: string | null
  initialDevices: Device[]
  summary: SummaryRow[]
  barbers: Barber[]
}) {
  const [token, setToken] = useState<string | null>(initialToken)
  const [devices, setDevices] = useState<Device[]>(initialDevices)
  const [label, setLabel] = useState('')
  const [ip, setIp] = useState('')
  const [barberId, setBarberId] = useState('')
  const [adding, setAdding] = useState(false)
  const [genLoading, setGenLoading] = useState(false)
  const [error, setError] = useState('')
  const [origin, setOrigin] = useState('')

  useEffect(() => setOrigin(window.location.origin), [])

  const barberName = (id: string | null) =>
    id ? (barbers.find(b => b.id === id)?.name ?? '—') : '—'

  async function generateToken() {
    if (genLoading) return
    setGenLoading(true)
    setError('')
    try {
      const res = await fetch('/api/sensor/token', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.token) setToken(data.token)
      else setError(data.error ?? 'No se pudo generar el token')
    } catch {
      setError('Error de red')
    }
    setGenLoading(false)
  }

  async function addDevice(e: React.FormEvent) {
    e.preventDefault()
    if (adding || !label.trim() || !ip.trim()) return
    setAdding(true)
    setError('')
    const supabase = createClient()
    const { data, error: addErr } = await supabase
      .from('poc_sensor_devices')
      .insert({
        shop_id: shopId,
        label: label.trim(),
        ip: ip.trim(),
        barber_id: barberId || null,
      })
      .select('id, label, ip, barber_id')
      .single()
    if (addErr) setError(addErr.message)
    else if (data) {
      setDevices(prev => [...prev, data as Device])
      setLabel('')
      setIp('')
      setBarberId('')
    }
    setAdding(false)
  }

  async function deleteDevice(id: string) {
    if (!confirm('¿Quitar este dispositivo del pareo?')) return
    const supabase = createClient()
    const { error: delErr } = await supabase.from('poc_sensor_devices').delete().eq('id', id)
    if (delErr) setError(delErr.message)
    else setDevices(prev => prev.filter(d => d.id !== id))
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl w-full mx-auto">
      <p className="text-nxtup-break text-xs uppercase tracking-[0.3em] font-bold mb-1">
        POC · solo medición
      </p>
      <h1 className="text-3xl font-black tracking-tight mb-2">Sensor de salida</h1>
      <p className="text-nxtup-muted text-sm mb-8 max-w-prose">
        Mide si podemos detectar cuándo un barbero sale del shop mirando la red
        local. Esta fase NO pone break a nadie — solo registra presencia
        ARP (verdad) vs ICMP (proxy) para decidir el hardware de producción.
      </p>

      {error && <p className="text-nxtup-busy text-sm mb-4">{error}</p>}

      {/* ── Config del sensor ── */}
      <section className="border border-nxtup-line rounded-2xl p-4 mb-8">
        <h2 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold mb-3">
          Configuración del agente
        </h2>
        <div className="flex flex-col gap-3 text-sm">
          <Field label="SENSOR_SERVER" value={origin || '…'} />
          <Field
            label="SENSOR_TOKEN"
            value={token ?? '(genera uno)'}
            mono
          />
          <button
            type="button"
            onClick={generateToken}
            disabled={genLoading}
            className="self-start px-4 py-2 bg-nxtup-line border border-nxtup-dim hover:border-white rounded-lg text-xs font-medium transition-colors disabled:opacity-40"
          >
            {genLoading ? '...' : token ? 'Rotar token' : 'Generar token'}
          </button>
          <p className="text-nxtup-dim text-xs leading-relaxed">
            Ponlos como variables de entorno del script (`scan-agent.py`) en el
            Linux del shop. Rotar el token invalida el anterior. Ver
            `tools/poc-exit-sensor/README.md`.
          </p>
        </div>
      </section>

      {/* ── Pareo ── */}
      <section className="mb-8">
        <h2 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold mb-3">
          Dispositivos pareados (IP → barbero)
        </h2>
        <form
          onSubmit={addDevice}
          className="border border-nxtup-line rounded-2xl p-4 mb-4 flex flex-col sm:flex-row gap-3"
        >
          <input
            required
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="Etiqueta (ej. iPhone de Luis)"
            className="flex-1 bg-nxtup-bg text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim"
          />
          <input
            required
            value={ip}
            onChange={e => setIp(e.target.value)}
            placeholder="IP local (192.168.x.x)"
            inputMode="decimal"
            className="w-full sm:w-44 bg-nxtup-bg text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim font-mono text-sm"
          />
          <select
            value={barberId}
            onChange={e => setBarberId(e.target.value)}
            className="w-full sm:w-40 bg-nxtup-bg text-white rounded-lg px-3 py-3 border border-nxtup-dim focus:border-white focus:outline-none"
          >
            <option value="">Barbero…</option>
            {barbers.map(b => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={adding || !label.trim() || !ip.trim()}
            className="px-5 py-3 bg-white text-black font-semibold rounded-lg disabled:opacity-40 transition-all active:scale-[0.98]"
          >
            {adding ? '...' : 'Parear'}
          </button>
        </form>

        {devices.length === 0 ? (
          <p className="text-nxtup-dim text-sm px-1">
            Aún no hay dispositivos pareados.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {devices.map(d => (
              <li
                key={d.id}
                className="flex items-center gap-3 rounded-xl bg-nxtup-line border border-nxtup-line px-4 py-3"
              >
                <span className="text-white font-medium flex-1 min-w-0 truncate">
                  {d.label}
                </span>
                <span className="text-nxtup-muted font-mono text-xs">{d.ip}</span>
                <span className="text-nxtup-dim text-xs hidden sm:inline">
                  {barberName(d.barber_id)}
                </span>
                <button
                  onClick={() => deleteDevice(d.id)}
                  className="text-nxtup-dim hover:text-nxtup-busy text-xs px-2 py-1 transition-colors"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Mediciones ── */}
      <section>
        <h2 className="text-nxtup-muted text-xs uppercase tracking-[0.3em] font-bold mb-1">
          Mediciones (recarga para actualizar)
        </h2>
        <p className="text-nxtup-dim text-xs mb-4 leading-relaxed max-w-prose">
          <span className="text-nxtup-break font-bold">Punto ciego</span> = ciclos
          donde ARP vio el teléfono pero ICMP no. Es lo que decide si producción
          puede ir en la onn (ICMP): si es bajo, la onn sirve; si es alto, hace
          falta un sensor Linux por shop.
        </p>
        {summary.length === 0 ? (
          <p className="text-nxtup-dim text-sm px-1">
            Sin datos todavía — corre el agente y recarga.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-nxtup-dim text-xs uppercase tracking-wider text-left">
                  <th className="py-2 pr-4 font-bold">Dispositivo</th>
                  <th className="py-2 px-2 font-bold text-right">Escaneos</th>
                  <th className="py-2 px-2 font-bold text-right">ARP</th>
                  <th className="py-2 px-2 font-bold text-right">ICMP</th>
                  <th className="py-2 px-2 font-bold text-right text-nxtup-break">
                    Punto ciego
                  </th>
                  <th className="py-2 pl-2 font-bold text-right">Último</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(s => (
                  <tr key={s.device_id} className="border-t border-nxtup-line">
                    <td className="py-2 pr-4 text-white truncate max-w-[160px]">
                      {s.label}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-nxtup-muted">
                      {s.total_scans}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-nxtup-active">
                      {s.arp_seen}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums text-nxtup-muted">
                      {s.icmp_seen}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-bold text-nxtup-break">
                      {s.arp_not_icmp}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums text-nxtup-dim text-xs">
                      {s.last_scan
                        ? new Date(s.last_scan).toLocaleTimeString(undefined, {
                            hour: 'numeric',
                            minute: '2-digit',
                          })
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-nxtup-dim text-[10px] uppercase tracking-widest">{label}</span>
      <code
        className={`text-nxtup-muted bg-nxtup-bg border border-nxtup-line rounded-md px-3 py-2 break-all ${
          mono ? 'font-mono text-xs' : 'text-sm'
        }`}
      >
        {value}
      </code>
    </div>
  )
}
