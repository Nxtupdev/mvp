import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

/**
 * Tiempo real por BROADCAST: un canal privado por tienda, `shop:<id>`,
 * al que la base emite un mensaje por cada cambio en barbers,
 * queue_entries, activity_log y shops (migración 070 — port del
 * punto #3 del dealer, sus 073+078).
 *
 * Antes cada pantalla se suscribía a `postgres_changes` por tabla, y
 * Supabase evaluaba filtros y policies por cambio × suscriptor: con
 * decenas de TVs y cientos de teléfonos eso se degrada en hora pico.
 * Peor: el payload llevaba la fila COMPLETA (client_phone incluido) a
 * cualquier suscriptor anónimo — el canal residual que la 069 dejó
 * documentado.
 *
 * El mensaje es una SEÑAL, no la fila: `record` solo trae `id`,
 * `shop_id`, `barber_id` y `status` (los que existan en esa tabla).
 * Cualquiera con la anon key puede escuchar cualquier `shop:<id>` (el
 * TV y el kiosko no tienen sesión), así que lo que viaja es público
 * por diseño. Las pantallas refetchean lo que muestran con su propio
 * acceso, igual que ya hacían.
 */
export type ShopChangeTable = 'barbers' | 'queue_entries' | 'activity_log' | 'shops'

export type ShopChange = {
  table: ShopChangeTable
  op: 'INSERT' | 'UPDATE' | 'DELETE'
  record: Record<string, unknown>
}

export function shopChannelName(shopId: string): string {
  return `shop:${shopId}`
}

/**
 * Se une al canal de la tienda y llama `onChange` por cada cambio.
 * Devuelve el canal para que el llamador lo cierre con
 * `supabase.removeChannel`. `onStatus` recibe el estado de la
 * suscripción ('SUBSCRIBED' es el sano).
 */
export function subscribeShopChanges(
  supabase: SupabaseClient,
  shopId: string,
  onChange: (change: ShopChange) => void,
  onStatus?: (status: string) => void,
): RealtimeChannel {
  return supabase
    .channel(shopChannelName(shopId), { config: { private: true } })
    .on('broadcast', { event: 'change' }, ({ payload }) => {
      const p = payload as Partial<ShopChange> | undefined
      if (!p || !p.table || !p.op) return
      onChange({ table: p.table, op: p.op, record: (p.record ?? {}) as Record<string, unknown> })
    })
    .subscribe(status => onStatus?.(status))
}
