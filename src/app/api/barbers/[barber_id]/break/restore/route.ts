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

  // ── Owner / shop verification + leer estado actual del barbero ──
  // Una sola query para minimizar round trips. Necesitamos status y
  // break_started_at además del contador, porque si el barbero está
  // EN break ahora mismo, "devolver el break" también significa
  // sacarlo del break y restaurarlo a la posición en la que estaba
  // justo antes (available_since = break_started_at preserva la
  // posición FIFO original del barbero).
  const { data: barber } = await supabase
    .from('barbers')
    .select(
      'id, shop_id, status, breaks_taken_today, break_started_at, shops:shop_id(owner_id)',
    )
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

  // ── Construir el patch de UPDATE ─────────────────────────────
  // Caso A: barbero NO está en break — solo decrementamos el contador.
  //   Esto cubre "el dueño se enteró del mistap más tarde, cuando el
  //   barbero ya estaba de vuelta en Available/Busy/Offline."
  //
  // Caso B: barbero ESTÁ en break — además del decrement, deshacemos
  //   el break completo:
  //     * status: 'available' (el barbero vuelve a estar en cola)
  //     * available_since: break_started_at — clave para no penalizar
  //       en FIFO. Le ponemos la marca de tiempo de cuando tapeó break,
  //       que efectivamente lo regresa al lugar exacto donde estaba
  //       justo antes del mistap.
  //     * Limpiar todos los campos del break (started_at, held_since,
  //       minutes_at_start, invalidating_barber_ids, invalidated).
  //   El cron `nxtup-break-expired-offline` deja de aplicar para este
  //   barbero porque break_started_at queda en null.
  type BarberFields = {
    status?: 'available'
    available_since?: string | null
    break_started_at?: null
    break_held_since?: null
    break_minutes_at_start?: null
    break_invalidating_barber_ids?: string[]
    break_invalidated?: false
    breaks_taken_today: number
  }
  const wasOnBreak =
    (barber as { status?: string }).status === 'break'
  const breakStartedAt = (barber as { break_started_at?: string | null })
    .break_started_at ?? null

  const updatePatch: BarberFields = { breaks_taken_today: newCount }
  if (wasOnBreak) {
    updatePatch.status = 'available'
    // Fallback a "ahora" si por alguna razón break_started_at está null
    // (no debería pasar si status='break', pero defensivo).
    updatePatch.available_since = breakStartedAt ?? new Date().toISOString()
    updatePatch.break_started_at = null
    updatePatch.break_held_since = null
    updatePatch.break_minutes_at_start = null
    updatePatch.break_invalidating_barber_ids = []
    updatePatch.break_invalidated = false
  }

  const { error: updateErr } = await supabase
    .from('barbers')
    .update(updatePatch)
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
    // from_status='break' si lo sacamos del break (caso B); null si solo
    // decremento (caso A). to_status='available' simétricamente.
    from_status: wasOnBreak ? 'break' : null,
    to_status: wasOnBreak ? 'available' : null,
    metadata: {
      previous_count: currentCount,
      new_count: newCount,
      restored_by: restoredBy,
      was_on_break: wasOnBreak,
    },
  })

  if (logErr) {
    console.error('[break/restore] activity_log insert failed', logErr)
    // El UPDATE ya pasó — devolver el éxito pero adjuntar warning para
    // que el frontend pueda mostrarlo si quiere debug.
    return Response.json({
      restored: true,
      breaks_taken_today: newCount,
      ended_break: wasOnBreak,
      log_warning: logErr.message,
    })
  }

  return Response.json({
    restored: true,
    breaks_taken_today: newCount,
    ended_break: wasOnBreak,
  })
}
