import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp } from '@/lib/client-ip'

/**
 * POST /api/barbers/[barber_id]/photo
 *
 * Sube la foto de perfil del barbero (multipart form-data, campo `file`)
 * y la deja como su avatar. Mismo modelo de "auth" que el PATCH de
 * avatar: UUID inadivinable + gate de WiFi del shop.
 *
 * El cliente ya manda la imagen recortada cuadrada y comprimida (canvas
 * en el teléfono), pero igual validamos tipo y tamaño server-side.
 *
 * Path en storage: {shop_id}/{barber_id}.jpg con upsert → UNA foto por
 * barbero (la nueva pisa la vieja, sin acumulación). El nombre siempre
 * es .jpg aunque llegue webp/png — el contentType real va en el objeto
 * y es lo que respeta el navegador; el nombre fijo es lo que permite el
 * upsert limpio.
 *
 * La URL guardada lleva ?v=timestamp para bustear el caché del CDN al
 * reemplazar la foto (misma técnica que el logo del shop).
 */

const MAX_BYTES = 3 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp']

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return Response.json({ error: 'Se esperaba multipart form-data' }, { status: 400 })
  }
  const file = form.get('file')
  if (!(file instanceof File)) {
    return Response.json({ error: 'Falta el archivo (campo "file")' }, { status: 400 })
  }
  if (!ALLOWED.includes(file.type)) {
    return Response.json(
      { error: 'Formato no soportado — usa JPG, PNG o WebP' },
      { status: 400 },
    )
  }
  if (file.size > MAX_BYTES) {
    return Response.json(
      { error: 'La foto pesa demasiado (máximo 3MB)' },
      { status: 400 },
    )
  }

  const supabase = createAdminClient()

  // Presence gate — mismo modelo que /avatar y /state.
  const { data: barber } = await supabase
    .from('barbers')
    .select('shop_id')
    .eq('id', barber_id)
    .single()
  if (!barber) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }
  const { data: shop } = await supabase
    .from('shops')
    .select('trusted_public_ip')
    .eq('id', barber.shop_id)
    .single()
  if (shop?.trusted_public_ip) {
    const clientIp = getClientIp(request)
    if (!clientIp || clientIp !== shop.trusted_public_ip) {
      return Response.json(
        {
          error: 'Conéctate al WiFi de la barbería para cambiar tu foto',
          code: 'not_in_shop',
        },
        { status: 403 },
      )
    }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const path = `${barber.shop_id}/${barber_id}.jpg`

  const { error: uploadErr } = await supabase.storage
    .from('barber-photos')
    .upload(path, bytes, { contentType: file.type, upsert: true })
  if (uploadErr) {
    console.error('[barbers/photo] upload failed:', uploadErr.message)
    return Response.json({ error: 'No se pudo subir la foto' }, { status: 500 })
  }

  const { data: pub } = supabase.storage.from('barber-photos').getPublicUrl(path)
  const avatarUrl = `${pub.publicUrl}?v=${Date.now()}`

  const { error: updateErr } = await supabase
    .from('barbers')
    .update({ avatar: avatarUrl })
    .eq('id', barber_id)
  if (updateErr) {
    console.error('[barbers/photo] avatar update failed:', updateErr.message)
    return Response.json({ error: 'Foto subida pero no se pudo activar' }, { status: 500 })
  }

  return Response.json({ ok: true, avatar: avatarUrl })
}
