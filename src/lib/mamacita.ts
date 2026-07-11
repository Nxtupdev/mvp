import crypto from 'node:crypto'

/**
 * Shared helpers for the Mamacita ↔ NXTUP integration.
 *
 * Mamacita (separate repo: C:\Users\frami\Proyectos\mamacita) is a voice
 * agent that answers the shop's phone. It calls into NXTUP to read live
 * availability and to push a caller into the queue, and NXTUP calls back
 * to Mamacita when a caller's turn is near.
 *
 * Auth model (pilot: single shared secret):
 *   - Env var MAMACITA_SHARED_SECRET is the same string on both sides.
 *   - Inbound Mamacita → NXTUP:
 *       GET  endpoints: Authorization: Bearer <secret>
 *       POST endpoints: Bearer + HMAC over `${timestamp}.${rawBody}`
 *                       in x-mamacita-signature (hex) + x-mamacita-timestamp.
 *   - Outbound NXTUP → Mamacita: same HMAC scheme, headers
 *       x-nxtup-signature + x-nxtup-timestamp.
 *
 * When this grows past the pilot (marketplace, many shops), move the
 * secret from a global env var into a per-shop column and look it up by
 * shop_id. The wire format stays identical.
 *
 * Contract: planning/integration/mamacita-nxtup-integration.md
 *           and mamacita repo planning/integration/api-contract.md
 */

const REPLAY_WINDOW_SECONDS = 300 // 5 minutes

function getSecret(): string | null {
  return process.env.MAMACITA_SHARED_SECRET ?? null
}

function hmacHex(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex')
}

function safeEqualHex(a: string, b: string): boolean {
  // timingSafeEqual throws if lengths differ — guard first.
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch {
    return false
  }
}

/** Bearer-only check for GET endpoints. Returns true if authorized. */
export function verifyMamacitaBearer(request: Request): boolean {
  const secret = getSecret()
  if (!secret) {
    console.error('[mamacita] MAMACITA_SHARED_SECRET not configured')
    return false
  }
  const auth = request.headers.get('authorization') ?? ''
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : auth
  if (token.length !== secret.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(secret))
  } catch {
    return false
  }
}

/**
 * Bearer + HMAC check for POST endpoints. Pass the RAW request body
 * string (read it once with request.text(), then JSON.parse it yourself).
 * Verifies the signature and the 5-minute replay window.
 */
export function verifyMamacitaSignature(request: Request, rawBody: string): boolean {
  if (!verifyMamacitaBearer(request)) return false
  const secret = getSecret()!

  const signature = request.headers.get('x-mamacita-signature') ?? ''
  const timestamp = request.headers.get('x-mamacita-timestamp') ?? ''
  const ts = parseInt(timestamp, 10)
  if (!ts || Math.abs(Math.floor(Date.now() / 1000) - ts) > REPLAY_WINDOW_SECONDS) {
    return false
  }
  const expected = hmacHex(secret, `${timestamp}.${rawBody}`)
  return safeEqualHex(signature, expected)
}

type MamacitaEvent =
  | { event: 'turn_approaching'; external_id: string; shop_id: string; position?: number; eta_minutes?: number }
  | { event: 'entry_completed'; external_id: string; shop_id: string }
  | { event: 'entry_no_show'; external_id: string; shop_id: string }
  // Perfil del shop (servicios + precios) cambió — el dueño lo editó en
  // NXTUP. Mamacita lo formatea a services_text para que Julie cite
  // precios por voz. Nota: usa `nxtup_shop_id` (no `shop_id`) — así lo
  // definió el contrato del lado Mamacita para este evento.
  | {
      event: 'shop_profile_updated'
      nxtup_shop_id: string
      services: { name: string; price: number | null; duration_min?: number }[]
    }

/**
 * Fire a signed webhook to Mamacita's nxtup-events function. Best-effort:
 * logs and swallows errors so a Mamacita outage never breaks NXTUP's own
 * queue flow. `shop_id` in the payload must be the NXTUP shop UUID (that's
 * what Mamacita stored as nxtup_shop_id and looks up by).
 *
 * Requires env: MAMACITA_WEBHOOK_URL (Mamacita's nxtup-events URL),
 * MAMACITA_SHARED_SECRET.
 */
export async function notifyMamacita(payload: MamacitaEvent): Promise<void> {
  const url = process.env.MAMACITA_WEBHOOK_URL
  const secret = getSecret()
  if (!url || !secret) {
    console.error('[mamacita] notify skipped — MAMACITA_WEBHOOK_URL or secret missing')
    return
  }
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = hmacHex(secret, `${timestamp}.${body}`)

  try {
    const controller = new AbortController()
    const t = setTimeout(() => controller.abort(), 3000)
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-nxtup-signature': signature,
        'x-nxtup-timestamp': timestamp,
      },
      body,
      signal: controller.signal,
    })
    clearTimeout(t)
    if (!res.ok) {
      console.error(`[mamacita] notify ${payload.event} returned ${res.status}`)
    }
  } catch (err) {
    console.error(`[mamacita] notify ${payload.event} failed:`, err)
  }
}
