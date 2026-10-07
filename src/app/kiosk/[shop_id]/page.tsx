import type { Metadata, Viewport } from 'next'
import { createClient } from '@/lib/supabase/server'
import { getShopAccess } from '@/lib/billing-access'
import { notFound } from 'next/navigation'
import { KioskApp } from './KioskApp'

// Metadata específico del kiosk — sobreescribe el del root layout.
// La key crítica es `manifest`: apunta al manifest dinámico de ESTE
// shop, no al global. Cuando el dueño instala como PWA, el icono del
// home screen lanza directo al kiosk del shop.
//
// appleWebApp.title controla el label que aparece debajo del icono
// en iOS — para distinguirlo del PWA del owner/barber dashboard.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ shop_id: string }>
}): Promise<Metadata> {
  const { shop_id } = await params
  return {
    manifest: `/kiosk/${shop_id}/manifest.webmanifest`,
    appleWebApp: {
      capable: true,
      title: 'NXTUP Kiosk',
      statusBarStyle: 'black-translucent',
    },
  }
}

/**
 * NXTUP Check-In Kiosk — Server entrypoint.
 *
 * Route: /kiosk/[shop_id]
 *
 * Loaded by the tablet mounted at the shop entrance, and also reachable
 * by customers scanning the QR code on their phone (responsive). The
 * canonical check-in surface — replaced the legacy /q/[shop_id] flow.
 *
 * Only shop metadata + the current waiting count are fetched here. All
 * subsequent state (selected language, phone, name, source) lives in
 * the client component KioskApp.
 *
 * Design spec: planning/design/checkin-kiosk-spec.md
 * Sample reference: planning/design/samples/splash-screen.tsx
 */

// Viewport específico del kiosk — sobreescribe el del root layout:
//   * maximumScale + userScalable=false: bloquea pinch-zoom (un cliente
//     curioso pellizcando rompe la UI del check-in).
//   * viewportFit cover: la UI cubre los notches del iPad/iPhone sin
//     dejar barras blancas.
//   * interactiveWidget=resizes-content: cuando aparece el teclado del
//     sistema (entrada de teléfono en modo phone, no kiosk), Safari
//     redimensiona el viewport en vez de cubrir contenido.
export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-content',
}

export default async function KioskPage({
  params,
}: {
  params: Promise<{ shop_id: string }>
}) {
  const { shop_id } = await params
  const supabase = await createClient()

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, is_open, max_queue_size, logo_url')
    .eq('id', shop_id)
    .single()

  if (!shop) notFound()

  // ── Puerta de cobro (074): sin suscripción ni prueba vigente, el
  // kiosko no toma clientes nuevos. Pantalla estática bilingüe (sin
  // selector de idioma — no hay flujo que seguir). El 402 del API de
  // check-in respalda esto para quien tenga la app vieja cacheada.
  const access = await getShopAccess(shop_id)
  if (!access.allowed) {
    return (
      <main className="min-h-dvh bg-[#0A0A0B] text-zinc-50 flex flex-col items-center justify-center px-8 text-center gap-6">
        {shop.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={shop.logo_url}
            alt={`${shop.name} logo`}
            className="h-20 w-20 object-contain opacity-90"
          />
        ) : null}
        <h1 className="text-3xl font-black tracking-tight">{shop.name}</h1>
        <div className="space-y-2">
          <p className="text-xl font-bold">El check-in digital está pausado</p>
          <p className="text-zinc-400">Pregunta en el mostrador para tomar tu turno.</p>
        </div>
        <div className="space-y-1 pt-5 border-t border-zinc-800 w-full max-w-sm">
          <p className="text-sm text-zinc-400">Digital check-in is paused.</p>
          <p className="text-sm text-zinc-500">Ask at the front desk to get in line.</p>
        </div>
      </main>
    )
  }

  // Just the count of people waiting — used by the persistent header.
  // (We used to also fetch the services catalog, but Frank cut service
  // capture from the kiosk to make check-in feel instant. The DB table
  // still exists for future use.)
  // select('id') y no '*': con los grants por columna de la 069, un '*'
  // anónimo expande a columnas revocadas (client_phone) y el count falla.
  const { count: waitingCount } = await supabase
    .from('queue_entries')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shop_id)
    .eq('status', 'waiting')

  // Barberos para el selector de citas (066). TODOS — la cita puede ser
  // con uno que aún no llegó (offline); su confirmación lo esperará.
  const { data: barbers } = await supabase
    .from('barbers')
    .select('id, name, avatar')
    .eq('shop_id', shop_id)
    .order('name')

  return (
    <KioskApp
      shop={shop}
      initialWaitingCount={waitingCount ?? 0}
      barbers={barbers ?? []}
    />
  )
}
