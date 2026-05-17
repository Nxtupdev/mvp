'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { isAvatarId } from '@/components/avatars'
import {
  buildBarberOrder,
  buildHeldPositions,
  type BarberOrderable,
} from '@/lib/queue-order'
import BarberDeviceScreen, {
  type BarberDeviceData,
  type ShopDeviceConfig,
  type DeviceClient,
} from '@/components/BarberDeviceScreen'

type Shop = ShopDeviceConfig & { id: string; name: string }
type Peer = BarberOrderable & {
  break_started_at?: string | null
  break_held_since?: string | null
  break_minutes_at_start?: number | null
  breaks_taken_today?: number | null
}

export default function BarberControl({
  shopId,
  shop,
  initialBarber,
  initialCalledClient,
  initialCurrentClient,
  initialPeers,
}: {
  shopId: string
  shop: Shop
  initialBarber: BarberDeviceData
  initialCalledClient: DeviceClient
  initialCurrentClient: DeviceClient
  initialPeers: Peer[]
}) {
  const [barber, setBarber] = useState<BarberDeviceData>({
    ...initialBarber,
    avatar: isAvatarId(initialBarber.avatar) ? initialBarber.avatar : null,
  })
  const [calledClient, setCalledClient] =
    useState<DeviceClient>(initialCalledClient)
  const [currentClient, setCurrentClient] =
    useState<DeviceClient>(initialCurrentClient)
  const [peers, setPeers] = useState<Peer[]>(initialPeers)

  // Subscribe to: this barber's row, all peer barbers (for FIFO position),
  // and queue_entries assigned to this barber (called + in_progress).
  useEffect(() => {
    const supabase = createClient()

    const fetchBarber = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
        )
        .eq('id', barber.id)
        .single()
      if (data) {
        const row = data as { avatar?: unknown } & Omit<
          BarberDeviceData,
          'avatar'
        >
        setBarber({ ...row, avatar: isAvatarId(row.avatar) ? row.avatar : null })
      }
    }

    const fetchPeers = async () => {
      const { data } = await supabase
        .from('barbers')
        .select(
          'id, status, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated',
        )
        .eq('shop_id', shopId)
      if (data) setPeers(data as Peer[])
    }

    const fetchClients = async () => {
      const [{ data: called }, { data: current }] = await Promise.all([
        supabase
          .from('queue_entries')
          .select('id, client_name, position')
          .eq('barber_id', barber.id)
          .eq('status', 'called')
          .maybeSingle(),
        supabase
          .from('queue_entries')
          .select('id, client_name, position')
          .eq('barber_id', barber.id)
          .eq('status', 'in_progress')
          .maybeSingle(),
      ])
      setCalledClient(called)
      setCurrentClient(current)
    }

    const channel = supabase
      .channel(`barber-standalone-${barber.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'barbers',
          filter: `id=eq.${barber.id}`,
        },
        fetchBarber,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'barbers',
          filter: `shop_id=eq.${shopId}`,
        },
        fetchPeers,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `barber_id=eq.${barber.id}`,
        },
        fetchClients,
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [barber.id, shopId])

  // Compute this barber's FIFO position out of the shop-wide barber list.
  // The peers array might not include this barber's freshest row, so merge.
  const fifoPosition = useMemo(() => {
    const merged: Peer[] = peers.some(p => p.id === barber.id)
      ? peers.map(p =>
          p.id === barber.id
            ? {
                id: barber.id,
                status: barber.status,
                available_since: barber.available_since,
                break_held_since: barber.break_held_since,
              }
            : p,
        )
      : [
          ...peers,
          {
            id: barber.id,
            status: barber.status,
            available_since: barber.available_since,
            break_held_since: barber.break_held_since,
          },
        ]
    return buildBarberOrder(merged).get(barber.id)
  }, [
    peers,
    barber.id,
    barber.status,
    barber.available_since,
    barber.break_held_since,
  ])

  // "Held position" — what position they'll come back to if they're on break.
  const heldPosition = useMemo(() => {
    const merged: Peer[] = peers.some(p => p.id === barber.id)
      ? peers.map(p =>
          p.id === barber.id
            ? {
                id: barber.id,
                status: barber.status,
                available_since: barber.available_since,
                break_held_since: barber.break_held_since,
              }
            : p,
        )
      : [
          ...peers,
          {
            id: barber.id,
            status: barber.status,
            available_since: barber.available_since,
            break_held_since: barber.break_held_since,
          },
        ]
    return buildHeldPositions(merged).get(barber.id)
  }, [
    peers,
    barber.id,
    barber.status,
    barber.available_since,
    barber.break_held_since,
  ])

  return (
    <BarberDeviceScreen
      barber={barber}
      shop={shop}
      fifoPosition={fifoPosition}
      heldPosition={heldPosition}
      calledClient={calledClient}
      currentClient={currentClient}
      variant="standalone"
    />
  )
}
