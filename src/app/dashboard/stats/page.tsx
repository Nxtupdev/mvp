import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Avatar, isAvatarId, type AvatarId } from '@/components/avatars'

type Entry = {
  id: string
  barber_id: string | null
  status: 'waiting' | 'called' | 'in_progress' | 'done' | 'cancelled'
  created_at: string
  called_at: string | null
  completed_at: string | null
}

type Barber = {
  id: string
  name: string
  avatar: AvatarId | null
}

export default async function StatsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  // Today / yesterday boundaries. Vercel runtime is UTC so setHours(0,…)
  // effectively gives UTC midnight. For DR / US-East users that's close
  // enough — full timezone correctness lives in a follow-up.
  const now = new Date()
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const yesterdayStart = new Date(todayStart)
  yesterdayStart.setDate(yesterdayStart.getDate() - 1)

  const [{ data: todayEntries }, { data: yesterdayEntries }, { data: barbers }] =
    await Promise.all([
      supabase
        .from('queue_entries')
        .select('id, barber_id, status, created_at, called_at, completed_at')
        .eq('shop_id', shop.id)
        .gte('created_at', todayStart.toISOString()),
      supabase
        .from('queue_entries')
        .select('id, barber_id, status, created_at, called_at, completed_at')
        .eq('shop_id', shop.id)
        .gte('created_at', yesterdayStart.toISOString())
        .lt('created_at', todayStart.toISOString()),
      supabase
        .from('barbers')
        .select('id, name, avatar')
        .eq('shop_id', shop.id)
        .order('name'),
    ])

  const today = (todayEntries ?? []) as Entry[]
  const yesterday = (yesterdayEntries ?? []) as Entry[]
  const allBarbers: Barber[] = (barbers ?? []).map(b => ({
    id: b.id,
    name: b.name,
    avatar: isAvatarId(b.avatar) ? b.avatar : null,
  }))

  // ── Card 1: Walk-ins ────────────────────────────────────────
  const walkInsToday = today.length
  const walkInsYesterday = yesterday.length
  const walkInsDeltaPct =
    walkInsYesterday > 0
      ? Math.round(((walkInsToday - walkInsYesterday) / walkInsYesterday) * 100)
      : null

  // ── Card 2: Tiempo promedio de espera ───────────────────────
  const waitToday = avgWaitMinutes(today)
  const waitYesterday = avgWaitMinutes(yesterday)
  const waitDelta = Math.round(waitToday - waitYesterday)

  // ── Card 3: Cortes por barbero ──────────────────────────────
  const cutsByBarber = computeCutsByBarber(today, allBarbers)

  // ── Card 4: Hora pico ───────────────────────────────────────
  const peak = computePeakHour(today)

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-5xl w-full mx-auto">
      <h1 className="text-3xl font-black tracking-tight mb-2">Stats</h1>
      <p className="text-nxtup-muted text-sm mb-8">
        Resumen del día. Comparado contra el día anterior.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card title="Walk-ins hoy">
          <BigNumber value={walkInsToday.toString()} />
          <Delta
            kind={walkInsDeltaPct === null ? 'neutral' : walkInsDeltaPct >= 0 ? 'up' : 'down'}
            label={
              walkInsDeltaPct === null
                ? 'Sin datos de ayer'
                : walkInsDeltaPct === 0
                  ? 'Igual que ayer'
                  : `${walkInsDeltaPct > 0 ? '+' : ''}${walkInsDeltaPct}% vs ayer (${walkInsYesterday})`
            }
          />
        </Card>

        <Card title="Tiempo promedio de espera">
          <BigNumber
            value={waitToday > 0 ? `${Math.round(waitToday)} min` : '—'}
            mutedSuffix={waitToday > 0 ? undefined : 'sin entries con call_at'}
          />
          <Delta
            kind={
              waitYesterday === 0 ? 'neutral' : waitDelta < 0 ? 'down' : waitDelta > 0 ? 'up' : 'neutral'
            }
            // Note: in wait time, going DOWN is good (less waiting).
            invertColors
            label={
              waitYesterday === 0
                ? 'Sin datos de ayer'
                : waitDelta === 0
                  ? 'Igual que ayer'
                  : `${waitDelta > 0 ? '+' : ''}${waitDelta} min vs ayer (${Math.round(waitYesterday)} min)`
            }
          />
        </Card>

        <Card title="Cortes por barbero">
          {cutsByBarber.length === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">Sin cortes registrados hoy</p>
          ) : (
            <ul className="flex flex-col gap-3 mt-2">
              {cutsByBarber.map(b => (
                <li key={b.id} className="flex items-center gap-3">
                  <Avatar avatar={b.avatar} name={b.name} size={28} />
                  <span className="text-white text-sm font-medium flex-1 truncate">
                    {b.name}
                  </span>
                  <span className="text-white text-lg font-black tabular-nums w-8 text-right">
                    {b.count}
                  </span>
                  <span className="text-nxtup-muted text-xs w-16 text-right tabular-nums">
                    {b.avgChairMin > 0 ? `~${Math.round(b.avgChairMin)} min` : '—'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Hora pico hoy">
          {peak.count === 0 ? (
            <p className="text-nxtup-dim text-sm py-6">Sin walk-ins registrados hoy</p>
          ) : (
            <>
              <BigNumber value={`${formatHour(peak.hour)} — ${formatHour(peak.hour + 1)}`} />
              <p className="text-nxtup-muted text-sm">
                {peak.count} {peak.count === 1 ? 'walk-in' : 'walk-ins'} en ese rango
              </p>
            </>
          )}
        </Card>
      </div>

      <p className="text-nxtup-dim text-xs mt-6 text-center">
        Última actualización: {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ·
        Recargá la página para ver datos frescos.
      </p>
    </main>
  )
}

// ──────────────────────────────────────────────────────────────
// Computations
// ──────────────────────────────────────────────────────────────

function avgWaitMinutes(entries: Entry[]): number {
  const waits = entries
    .filter(e => e.called_at)
    .map(
      e =>
        (new Date(e.called_at!).getTime() - new Date(e.created_at).getTime()) /
        60000,
    )
  if (waits.length === 0) return 0
  return waits.reduce((a, b) => a + b, 0) / waits.length
}

function computeCutsByBarber(entries: Entry[], barbers: Barber[]) {
  // Only "done" entries count as completed cuts.
  const done = entries.filter(e => e.status === 'done' && e.barber_id)
  const byId = new Map<string, { count: number; chairMins: number[] }>()
  for (const e of done) {
    if (!e.barber_id) continue
    let agg = byId.get(e.barber_id)
    if (!agg) {
      agg = { count: 0, chairMins: [] }
      byId.set(e.barber_id, agg)
    }
    agg.count++
    if (e.called_at && e.completed_at) {
      const min =
        (new Date(e.completed_at).getTime() -
          new Date(e.called_at).getTime()) /
        60000
      if (min > 0) agg.chairMins.push(min)
    }
  }
  const rows = barbers
    .map(b => {
      const agg = byId.get(b.id)
      return {
        id: b.id,
        name: b.name,
        avatar: b.avatar,
        count: agg?.count ?? 0,
        avgChairMin:
          agg && agg.chairMins.length > 0
            ? agg.chairMins.reduce((a, b) => a + b, 0) / agg.chairMins.length
            : 0,
      }
    })
    .filter(r => r.count > 0)
    .sort((a, b) => b.count - a.count)
  return rows
}

function computePeakHour(entries: Entry[]) {
  const buckets = new Array(24).fill(0) as number[]
  for (const e of entries) {
    const h = new Date(e.created_at).getHours()
    if (h >= 0 && h < 24) buckets[h]++
  }
  let peakHour = 0
  let peakCount = 0
  for (let h = 0; h < 24; h++) {
    if (buckets[h] > peakCount) {
      peakCount = buckets[h]
      peakHour = h
    }
  }
  return { hour: peakHour, count: peakCount }
}

function formatHour(h: number): string {
  const safe = ((h % 24) + 24) % 24
  return `${String(safe).padStart(2, '0')}:00`
}

// ──────────────────────────────────────────────────────────────
// Small render bits
// ──────────────────────────────────────────────────────────────

function Card({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-nxtup-line rounded-2xl p-6">
      <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-4">
        {title}
      </p>
      {children}
    </section>
  )
}

function BigNumber({
  value,
  mutedSuffix,
}: {
  value: string
  mutedSuffix?: string
}) {
  return (
    <div className="flex items-baseline gap-3 mb-2">
      <span className="text-5xl font-black tracking-tight tabular-nums">
        {value}
      </span>
      {mutedSuffix && (
        <span className="text-nxtup-dim text-xs">{mutedSuffix}</span>
      )}
    </div>
  )
}

function Delta({
  kind,
  label,
  invertColors,
}: {
  kind: 'up' | 'down' | 'neutral'
  label: string
  invertColors?: boolean
}) {
  // For most metrics, up = good (green). For wait-time, down = good — flip
  // the color semantics with invertColors.
  const goodGreen = !invertColors
  const upColor = goodGreen ? 'text-nxtup-active' : 'text-nxtup-busy'
  const downColor = goodGreen ? 'text-nxtup-busy' : 'text-nxtup-active'
  const color =
    kind === 'up' ? upColor : kind === 'down' ? downColor : 'text-nxtup-muted'
  const arrow = kind === 'up' ? '↑' : kind === 'down' ? '↓' : '·'
  return (
    <p className={`text-xs font-medium ${color}`}>
      {arrow} {label}
    </p>
  )
}
