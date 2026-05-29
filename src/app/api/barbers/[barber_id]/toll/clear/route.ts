import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Owner-only: quitar la penalidad (late_arrival_toll) de un barbero.
 *
 * Route: POST /api/barbers/[barber_id]/toll/clear
 *
 * Diseñado para el botón "Quitar penalidad" del Centro de Mando del
 * dashboard. El dueño lo usa cuando:
 *   * Hubo un bug nuestro que aplicó peaje incorrectamente.
 *   * Quiere ejercer discreción sobre la regla (ej. el barbero
 *     tenía justificación legítima para llegar tarde).
 *   * Necesita mover el barbero en la FIFO y el peaje lo bloquea.
 *
 * Auth: cookie del dueño autenticado. Verifica que el barber_id
 * pertenezca a un shop con owner_id = user.id antes de llamar la
 * RPC. Si la cookie es de otro usuario o no hay cookie → 403.
 *
 * La RPC `clear_barber_toll` corre como SECURITY DEFINER pero no
 * verifica ownership ella misma — eso queda en este endpoint.
 *
 * Response:
 *   200 {
 *     rows_as_late: number,      // filas borradas donde era late
 *     rows_as_existing: number,  // filas borradas donde era existing
 *     affected_lates: number     // barberos late cuyo counter cambió
 *   }
 *   401 si no hay sesión
 *   403 si el barbero no pertenece a un shop del owner autenticado
 *   404 si el barbero no existe
 *   500 si la RPC falla
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'No autenticado' }, { status: 401 })
  }

  // Verificar ownership: el barbero debe estar en un shop cuyo
  // owner_id sea el user actual. Si no, 403.
  const { data: barber } = await supabase
    .from('barbers')
    .select('id, shop_id, shops:shop_id(owner_id)')
    .eq('id', barber_id)
    .single()

  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }

  const ownerId = (barber as { shops?: { owner_id?: string } | null }).shops
    ?.owner_id
  if (ownerId !== user.id) {
    return Response.json(
      { error: 'No tienes permisos para este barbero' },
      { status: 403 },
    )
  }

  const { data, error } = await supabase.rpc('clear_barber_toll', {
    p_barber_id: barber_id,
  })

  if (error) {
    console.error('[toll/clear] RPC failed', error)
    return Response.json(
      { error: 'No se pudo quitar la penalidad' },
      { status: 500 },
    )
  }

  return Response.json(data ?? {})
}
