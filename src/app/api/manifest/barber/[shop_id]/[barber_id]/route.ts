import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * GET /api/manifest/barber/[shop_id]/[barber_id]
 *
 * Per-barber PWA manifest. The global manifest at /manifest.webmanifest
 * has `start_url: '/?source=pwa'`, which makes sense for the shop owner
 * (lands on dashboard) and prospects (lands on marketing). But when a
 * barber installs the PWA from THEIR dashboard, they want to land on
 * THEIR dashboard — not the public landing.
 *
 * By overriding `metadata.manifest` on the barber page to point at this
 * route, the installed icon registers with a start_url scoped to the
 * barber's own URL. iOS/Android then open the icon directly into the
 * dashboard, not the marketing site.
 *
 * iOS caveat: Safari snapshots the manifest at "Add to Home Screen"
 * time and never refreshes it. A barber who installed BEFORE this
 * route existed has to delete the icon and re-install once for the
 * new manifest to take effect. Future barbers get the right behavior
 * on first install.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ shop_id: string; barber_id: string }> },
) {
  const { shop_id, barber_id } = await params

  // Best-effort shop name lookup — used so the OS install prompt
  // shows "NXTUP — Fade Factory" instead of just "NXTUP". Falls back
  // silently if the shop doesn't exist (manifest still works, just
  // generic naming).
  const supabase = createAdminClient()
  const { data: shop } = await supabase
    .from('shops')
    .select('name')
    .eq('id', shop_id)
    .maybeSingle()

  const shopName = shop?.name ?? 'NXTUP'
  // Web manifest spec recommends short_name <= 12 chars for the home
  // screen label. Truncate gracefully so a long shop name still
  // produces a readable icon.
  const shortName = shopName.length <= 12 ? shopName : 'NXTUP'

  const manifest = {
    // Stable per-barber id so installing two different barber panels
    // on the same device produces TWO distinct apps instead of one
    // overwriting the other.
    id: `nxtup-barber-${barber_id}`,
    name: `NXTUP — ${shopName}`,
    short_name: shortName,
    description: `Panel del barbero en ${shopName}`,
    start_url: `/barber/${shop_id}/${barber_id}`,
    // Narrow scope to the barber's own URL tree. Anything outside
    // opens in the browser (e.g. kiosk link stays in scope, but a
    // future external link wouldn't trap them in the standalone view).
    scope: `/barber/${shop_id}/${barber_id}`,
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
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
  }

  return Response.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json',
      // Browsers refetch manifests rarely. A short browser cache plus
      // a longer edge cache keeps install responsive without trapping
      // users on a stale start_url for too long if we change anything.
      'Cache-Control': 'public, max-age=300, s-maxage=3600',
    },
  })
}
