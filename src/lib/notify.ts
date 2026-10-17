import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Notificaciones al CLIENTE por SMS / WhatsApp (Twilio).
 *
 * Dos eventos, dos momentos:
 *   * checkin_confirmed — al terminar el check-in del kiosko: posición
 *     en cola + espera estimada. Le da al cliente un registro persistente
 *     para poder salir de la barbería mientras espera.
 *   * barber_ready — cuando un barbero que se libera reclama su entrada
 *     (status → 'called' en /api/barbers/[id]/state). NO se envía en el
 *     match inmediato del kiosko: ahí el cliente está parado frente a la
 *     pantalla de éxito viéndolo en vivo.
 *
 * Canal único elegido por env (sin fallback automático en v1):
 *   NOTIFY_CHANNEL = 'off' | 'sms' | 'whatsapp'   (ausente = off)
 *
 * Credenciales / remitentes:
 *   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
 *   TWILIO_SMS_FROM       = +1800...            (canal sms)
 *   TWILIO_WHATSAPP_FROM  = whatsapp:+1...      (canal whatsapp)
 *
 * WhatsApp exige plantillas pre-aprobadas por Meta (Twilio Content API).
 * Un Content SID por mensaje × idioma, variables POSICIONALES — el orden
 * aquí es el contrato con las plantillas registradas en Twilio:
 *   TWILIO_CONTENT_CONFIRM_ES / TWILIO_CONTENT_CONFIRM_EN
 *     {{1}}=nombre {{2}}=shop {{3}}=posición {{4}}=espera ("6-10")
 *   TWILIO_CONTENT_READY_ES / TWILIO_CONTENT_READY_EN
 *     {{1}}=nombre {{2}}=barbero {{3}}=shop
 *
 * Los textos SMS replican los samples registrados en la verificación
 * toll-free (marca NXTUP + STOP/HELP) — si cambian aquí, el registro de
 * Twilio debe seguir siendo representativo. El opt-out STOP lo maneja
 * Twilio (Advanced Opt-Out): un envío a un número que respondió STOP
 * falla con 21610 y aquí se traga como cualquier otro error.
 *
 * Mejor esfuerzo SIEMPRE: cualquier fallo (envío, lookup, config
 * ausente) se loguea y se traga — una notificación jamás rompe un
 * check-in ni una transición de barbero. Mismo modelo que notifyMamacita.
 */

type Lang = 'es' | 'en'

type Channel = 'sms' | 'whatsapp'

function getChannel(): Channel | null {
  const raw = process.env.NOTIFY_CHANNEL
  if (raw === 'sms' || raw === 'whatsapp') return raw
  return null
}

/** 10 dígitos guardados en la DB → E.164. Devuelve null si no es usable. */
function toE164(phone: string): string | null {
  const digits = String(phone).replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return null
}

function normalizeLang(raw: unknown): Lang {
  return raw === 'en' ? 'en' : 'es'
}

/**
 * POST crudo al Messages endpoint de Twilio (sin SDK — una sola llamada
 * form-encoded no justifica la dependencia). `params` ya trae To/From y
 * Body (SMS) o ContentSid+ContentVariables (WhatsApp).
 */
async function twilioSend(params: Record<string, string>): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  if (!sid || !token) {
    console.error('[notify] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing')
    return
  }

  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(params).toString(),
        signal: controller.signal,
      },
    )
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      console.error(`[notify] twilio send failed ${res.status}`, detail.slice(0, 300))
    }
  } catch (err) {
    console.error('[notify] twilio send error', err)
  } finally {
    clearTimeout(t)
  }
}

/**
 * Despacha un mensaje por el canal configurado. `smsBody` es el texto
 * libre del SMS; `contentSid` + `variables` son la plantilla WhatsApp.
 */
