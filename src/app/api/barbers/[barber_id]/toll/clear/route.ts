import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePanelToken } from '@/lib/panel-token'

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
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params

  // Panel token (Centro de Mando temporal — migración 043). Si está
  // presente y es válido, autoriza esta request sin necesidad de cookie
  // de dueño. Usamos admin client (bypass RLS) gated por el token.
  const panelTokenHeader = request.headers.get('x-panel-token')
  const panelTokenShopId = panelTokenHeader
    ? await validatePanelToken(request)
    : null
  if (panelTokenHeader && !panelTokenShopId) {
    return Response.json({ error: 'Token de panel inválido o expirado' }, { status: 401 })
  }
  const isPanelTokenRequest = Boolean(panelTokenShopId)

  const supabase = isPanelTokenRequest ? createAdminClient() : await createClient()

  // Auth path 1: cookie del dueño autenticado (flujo original).
  // Auth path 2: header x-panel-token cuyo shop_id matchea el shop
  // del barbero. Cada path tiene su propio early-return en 401/403.
  if (isPanelTokenRequest) {
    // Scope-limit: token del shop A no puede clear-toll de barberos
    // del shop B.
    const { data: barber } = await supabase
      .from('barbers')
      .select('shop_id')
      .eq('id', barber_id)
      .single()
    if (!barber) {
      return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
    }
    if ((barber as { shop_id: string }).shop_id !== panelTokenShopId) {
      return Response.json(
        { error: 'El token no tiene acceso a este barbero' },
        { status: 403 },
      )
    }
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return Response.json({ error: 'No autenticado' }, { status: 401 })
    }
    const { data: ownerCheck } = await supabase
      .from('barbers')
      .select('shops:shop_id(owner_id)')
      .eq('id', barber_id)
      .single()
    const ownerId = (ownerCheck as { shops?: { owner_id?: string } | null } | null)
      ?.shops?.owner_id
    if (ownerId !== user.id) {
      return Response.json(
        { error: 'No tienes permisos para este barbero' },
        { status: 403 },
      )
    }
  }

  const { data, error } = await supabase.rpc('clear_barber_toll', {
    p_barber_id: barber_id,
  })

  if (error) {
    // Pasamos el mensaje crudo de Postgres al frontend para que se vea
    // qué pasa sin tener que mirar logs. Incluye `code`, `details` y
    // `hint` si vienen — el frontend puede usar el `error` legible y
    // los otros campos son metadata para debug en consola.
    console.error('[toll/clear] RPC failed', error)
    return Response.json(
      {
        error: error.message || 'No se pudo quitar la penalidad',
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      { status: 500 },
    )
  }

  return Response.json(data ?? {})
}
