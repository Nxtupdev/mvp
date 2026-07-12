import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import SensorManager from './SensorManager'

// POC de detección de salida — página interna del dueño para parear
// teléfonos y ver la divergencia ARP vs ICMP. Lee con service role
// (las tablas poc_ no tienen policies públicas de lectura). Descartable.
export default async function SensorPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: shop } = await admin
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  const shopId = (shop as { id: string }).id

  const [{ data: config }, { data: devices }, { data: summary }, { data: barbers }] =
    await Promise.all([
      admin.from('poc_sensor_config').select('token').eq('shop_id', shopId).maybeSingle(),
      admin
        .from('poc_sensor_devices')
        .select('id, label, ip, barber_id')
        .eq('shop_id', shopId)
        .order('created_at', { ascending: true }),
      admin.from('poc_sensor_summary').select('*').eq('shop_id', shopId),
      admin.from('barbers').select('id, name').eq('shop_id', shopId).order('name'),
    ])

  return (
    <SensorManager
      shopId={shopId}
      initialToken={(config as { token?: string } | null)?.token ?? null}
      initialDevices={devices ?? []}
      summary={summary ?? []}
      barbers={barbers ?? []}
    />
  )
}
