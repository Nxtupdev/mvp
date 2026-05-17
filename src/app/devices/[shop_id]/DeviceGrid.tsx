'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isRenderableAvatar } from '@/components/avatars'
import {
  buildBarberOrder,
  buildHeldPositions,
} from '@/lib/queue-order'
import Device from './Device'

export type Shop = {
  id: string
  name: string
  first_break_minutes: number
  next_break_minutes: number
  keep_position_on_break: boolean
  break_position_grace_minutes: number
  logo_url: string | null
}

export type Barber = {
  id: string
  name: string
  avatar: string | null
  status: 'available' | 'busy' | 'break' | 'offline'
  available_since: string | null
  break_started_at: string | null
  break_held_since: string | null
  break_minutes_at_start: number | null
  breaks_taken_today: number | null
}

export type Entry = {
  id: string
  client_name: string
  position: number
  status: 'called' | 'in_progress'
  barber_id: string | null
  created_at: string
}

export default function DeviceGrid({
  shop,
  initialBarbers,
  initialEntries,
}: {
  shop: Shop
  initialBarbers: Barber[]
  initialEntries: Entry[]
}) {
  const [barbers, setBarbers] = useState<Barber[]>(
    initialBarbers.map(b => ({
      ...b,
      avatar: isRenderableAvatar(b.avatar) ? b.avatar : null,
    })),
  )
  const [entries, setEntries] = useState<Entry[]>(initialEntries)

  useEffect(() => {
    const supabase = createClient()

    const refresh = async () => {
      const [{ data: b }, { data: e }] = await Promise.all([
        supabase
          .from('barbers')
          .select(
            'id, name, avatar, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
          )
          .eq('shop_id', shop.id)
          .order('name'),
        supabase
          .from('queue_entries')
          .select(
            'id, client_name, position, status, barber_id, created_at',
          )
          .eq('shop_id', shop.id)
          .in('status', ['called', 'in_progress']),
      ])
      if (b)
        setBarbers(
          (b as unknown[]).map(r => {
            const row = r as { avatar?: unknown } & Omit<Barber, 'avatar'>
            return { ...row, avatar: isRenderableAvatar(row.avatar) ? row.avatar : null }
          }),
        )
      if (e) setEntries(e as Entry[])
    }

    const channel = supabase
      .channel(`devices-${shop.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'barbers',
          filter: `shop_id=eq.${shop.id}`,
        },
        refresh,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `shop_id=eq.${shop.id}`,
        },
        refresh,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [shop.id])

  const fifoOrder = useMemo(() => buildBarberOrder(barbers), [barbers])
  const heldPositions = useMemo(() => buildHeldPositions(barbers), [barbers])

  return (
    <main className="min-h-screen px-6 py-8">
      <header className="mb-8 flex flex-col items-center gap-2">
        <p className="text-nxtup-muted text-xs uppercase tracking-[0.4em] font-bold">
          Devices simulator
        </p>
        <h1 className="text-3xl font-black tracking-tight">{shop.name}</h1>
        <p className="text-nxtup-dim text-sm text-center max-w-md">
          Simula las pantallas físicas de los barberos. Cada cambio aquí se
          refleja en realtime en la TV, dashboard y check-in.
        </p>
      </header>

      {barbers.length === 0 ? (
        <div className="border border-nxtup-line rounded-2xl py-16 text-center max-w-xl mx-auto">
          <p className="text-nxtup-muted text-sm">
            No hay barberos registrados. Agregalos desde Dashboard → Barbers.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 max-w-7xl mx-auto">
          {barbers.map(b => (
            <Device
              key={b.id}
              barber={b}
              shop={shop}
              fifoPosition={fifoOrder.get(b.id)}
              heldPosition={heldPositions.get(b.id)}
              calledClient={
                entries.find(
                  e => e.barber_id === b.id && e.status === 'called',
                ) ?? null
              }
              currentClient={
                entries.find(
                  e => e.barber_id === b.id && e.status === 'in_progress',
                ) ?? null
              }
            />
          ))}
        </div>
      )}
    </main>
  )
}
