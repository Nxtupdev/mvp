import { createClient } from '@supabase/supabase-js'
import { DEMO_SHOP_ID } from '@/lib/demo'

/**
 * Data para la PUERTA PÚBLICA read-only `/demo` (sin login, escalable).
 *
 * Escala: la propiedad "1 golpe a la DB por intervalo, compartido entre
 * TODOS los visitantes" NO viene de aquí sino del `export const revalidate`
 * de la página (/demo es ISR). Este fetch se ejecuta a lo sumo una vez por
 * ventana de revalidación; el HTML cacheado se sirve a todos. NO marcar la
 * página como force-dynamic ni abrir realtime — eso funde el server con
 * volumen (un canal realtime por pestaña).
 *
 * Seguridad: CLAVADO a DEMO_SHOP_ID (constante), nunca a un id de la
 * request → un visitante no puede pedir otra tienda (anti-IDOR). Usamos el
 * cliente ANÓNIMO (no service role): barbers/queue_entries/shops son de
 * lectura pública, así que es el mínimo privilegio para una página pública.
 * Read-only: cero mutaciones.
 */

export type DemoBarber = {
  id: string
  name: string
  status: string
  avatar: string | null
  available_since: string | null
  break_held_since: string | null
  break_invalidated: boolean | null
}

export type DemoEntry = {
  id: string
  position: number
  client_name: string
  status: string
  barber_id: string | null
  arrived_at: string | null
  mamacita_entry_id: string | null
  eta_at: string | null
}

export type DemoBoard = {
  shopName: string
  displayMessage: string | null
  barbers: DemoBarber[]
  entries: DemoEntry[]
}

const EMPTY: DemoBoard = {
  shopName: 'NXTUP Demo',
  displayMessage: null,
  barbers: [],
  entries: [],
}

export async function getDemoBoard(): Promise<DemoBoard> {
  try {
    // Cliente anónimo sin cookies → no vuelve dinámica la página (mantiene ISR).
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
    const [shopRes, barbersRes, entriesRes] = await Promise.all([
      supabase.from('shops').select('name, display_message').eq('id', DEMO_SHOP_ID).maybeSingle(),
      supabase
        .from('barbers')
        .select('id, name, status, avatar, available_since, break_held_since, break_invalidated')
        .eq('shop_id', DEMO_SHOP_ID)
        .neq('status', 'offline')
        .order('name'),
      supabase
        .from('queue_entries')
        .select('id, position, client_name, status, barber_id, arrived_at, mamacita_entry_id, eta_at')
        .eq('shop_id', DEMO_SHOP_ID)
        .in('status', ['waiting', 'called', 'in_progress'])
        .order('position', { ascending: true }),
    ])
    return {
      shopName: (shopRes.data?.name as string | undefined) ?? 'NXTUP Demo',
      displayMessage: (shopRes.data?.display_message as string | null) ?? null,
      barbers: (barbersRes.data ?? []) as DemoBarber[],
      entries: (entriesRes.data ?? []) as DemoEntry[],
    }
  } catch {
    return EMPTY
  }
}
