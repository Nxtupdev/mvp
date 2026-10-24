import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import BarberHelpVideos from '@/components/BarberHelpVideos'
import BarberTabBar from '../BarberTabBar'

export const metadata = { title: 'Ayuda — NXTUP' }

/**
 * Pestaña Ayuda de la PWA del barbero: los mismos videos de
 * /ayuda/barbero, pero DENTRO del scope del manifest para que la app
 * instalada no abra la barra del navegador. Admin client porque la
 * página es anónima (grants por columna de la 069).
 */
export default async function BarberAyudaPage({
  params,
}: {
  params: Promise<{ shop_id: string; barber_id: string }>
}) {
  const { shop_id, barber_id } = await params
  const admin = createAdminClient()
  const [{ data: barber }, { data: shop }] = await Promise.all([
    admin.from('barbers').select('id').eq('id', barber_id).eq('shop_id', shop_id).maybeSingle(),
    admin.from('shops').select('tickets_enabled').eq('id', shop_id).maybeSingle(),
  ])
  if (!barber || !shop) notFound()

  return (
    <main className="min-h-[100dvh] max-w-md mx-auto w-full px-5 pt-[calc(2rem+env(safe-area-inset-top))] pb-[calc(6rem+env(safe-area-inset-bottom))]">
      <BarberHelpVideos />
      <BarberTabBar
        shopId={shop_id}
        barberId={barber_id}
        ticketsEnabled={Boolean((shop as { tickets_enabled?: boolean }).tickets_enabled)}
      />
    </main>
  )
}
