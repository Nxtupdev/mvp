import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePanelToken } from '@/lib/panel-token'

/**
 * Owner-only: mover un barbero un slot arriba o abajo en la FIFO.
 *
 * Route: POST /api/barbers/[barber_id]/fifo/move
 * Body:  { direction: 'up' | 'down' }
 *
 * Diseñado para los botones ↑/↓ del Centro de Mando. Reglas técnicas
 * impuestas por la RPC:
 *   * El barbero debe estar en status='available' con available_since
 *     no null (= dentro de la FIFO).
 *   * No puede tener peaje (late_toll_remaining = 0). Si lo tiene,
 *     el dueño primero lo libera con /toll/clear y luego lo mueve.
 *   * Debe existir un vecino en la dirección pedida.
 *
 * Mecánica: swap atómico del `available_since` con el vecino
 * inmediato. Eso preserva las posiciones relativas de los demás
 * barberos.
 *
 * Auth: cookie del dueño. Verifica ownership del shop del barbero
 * antes de llamar la RPC. Otros endpoints del control panel siguen
 * el mismo patrón.
 *
 * Response:
 *   200 {
 *     direction: 'up' | 'down',
 *     swapped_with: uuid,
 *     new_available_since: iso8601
 *   }
 *   400 si la dirección es inválida
 *   401 si no hay sesión
 *   403 si el barbero no pertenece al owner autenticado
 *   404 si el barbero no existe
 *   409 si el barbero tiene peaje o no hay vecino o no está
 *       en estado available — devolvemos el `error` literal de la
 *       RPC para que el frontend muestre un mensaje claro
 *   500 si la RPC falla por causa inesperada
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params

  let body: { direction?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  if (body.direction !== 'up' && body.direction !== 'down') {
    return Response.json(
      { error: "direction debe ser 'up' o 'down'" },
      { status: 400 },
    )
  }

  // Panel token (Centro de Mando temporal — migración 043). Si está
  // presente y es válido, autoriza esta request sin cookie de dueño.
  const panelTokenHeader = request.headers.get('x-panel-token')
  const panelTokenShopId = panelTokenHeader
    ? await validatePanelToken(request)
    : null
  if (panelTokenHeader && !panelTokenShopId) {
    return Response.json({ error: 'Token de panel inválido o expirado' }, { status: 401 })
  }
  const isPanelTokenRequest = Boolean(panelTokenShopId)

  const supabase = isPanelTokenRequest ? createAdminClient() : await createClient()

  const { data: barber } = await supabase
    .from('barbers')
    .select('id, shop_id, shops:shop_id(owner_id)')
    .eq('id', barber_id)
    .single()

  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }

  // Auth path 1: cookie del dueño autenticado (flujo original).
  // Auth path 2: header x-panel-token cuyo shop_id matchea el del barbero.
  if (isPanelTokenRequest) {
    // Scope-limit: token del shop A no puede mover barberos del shop B.
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
    const ownerId = (barber as { shops?: { owner_id?: string } | null }).shops
      ?.owner_id
    if (ownerId !== user.id) {
      return Response.json(
        { error: 'No tienes permisos para este barbero' },
        { status: 403 },
      )
    }
  }

  const { data, error } = await supabase.rpc('move_barber_fifo', {
    p_barber_id: barber_id,
    p_direction: body.direction,
  })

  if (error) {
    // Pasamos el mensaje crudo de Postgres al frontend para debug
    // en línea — el usuario ve qué falló sin tener que mirar logs.
    console.error('[fifo/move] RPC failed', error)
    return Response.json(
      {
        error: error.message || 'No se pudo mover el barbero',
        code: error.code,
        details: error.details,
        hint: error.hint,
      },
      { status: 500 },
    )
  }

  // La RPC devuelve un JSON. Si trae `error`, es un conflicto
  // semántico (peaje activo, sin vecino, status incorrecto) — lo
  // exponemos al frontend con 409 para que muestre el mensaje.
  if (data && typeof data === 'object' && 'error' in data) {
    return Response.json(data, { status: 409 })
  }

  return Response.json(data ?? {})
}
