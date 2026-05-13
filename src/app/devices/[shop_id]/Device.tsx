'use client'

import BarberDeviceScreen from '@/components/BarberDeviceScreen'
import type { Barber, Entry, Shop } from './DeviceGrid'

const STATUS_LABEL: Record<Barber['status'], string> = {
  available: 'Active',
  busy: 'Busy',
  break: 'Break',
  offline: 'Off',
}

export default function Device({
  barber,
  shop,
  fifoPosition,
  heldPosition,
  calledClient,
  currentClient,
}: {
  barber: Barber
  shop: Shop
  fifoPosition: number | undefined
  heldPosition: number | undefined
  calledClient: Entry | null
  currentClient: Entry | null
}) {
  return (
    <div className="flex flex-col items-stretch">
      {/* Bezel — the simulator wraps the LCD in a faux frame so it visually
          reads as a "physical device" sitting on the table. */}
      <div className="bg-zinc-900 rounded-2xl p-3 shadow-[0_0_0_1px_rgba(255,255,255,0.05),0_24px_48px_-24px_rgba(0,0,0,0.8)]">
        <BarberDeviceScreen
          barber={barber}
          shop={shop}
          fifoPosition={fifoPosition}
          heldPosition={heldPosition}
          calledClient={calledClient}
          currentClient={currentClient}
          variant="simulator"
        />
      </div>

      <p className="text-nxtup-dim text-[10px] uppercase tracking-[0.3em] mt-3 text-center font-mono">
        {barber.name} · {STATUS_LABEL[barber.status]}
      </p>
    </div>
  )
}
