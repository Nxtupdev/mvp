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
  // Perfil del shop: alta Y sync en un solo evento (acuerdo 17-oct —
  // NXTUP es el dueño del cliente; Mamacita hace upsert por
  // nxtup_shop_id: si no existe lo CREA con los campos presentes).
  // Emisores: activación de Julie (perfil COMPLETO = el alta), guardado
  // de Configuración/Servicios (sync), webhook de billing (flag-only).
  // Contrato de AUSENCIA: un campo ausente significa "sin cambio",
  // nunca false/vacío — así el aviso de flag no pisa los servicios y
  // viceversa. En `hours`, un DÍA ausente = cerrado; el campo entero
  // ausente = sin cambio. Nota: usa `nxtup_shop_id` (no `shop_id`) —
  // así lo definió el contrato del lado Mamacita.
  | {
      event: 'shop_profile_updated'
      nxtup_shop_id: string
      name?: string
      address?: string
      timezone?: string
      hours?: Record<string, { open: string; close: string }>
      owner_whatsapp?: string
      services?: { name: string; price: number | null; duration_min?: number }[]
      julie_enabled?: boolean
    }

/**
 * Arma el evento shop_profile_updated COMPLETO de un shop: perfil
 * (name/address/timezone/hours/owner_whatsapp) + servicios activos, con
 * los campos vacíos AUSENTES (= "sin cambio" del lado Mamacita). El
 * horario se mapea del shape interno de la 062 ({enabled,start,end})
 * al del contrato ({open,close}, día ausente = cerrado); business_hours
 * null = campo hours ausente, no "todo cerrado". `extra` agrega
 * julie_enabled cuando el emisor es billing.
 */
export async function buildShopProfileEvent(
  shopId: string,
  extra?: { julie_enabled?: boolean },
): Promise<Extract<MamacitaEvent, { event: 'shop_profile_updated' }>> {
  // Import dinámico para no acoplar este lib (usado también por rutas
  // sin DB) al cliente admin en tiempo de carga.
  const { createAdminClient } = await import('@/lib/supabase/admin')
  const admin = createAdminClient()

  // address/owner_whatsapp en un select APARTE y fail-open: si la 078
  // no está corrida, falla solo esa query y el evento sale igual con
  // name/timezone/hours/services (esos campos simplemente ausentes).
  const [{ data: shop }, { data: extraCols }, { data: services }] = await Promise.all([
    admin
      .from('shops')
      .select('name, timezone, business_hours')
      .eq('id', shopId)
      .maybeSingle(),
    admin
      .from('shops')
      .select('address, owner_whatsapp')
      .eq('id', shopId)
      .maybeSingle(),
    admin
      .from('services')
      .select('name, price, duration_minutes')
      .eq('shop_id', shopId)
      .eq('active', true)
      .order('sort_order', { ascending: true }),
  ])

  type DayCfg = { enabled?: boolean; start?: string; end?: string }
  let hours: Record<string, { open: string; close: string }> | undefined
  const bh = (shop as { business_hours?: Record<string, DayCfg> | null } | null)
    ?.business_hours
  if (bh && typeof bh === 'object') {
    const out: Record<string, { open: string; close: string }> = {}
    for (const d of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      const c = bh[d]
      if (c?.enabled && c.start && c.end) out[d] = { open: c.start, close: c.end }
    }
    hours = out
  }

  const row = shop as { name?: string | null; timezone?: string | null } | null
  const extraRow = extraCols as {
    address?: string | null
    owner_whatsapp?: string | null
  } | null

  return {
    event: 'shop_profile_updated',
    nxtup_shop_id: shopId,
    ...(row?.name ? { name: row.name } : {}),
    ...(extraRow?.address ? { address: extraRow.address } : {}),
    ...(row?.timezone ? { timezone: row.timezone } : {}),
    ...(hours ? { hours } : {}),
    ...(extraRow?.owner_whatsapp ? { owner_whatsapp: extraRow.owner_whatsapp } : {}),
    services: (services ?? []).map(s => {
      const r = s as { name: string; price: number | null; duration_minutes: number | null }
      return {
        name: r.name,
        price: r.price ?? null,
        duration_min: r.duration_minutes ?? undefined,
      }
    }),
    ...(extra?.julie_enabled !== undefined ? { julie_enabled: extra.julie_enabled } : {}),
  }
}

/**
 * POST firmado (mismo HMAC x-nxtup-signature/x-nxtup-timestamp) a un
 * endpoint de Mamacita, DEVOLVIENDO la respuesta — para los flujos
 * request/response como el onboarding del número (buscar números
 * disponibles, pedir compra/porte), a diferencia de notifyMamacita que
 * es fire-and-forget. Lanza en timeout/red; el caller decide qué hacer.
 */
export async function signedMamacitaPost(
  url: string,
  payload: unknown,
  timeoutMs = 30000,
): Promise<{ status: number; body: unknown }> {
  const secret = getSecret()
  if (!secret) throw new Error('MAMACITA_SHARED_SECRET not configured')
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const signature = hmacHex(secret, `${timestamp}.${body}`)

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secret}`,
        'x-nxtup-signature': signature,
        'x-nxtup-timestamp': timestamp,
      },
      body,
      signal: controller.signal,
    })
    const resBody = await res.json().catch(() => null)
    return { status: res.status, body: resBody }
  } finally {
    clearTimeout(t)
  }
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
