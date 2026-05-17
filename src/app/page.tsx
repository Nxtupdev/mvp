import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import Landing from './_landing/Landing'

// ============================================================
// Public homepage.
//
// Three arrivals to handle:
//
//   1. Regular browser visit to getnxtup.com → render the marketing
//      landing. Always — even if the user is logged in — because
//      owners commonly share the URL or come back to copy a link.
//
//   2. PWA launch from the installed home-screen icon, authed user →
//      send straight to /dashboard. Recognised via `?source=pwa`
//      (set as the manifest's start_url) plus a valid session.
//
//   3. PWA launch from the installed home-screen icon, unauthed BUT
//      this device previously visited a barber dashboard → bounce to
//      that barber URL. This is the mis-install recovery path: when
//      a barber accidentally installs from the public landing
//      instead of from their own dashboard, their icon lands here.
//      The barber dashboard sets a 30-day cookie precisely so we can
//      catch them and redirect.
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

    // Anonymous PWA launch — check if this device knows about a
    // barber URL from a previous visit. If so, this is almost
    // certainly a barber whose icon points at the wrong place.
    const cookieStore = await cookies()
    const rawBarberUrl = cookieStore.get('nxtup_last_barber_url')?.value
    if (rawBarberUrl) {
      try {
        const decoded = decodeURIComponent(rawBarberUrl)
        // Defensive: only follow if it really looks like a barber URL
        // on our own origin, so a stale or maliciously-set cookie
        // can't redirect users off-site. A simple prefix check is
        // enough because cookies are origin-scoped already.
        if (decoded.startsWith('/barber/')) {
          redirect(decoded)
        }
      } catch {
        // ignore — fall through to landing
      }
    }
    // No cookie, no session: fall through to the landing so they can
    // log in or sign up. The locale toggle and CTA are right there.
  }

  return <Landing />
}
