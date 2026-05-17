import type { MetadataRoute } from 'next'

// ============================================================
// PWA Web App Manifest.
//
// This file is what makes NXTUP installable as a "real app":
//   * Android Chrome shows an "Install NXTUP" prompt / address-bar icon
//   * Desktop Chrome/Edge show an install button next to the lock icon
//   * iOS Safari "Add to Home Screen" uses these settings for the icon
//     label + standalone launch experience
//
// Why standalone display? Owners and barbers will tap the dashboard
// dozens of times during a shift. Hiding the browser chrome makes it
// feel like a native app and prevents accidental URL-bar typing.
// ============================================================

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'NXTUP — Walk-in queue',
    short_name: 'NXTUP',
    description:
      'The next-up system for barbershops. No arguments. No confusion. No lost turns.',
    // The `?source=pwa` marker lets the server-side landing distinguish
    // "user tapped the installed icon on their home screen" from
    // "regular browser visit." On PWA launches we send authed users
    // straight to their dashboard; on browser visits we always show
    // the marketing landing (so owners can still share the URL).
    start_url: '/?source=pwa',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#000000',
    theme_color: '#000000',
    // Chrome refuses to use an icon whose declared `sizes` don't match
    // the actual PNG dimensions — so we ship pre-sized assets from
    // /public/ instead of pointing every entry at the 500×500 master.
    // The 192 and 512 sizes together satisfy Chrome/Android's
    // installability criteria.
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
        // Lets Android put the icon inside any shape (circle, squircle,
        // etc.) without cropping important pixels — assumes our logo
        // has comfortable padding around the mark.
        purpose: 'maskable',
      },
    ],
  }
}
