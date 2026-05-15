import type { NextRequest } from 'next/server'

/**
 * Best-effort extraction of the client's public IP from a Next.js
 * request running behind Vercel's edge network.
 *
 * Vercel passes the real client address as the FIRST entry in
 * `x-forwarded-for`. Falls back to `x-real-ip` (some proxies set it).
 *
 * Returns null if neither header is present, which on Vercel basically
 * only happens during local development.
 */
export function getClientIp(request: NextRequest): string | null {
  const xff = request.headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  const xri = request.headers.get('x-real-ip')
  if (xri) return xri.trim()
  return null
}
