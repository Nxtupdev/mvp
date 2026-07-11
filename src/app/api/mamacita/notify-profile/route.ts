import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyMamacita } from '@/lib/mamacita'

/**
 * POST /api/mamacita/notify-profile
 *
 * Lo llama el editor de servicios del dueño (/dashboard/services)
 * DESPUÉS de guardar cambios de servicios/precios. Lee la lista fresca
 * de servicios activos del shop del dueño y dispara `shop_profile_updated`
 * hacia Mamacita para que Julie (voz) pueda citar los precios cuando un
 * cliente pregunta por teléfono.
 *
 * Aditivo y best-effort: si Mamacita falla, el guardado del dueño no se
 * ve afectado (los cambios ya persistieron en la DB vía RLS antes de
 * este call). El secret compartido vive server-side dentro de
 * notifyMamacita — NUNCA se expone al cliente.
 *
 * Auth: cookie del dueño. Solo notifica el shop del que es owner.
 */
export async function POST(_request: NextRequest) {
  // ¿Quién llama? Debe ser el dueño autenticado (cookie de sesión).
  const cookieClient = await createClient()
  const {
    data: { user },
  } = await cookieClient.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autorizado' }, { status: 401 })
  }

  const admin = createAdminClient()

  // El shop del dueño (un dueño = un shop). Ata el aviso al shop propio
  // aunque el body no traiga nada — no se puede notificar shops ajenos.
  const { data: shop } = await admin
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) {
    return Response.json({ error: 'Shop no encontrado' }, { status: 404 })
  }

  // Lista fresca de servicios activos, en el orden que el dueño definió.
  const { data: services } = await admin
    .from('services')
    .select('name, price, duration_minutes')
    .eq('shop_id', shop.id)
    .eq('active', true)
    .order('sort_order', { ascending: true })

  await notifyMamacita({
    event: 'shop_profile_updated',
    nxtup_shop_id: shop.id,
    services: (services ?? []).map((s) => {
      const row = s as { name: string; price: number | null; duration_minutes: number | null }
      return {
        name: row.name,
        price: row.price ?? null,
        duration_min: row.duration_minutes ?? undefined,
      }
    }),
  })

  return Response.json({ ok: true })
}
