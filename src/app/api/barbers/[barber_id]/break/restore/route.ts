import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePanelToken } from '@/lib/panel-token'

/**
 * Owner-only: devolver un break al barbero (decrementa el contador
 * `breaks_taken_today` en 1).
 *
 * Route: POST /api/barbers/[barber_id]/break/restore
 *
 * Caso de uso: el barbero tocó BREAK sin querer en su PWA y "perdió"
 * su primer break de 60 min (ahora `breaks_taken_today=1` y el
 * siguiente break que pida valdrá los `next_break_minutes` del shop
 * en vez de los `first_break_minutes`). El dueño desde el Centro de
 * Mando pulsa "Devolver break" → el contador vuelve a 0 (o a N-1 si
 * ya había tomado varios breaks) → el próximo break del día vuelve
 * a contar como el "primero" si llegamos a 0.
 *
 * Idempotencia: si `breaks_taken_today` ya está en 0 retornamos 409
 * con un mensaje claro — no decrementamos a negativo.
 *
 * Auth: panel-token o cookie del dueño. Verifica que el barber_id
 * pertenezca al shop autorizado antes de mutar.
 *
 * Migración 049: agrega 'break_restored_by_owner' al CHECK del
 * activity_log. Si no se ha corrido, el INSERT del log falla y
 * devolvemos 500 — el cliente verá "No se pudo devolver el break".
 *
 * Response:
 *   200 { restored: true, breaks_taken_today: N }   // contador nuevo
 *   401 si no hay sesión / token inválido
 *   403 si el barbero no pertenece al owner/shop autorizado
 *   404 si el barbero no existe
 *   409 si el contador ya está en 0 (nada que devolver)
 *   500 si el UPDATE o el INSERT de log fallan
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params

  // ── Auth path 1: panel token (Centro de Mando temporal) ─────
  const panelTokenHeader = request.headers.get('x-panel-token')
  const panelTokenShopId = panelTokenHeader
    ? await validatePanelToken(request)
    : null
  if (panelTokenHeader && !panelTokenShopId) {
    return Response.json(
      { error: 'Token de panel inválido o expirado' },
      { status: 401 },
    )
  }
  const isPanelTokenRequest = Boolean(panelTokenShopId)

  // Cliente: admin para panel-token (bypass RLS gated por el token),
  // cookie para flujo dueño tradicional (RLS aplica como dueño).
  const supabase = isPanelTokenRequest ? createAdminClient() : await createClient()

  // ── Owner / shop verification + leer breaks_taken_today ────
  // Una sola query para minimizar round trips.
  const { data: barber } = await supabase
    .from('barbers')
    .select('id, shop_id, breaks_taken_today, shops:shop_id(owner_id)')
    .eq('id', barber_id)
    .single()

  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }

  let restoredBy: string | null = null

  if (isPanelTokenRequest) {
    // Token-scoped: el token solo autoriza al shop que firmó.
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
    restoredBy = user.id
  }

  const currentCount =
    (barber as { breaks_taken_today?: number | null }).breaks_taken_today ?? 0

  if (currentCount <= 0) {
    // 409: estado actual ya está en 0, no hay break que devolver.
    // El frontend (ControlPanel) solo muestra el botón cuando > 0,
    // así que esto solo debería pasar si dos dueños tapean al mismo
    // tiempo o si hubo un reset nocturno entre el render y el tap.
    return Response.json(
      {
        error: 'Este barbero no tiene breaks que devolver',
        code: 'already_zero',
      },
      { status: 409 },
    )
  }

  const newCount = currentCount - 1

  // UPDATE el contador. No tocamos break_started_at, break_held_since,
  // break_minutes_at_start porque esos están vacíos cuando el barbero
  // NO está en break (que es cuando esto se invoca — si estuviera en
  // break, el botón en el ControlPanel no tendría sentido y el dueño
  // tendría que sacarlo primero del break).
  const { error: updateErr } = await supabase
    .from('barbers')
    .update({ breaks_taken_today: newCount })
    .eq('id', barber_id)

  if (updateErr) {
    console.error('[break/restore] update failed', updateErr)
    return Response.json(
      { error: 'No se pudo devolver el break', details: updateErr.message },
      { status: 500 },
    )
  }

  // Log para audit trail. Si la migración 049 no se corrió, este insert
  // falla por el CHECK constraint y devolvemos 500 con el error de
  // Postgres para que el dueño sepa qué arreglar.
  const adminLog = createAdminClient()
  const { error: logErr } = await adminLog.from('activity_log').insert({
    shop_id: (barber as { shop_id: string }).shop_id,
    barber_id,
    action: 'break_restored_by_owner',
    from_status: null,
    to_status: null,
    metadata: {
      previous_count: currentCount,
      new_count: newCount,
      restored_by: restoredBy,
    },
  })

  if (logErr) {
    console.error('[break/restore] activity_log insert failed', logErr)
    // El UPDATE ya pasó — devolver el éxito pero adjuntar warning para
    // que el frontend pueda mostrarlo si quiere debug.
    return Response.json({
      restored: true,
      breaks_taken_today: newCount,
      log_warning: logErr.message,
    })
  }

  return Response.json({ restored: true, breaks_taken_today: newCount })
}