async function dispatch(opts: {
  to: string
  smsBody: string
  contentSid: string | undefined
  variables: Record<string, string>
}): Promise<void> {
  const channel = getChannel()
  if (!channel) return

  if (channel === 'sms') {
    const from = process.env.TWILIO_SMS_FROM
    if (!from) {
      console.error('[notify] NOTIFY_CHANNEL=sms pero falta TWILIO_SMS_FROM')
      return
    }
    await twilioSend({ To: opts.to, From: from, Body: opts.smsBody })
    return
  }

  const from = process.env.TWILIO_WHATSAPP_FROM
  if (!from || !opts.contentSid) {
    console.error('[notify] NOTIFY_CHANNEL=whatsapp pero falta TWILIO_WHATSAPP_FROM o el Content SID')
    return
  }
  await twilioSend({
    To: `whatsapp:${opts.to}`,
    From: from,
    ContentSid: opts.contentSid,
    ContentVariables: JSON.stringify(opts.variables),
  })
}

/**
 * Confirmación de check-in. El caller (kiosk/checkin) ya tiene todos los
 * datos calculados — aquí no se consulta la DB.
 */
export async function notifyCheckinConfirmed(opts: {
  phone: string
  lang: Lang
  name: string
  shopName: string
  position: number
  etaMin: number
  etaMax: number
}): Promise<void> {
  try {
    if (!getChannel()) return
    const to = toE164(opts.phone)
    if (!to) return

    const wait = `${opts.etaMin}-${opts.etaMax}`
    const smsBody =
      opts.lang === 'en'
        ? `NXTUP: Hi ${opts.name}! Your spot at ${opts.shopName} is confirmed. You're #${opts.position} in line. Approx. wait ${wait} min. Reply HELP for help, STOP to opt out.`
        : `NXTUP: ¡Hola ${opts.name}! Tu lugar en ${opts.shopName} está confirmado. Eres el #${opts.position} en la fila. Espera aprox. ${wait} min. Responde HELP para ayuda, STOP para cancelar.`

    await dispatch({
      to,
      smsBody,
      contentSid:
        opts.lang === 'en'
          ? process.env.TWILIO_CONTENT_CONFIRM_EN
          : process.env.TWILIO_CONTENT_CONFIRM_ES,
      variables: {
        '1': opts.name,
        '2': opts.shopName,
        '3': String(opts.position),
        '4': wait,
      },
    })
  } catch (err) {
    console.error('[notify] checkin_confirmed failed', err)
  }
}

/**
 * "Tu barbero está listo". El caller (ruta de estado del barbero) solo
 * tiene id/nombre de la entrada — el teléfono, el idioma del cliente y
 * el nombre del shop se buscan aquí.
 */
export async function notifyBarberReady(opts: {
  entryId: string
  barberName: string
  shopId: string
}): Promise<void> {
  try {
    if (!getChannel()) return
    const supabase = createAdminClient()

    const [{ data: entry }, { data: shop }] = await Promise.all([
      supabase
        .from('queue_entries')
        .select('client_phone, client_name, client_id')
        .eq('id', opts.entryId)
        .single(),
      supabase.from('shops').select('name').eq('id', opts.shopId).single(),
    ])
    if (!entry?.client_phone || !shop?.name) return

    const to = toE164(entry.client_phone)
    if (!to) return

    let lang: Lang = 'es'
    if (entry.client_id) {
      const { data: client } = await supabase
        .from('clients')
        .select('preferred_language')
        .eq('id', entry.client_id)
        .maybeSingle()
      lang = normalizeLang(client?.preferred_language)
    }

    const name = entry.client_name ?? ''
    const smsBody =
      lang === 'en'
        ? `NXTUP: ${name}, your barber ${opts.barberName} is ready! Please come in. - ${shop.name} via NXTUP. Reply STOP to opt out.`
        : `NXTUP: ${name}, ¡tu barbero ${opts.barberName} está listo! Pasa adentro. - ${shop.name} vía NXTUP. Responde STOP para cancelar.`

    await dispatch({
      to,
      smsBody,
      contentSid:
        lang === 'en'
          ? process.env.TWILIO_CONTENT_READY_EN
          : process.env.TWILIO_CONTENT_READY_ES,
      variables: { '1': name, '2': opts.barberName, '3': shop.name },
    })
  } catch (err) {
    console.error('[notify] barber_ready failed', err)
  }
}
