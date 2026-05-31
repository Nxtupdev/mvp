import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Valida el header `x-panel-token` contra la tabla shop_control_tokens.
 *
 * Devuelve el shop_id si el token es válido, NULL si no.
 * Usa el admin client porque el caller no está autenticado por cookie —
 * el token EN SÍ es la autenticación. La función SQL `validate_panel_token`
 * es SECURITY DEFINER, así que solo lee el token y devuelve shop_id sin
 * exponer otras filas.
 *
 * El llamador es responsable de chequear que el shop_id devuelto sea
 * el correcto para el recurso accedido (ej. en barbers/state: que el
 * barber.shop_id === tokenShopId). Sin ese check, un token del shop A
 * podría modificar barberos del shop B.
 */
export async function validatePanelToken(
  request: NextRequest,
): Promise<string | null> {
  const token = request.headers.get('x-panel-token')
  if (!token) return null

  const admin = createAdminClient()
  const { data, error } = await admin.rpc('validate_panel_token', {
    p_token: token,
  })
  if (error) {
    console.error('[panel-token] validate RPC failed', error)
    return null
  }
  // RPC devuelve uuid o null. Tipos de supabase-js lo devuelven como
  // string|null en este caso porque no es un SETOF.
  return (data as string | null) ?? null
}

/**
 * Server-side helper para validar un token directamente por valor (no
 * desde un header). Usado por la página /panel/[shop_id] que recibe el
 * token vía query param `?t=...`.
 */
export async function validatePanelTokenValue(
  token: string | null | undefined,
): Promise<string | null> {
  if (!token) return null
  const admin = createAdminClient()
  const { data, error } = await admin.rpc('validate_panel_token', {
    p_token: token,
  })
  if (error) {
    console.error('[panel-token] validate-value RPC failed', error)
    return null
  }
  return (data as string | null) ?? null
}
