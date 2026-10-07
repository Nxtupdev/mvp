import { redirect } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/server'
import { getServerI18n } from '@/lib/i18n-server'
import { getShopAccess } from '@/lib/billing-access'
import { canAccessAdminRoutes } from '@/lib/admin-auth'
import { InstallButton } from '@/components/InstallButton'
import DashboardNav from './DashboardNav'
import MobileTabBar from './MobileTabBar'
import ResetDemoButton from './ResetDemoButton'
import { isDemoOwner } from '@/lib/demo'

export const metadata = {
  title: 'Dashboard — NXTUP',
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, timezone')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!shop) {
    // Admins y socios no son dueños de shop — mandarlos a /admin en
    // vez del onboarding (que es para crear barbería). Sin este check,
    // un socio recién logueado caería en el flujo de creación de shop.
    if (canAccessAdminRoutes(user.email)) redirect('/admin')
    redirect('/onboarding')
  }

  // Puerta de cobro (074): el banner avisa en TODO el dashboard. En
  // prueba → cuenta regresiva ámbar; bloqueado → aviso rojo. Con
  // suscripción activa (o comp/contract, como el demo) no hay banner.
  const { locale, t } = await getServerI18n()
  const access = await getShopAccess(shop.id)
  const trialEndLabel = access.trialEndsAt
    ? new Date(access.trialEndsAt).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'long',
        timeZone: shop.timezone ?? 'America/New_York',
      })
    : null

  return (
    // pt-safe: el PWA usa status bar black-translucent + viewportFit
    // cover, así que el contenido se dibuja DEBAJO del reloj/notch del
    // iPhone — el primer elemento (banner de billing o header) quedaba
    // solapado. En navegador normal el inset es 0 y no cambia nada.
    <div className="min-h-screen flex flex-col pt-[env(safe-area-inset-top)]">
      {/* PWA install banner — auto-hides once installed or when the
          browser doesn't support PWA install. Sits above the header
          so it's the first thing iPhone owners see on the dashboard.
          `print:hidden` lo excluye del PDF de /dashboard/stats. */}
      <div className="print:hidden">
        <InstallButton variant="banner" />
      </div>

      {!access.allowed && (
        <div className="print:hidden bg-nxtup-busy/15 border-b border-nxtup-busy/30 px-4 sm:px-6 py-2.5 text-sm">
          <span className="font-bold text-nxtup-busy">
            {t('billing.banner.blockedTitle')}
          </span>{' '}
          <span className="text-nxtup-muted">{t('billing.banner.blockedBody')}</span>{' '}
          <Link
            href="/dashboard/billing"
            className="font-bold underline underline-offset-2"
          >
            {t('billing.banner.reactivate')}
          </Link>
        </div>
      )}
      {access.allowed && access.reason === 'trial' && trialEndLabel && (
        <div className="print:hidden bg-nxtup-break/15 border-b border-nxtup-break/30 px-4 sm:px-6 py-2.5 text-sm">
          <span className="text-nxtup-muted">
            {t('billing.banner.trialPre')}{' '}
            <span className="font-bold text-nxtup-break">{trialEndLabel}</span>.
          </span>{' '}
          <Link
            href="/dashboard/billing"
            className="font-bold underline underline-offset-2"
          >
            {t('billing.queue.cta')}
          </Link>
        </div>
      )}

      <header className="print:hidden flex items-center justify-between px-4 sm:px-6 py-4 border-b border-nxtup-line gap-4">
        <Link href="/dashboard" className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Logo className="h-7 w-auto flex-shrink-0" tone="dark" />
          <span className="text-nxtup-dim hidden sm:inline">·</span>
          <span className="text-nxtup-muted hidden sm:inline truncate">
            {shop.name}
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {isDemoOwner(user.email) && <ResetDemoButton />}
          <DashboardNav />
        </div>
      </header>

      {/* Bottom padding only on mobile to clear the fixed MobileTabBar.
          ~5rem covers the bar (tabs + safe-area inset for iPhone home
          indicator). md+ uses zero because the desktop nav lives in
          the top header. */}
      <div className="flex-1 flex flex-col pb-20 md:pb-0">
        {children}
      </div>

      {/* Fixed bottom tab bar — only renders on mobile via internal
          md:hidden. Keeps the dashboard feeling like a real installed
          app rather than a wrapped webpage. `print:hidden` lo excluye
          del PDF de /dashboard/stats cuando el dueño imprime desde móvil. */}
      <div className="print:hidden">
        <MobileTabBar />
      </div>
    </div>
  )
}
