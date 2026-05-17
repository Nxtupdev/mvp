import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import BarberManager from './BarberManager'

export default async function BarbersPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Pulling `name` too so the share-modal can pre-fill the WhatsApp
  // greeting with the shop's name ("este es tu panel en Fade Factory").
  const { data: shop } = await supabase
    .from('shops')
    .select('id, name')
    .eq('owner_id', user.id)
    .maybeSingle()
  if (!shop) redirect('/onboarding')

  const [{ data: barbers }, { data: shopAvatars }] = await Promise.all([
    supabase
      .from('barbers')
      .select('id, name, status, avatar, created_at')
      .eq('shop_id', shop.id)
      .order('created_at', { ascending: true }),
    // Wrapped in a try/catch-like pattern: if migration 015 isn't
    // applied yet the query just returns no rows (table missing) and
    // we fall through to an empty array — no shop-custom section
    // shown, generics still work.
    supabase
      .from('shop_avatars')
      .select('id, label, image_url, sort_order')
      .eq('shop_id', shop.id)
      .order('sort_order', { ascending: true }),
  ])

  return (
    <BarberManager
      shopId={shop.id}
      shopName={shop.name}
      initialBarbers={barbers ?? []}
      shopAvatars={shopAvatars ?? []}
    />
  )
}
