import type { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'

/**
 * Rate limiting por IP — CAPA APP-LEVEL (reglas de negocio + abuso casual).
 *
 * DB-backed, sin deps: bucket = `${scope}:${ip}:${ventana}`, contador
 * incrementado atómicamente vía la RPC `rate_limit_hit` (migración 057).
 * Ventana fija — cada ventana tiene su propio contador.
 *
 * FAIL-OPEN: si la RPC/DB falla, deja pasar (disponibilidad > límite —
 * un fallo del limitador no debe tumbar un check-in real).
 *
 * ⚠️ NO es protección de flood/DDoS a escala. Bajo flood real, cada
 * request cuesta un write + una conexión a Postgres aunque se rechace,
 * o sea el ataque aterriza en la DB. El escudo de flood a 1000 tiendas
 * va en el BORDE (Vercel Firewall/WAF o Cloudflare). Ver memoria:
 * nxtup-rate-limiting-scale.
 */
type RateLimitResult = { ok: boolean; count: number; retryAfter: number }

export async function checkRateLimit(
  request: NextRequest,
  scope: string,
  opts: { limit: number; windowSeconds: number },
): Promise<RateLimitResult> {
  const ip = getClientIp(request) ?? 'unknown'
  const nowSec = Math.floor(Date.now() / 1000)
  const windowId = Math.floor(nowSec / opts.windowSeconds)
  const bucket = `${scope}:${ip}:${windowId}`

  try {
    const admin = createAdminClient()
    const { data, error } = await admin.rpc('rate_limit_hit', { p_bucket: bucket })
    if (error) {
      console.error('[rate-limit] rpc error (fail-open):', error.message)
      return { ok: true, count: 0, retryAfter: 0 }
    }
    const count = typeof data === 'number' ? data : 0
    const ok = count <= opts.limit
    const retryAfter = ok ? 0 : opts.windowSeconds - (nowSec % opts.windowSeconds)
    return { ok, count, retryAfter }
  } catch (e) {
    console.error('[rate-limit] threw (fail-open):', e)
    return { ok: true, count: 0, retryAfter: 0 }
  }
}

/** Respuesta 429 estándar con Retry-After (segundos). */
export function rateLimited(retryAfter: number): Response {
  return Response.json(
    {
      error: 'Demasiadas solicitudes. Intenta de nuevo en un momento.',
      code: 'rate_limited',
    },
    {
      status: 429,
      headers: { 'Retry-After': String(Math.max(1, retryAfter)) },
    },
  )
}
