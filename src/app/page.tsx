import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Landing from './_landing/Landing'

// ============================================================
// Public homepage.
//
// Two arrivals to handle:
//
//   1. Regular browser visit to getnxtup.com → render the marketing
//      landing. Always — even if the user is logged in — because
//      owners commonly share the URL or come back to copy a link.
//
//   2. PWA launch from the installed home-screen icon → the manifest's
//      start_url is `/?source=pwa`, so we recognise it and skip the
//      marketing pitch: authed users go straight to their dashboard,
//      anonymous users still see the landing so they can sign up /
//      log in from the icon.
// ============================================================

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ source?: string }>
}) {
  const params = await searchParams
  const fromPWA = params.source === 'pwa'

  if (fromPWA) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (user) {
      // Authed shop owner — `/dashboard` will itself bounce them to
      // `/onboarding` if they haven't created their shop yet, so we
      // don't need to special-case that here.
      redirect('/dashboard')
    }
    // Anonymous PWA launch falls through to the landing so they can
    // log in or sign up. The locale toggle and CTA are right there.
  }

  return <Landing />
}
