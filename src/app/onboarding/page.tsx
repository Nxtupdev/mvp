import { redirect } from 'next/navigation'
import Logo from '@/components/Logo'
import { createClient } from '@/lib/supabase/server'
import CreateShopForm from './CreateShopForm'

export const metadata = {
  title: 'Set up your shop — NXTUP',
}

export default async function OnboardingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: shop } = await supabase
    .from('shops')
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle()

  if (shop) redirect('/dashboard')

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <Logo className="h-10 w-auto mb-10" tone="dark" />
      <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-3 font-bold">
        First setup
      </p>
      <h1 className="text-4xl font-black tracking-tight mb-2 text-center">
        Create your shop
      </h1>
      <p className="text-nxtup-muted text-sm mb-10 text-center max-w-sm">
        Solo te tomará 30 segundos. Puedes editar todo después.
      </p>
      <CreateShopForm />
    </main>
  )
}
