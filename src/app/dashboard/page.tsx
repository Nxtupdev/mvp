import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { canAccessAdminRoutes } from '@/lib/admin-auth'
import { getServerI18n } from '@/lib/i18n-server'
import DashboardLive from './DashboardLive'

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id, name, is_open, max_queue_size, logo_url, business_hours')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) {
    // Admins y socios no son dueños de shop — mandarlos a su panel
    // en vez de tirarlos al onboarding (que es para crear barbería).
    if (canAccessAdminRoutes(user.email)) redirect('/admin')
    redirect('/onboarding')
  }

  const [{ data: entries }, { data: barbers }] = await Promise.all([
    supabase
      .from('queue_entries')
      .select('id, position, client_name, status, barber_id, created_at')
      .eq('shop_id', shop.id)
      .in('status', ['waiting', 'called', 'in_progress'])
      .order('position', { ascending: true }),
    supabase
      .from('barbers')
      .select('id, name, status, avatar, available_since, break_held_since, break_started_at, break_minutes_at_start, break_invalidated, late_toll_remaining, sanctioned_until')
      .eq('shop_id', shop.id)
      .order('name'),
  ])

  const { t } = await getServerI18n()

  return (
    <>
      {/* Nudge de horario (062): visible hasta que el dueño lo configure.
          Decisión de producto: los horarios NO van en el onboarding (se
          mantiene mínimo — nombre + logo); se descubren aquí. */}
      {shop.business_hours == null && (
        <div className="print:hidden mx-auto mt-4 w-full max-w-5xl px-4 sm:px-6">
          <Link
            href="/dashboard/settings"
            className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.07] px-4 py-3 text-sm text-nxtup-muted transition-colors hover:bg-white/[0.06] hover:ring-white/[0.14] hover:text-white"
          >
            <span>⏰ {t('dash.hoursNudge')}</span>
            <span aria-hidden>→</span>
          </Link>
        </div>
      )}
      <DashboardLive
        shop={shop}
        initialEntries={entries ?? []}
        initialBarbers={barbers ?? []}
      />
    </>
  )
}
