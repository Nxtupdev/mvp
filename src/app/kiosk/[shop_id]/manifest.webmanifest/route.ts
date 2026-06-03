import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// ============================================================
// Manifest dinámico por shop para el kiosk.
//
// Cuando el dueño instala el kiosk vía "Add to Home Screen" (iOS) o
// "Install app" (Android Chrome), el icono del tablet abre DIRECTO
// /kiosk/[shop_id] — nunca cae en la home de marketing.
//
// Por qué dinámico: el manifest global de /manifest.webmanifest tiene
// start_url='/?source=pwa' que va a la landing. Si usáramos ese
// manifest para el kiosk, al tocar el icono se abriría la home en
// vez del kiosk. Este manifest tiene un start_url específico al shop.
//
// iOS ignora start_url del manifest (usa el URL en el que estaba
// cuando hicieron "Add to Home Screen"). Pero Android Chrome lo
// respeta estrictamente — sin este endpoint, la app instalada en
// Android terminaría en la landing.
//
// Cache moderado: el nombre del shop cambia raramente. 1h con
// stale-while-revalidate es seguro y rápido en CDN.
// ============================================================

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ shop_id: string }> },
) {
  const { shop_id } = await params
  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name')
    .eq('id', shop_id)
    .single()

  // short_name aparece debajo del icono en el home screen — máx 12
  // chars para que iOS no lo trunque feo. Tomamos la primera palabra
  // del nombre del shop como heurística decente.
  const shortName =
    shop?.name?.split(' ')[0]?.slice(0, 12) ?? 'Kiosk'
  const fullName = shop ? `NXTUP · ${shop.name}` : 'NXTUP Kiosk'

  return NextResponse.json(
    {
      name: fullName,
      short_name: shortName,
      description:
        'Check-in del shop. Toca para registrarte en la cola.',
      // Al lanzar la app, va directo al kiosk del shop correcto.
      start_url: `/kiosk/${shop_id}`,
      // Scope limita lo que se considera "dentro de la app". Si el
      // usuario navega afuera de /kiosk/[shop_id]/* (vía link, qr,
      // etc.) el browser abre Chrome normal en lugar de seguir
      // standalone. Evita que el kiosk derive a otras secciones.
      scope: `/kiosk/${shop_id}/`,
      display: 'standalone',
      orientation: 'portrait',
      background_color: '#0A0A0B',
      theme_color: '#000000',
      icons: [
        {
          src: '/icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any',
        },
        {
          src: '/icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable',
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/manifest+json',
        'Cache-Control':
          'public, max-age=3600, stale-while-revalidate=86400',
      },
    },
  )
}
