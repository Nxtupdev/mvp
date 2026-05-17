import { redirect } from 'next/navigation'
import Link from 'next/link'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/server'
import { InstallButton } from '@/components/InstallButton'
import DashboardNav from './DashboardNav'

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
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (!shop) redirect('/onboarding')

  return (
    <div className="min-h-screen flex flex-col">
      {/* PWA install banner — auto-hides once installed or when the
          browser doesn't support PWA install. Sits above the header
          so it's the first thing iPhone owners see on the dashboard. */}
      <InstallButton variant="banner" />

      <header className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-nxtup-line gap-4">
        <Link href="/dashboard" className="flex items-center gap-3 sm:gap-4 min-w-0">
          <Logo className="h-7 w-auto flex-shrink-0" tone="dark" />
          <span className="text-nxtup-dim hidden sm:inline">·</span>
          <span className="text-nxtup-muted hidden sm:inline truncate">
            {shop.name}
          </span>
        </Link>

        <DashboardNav />
      </header>

      {children}
    </div>
  )
}
