import { createAdminClient } from '@/lib/supabase/admin'
import { signedMamacitaPost } from '@/lib/mamacita'

/**
 * Porte del número de Julie (080) — helpers del contrato con Mamacita.
 *
 * Los estados del porte viven en el lado de Mamacita (ops los avanza a
 * mano en Twilio) y NXTUP los CONSULTA con mamacita-port-status al
 * cargar la página de Julie. Aquí viven el mapeo de sus estados al
 * enum local de julie_numbers y el sync del espejo.
 */

/** Estado Mamacita → estado local de julie_numbers (077). */
export function mapPortStatus(remote: string): string | null {
  switch (remote) {
    case 'collecting':
      return 'info_required' // el dueño aún no completó el enlace seguro
    case 'submitted':
      return 'submitted'
    case 'scheduled':
      return 'porting_in_progress'
    case 'completed':
      return 'completed'
    case 'rejected':
    case 'cancelled':
      return 'failed'
    default:
      return null
  }
}

/**
 * Consulta el estado del porte en Mamacita y actualiza el espejo local
 * si cambió. Best-effort: ante cualquier fallo devuelve null y la
 * página pinta lo último conocido del espejo. Devuelve los datos
 * frescos para render inmediato.
 */
export async function syncPortStatus(shopId: string): Promise<{
  status: string
  focDate: string | null
  rejectReason: string | null
  number: string | null
} | null> {
  const url = process.env.MAMACITA_PORT_STATUS_URL
  if (!url) return null
  try {
    const res = await signedMamacitaPost(url, { shop_id: shopId }, 10000)
    const body = (res.body ?? {}) as {
      status?: string
      phone_number?: string
      foc_date?: string
      reject_reason?: string
    }
    if (res.status !== 200 || !body.status || body.status === 'none') return null

    const local = mapPortStatus(body.status)
    if (!local) return null

    const admin = createAdminClient()
    await admin
      .from('julie_numbers')
      .update({
        status: local,
        foc_date: body.foc_date ?? null,
        fail_reason: local === 'failed' ? body.reject_reason ?? null : null,
        number: local === 'completed' ? body.phone_number ?? null : null,
        updated_at: new Date().toISOString(),
      })
      .eq('shop_id', shopId)
      .eq('choice', 'port')

    return {
      status: local,
      focDate: body.foc_date ?? null,
      rejectReason: body.reject_reason ?? null,
      number: body.phone_number ?? null,
    }
  } catch (err) {
    console.error('[julie-port] status sync failed', err)
    return null
  }
}
