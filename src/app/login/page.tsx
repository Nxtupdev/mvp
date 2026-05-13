import Logo from '@/components/Logo'
import LoginForm from './LoginForm'

export const metadata = {
  title: 'Sign in — NXTUP',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; detail?: string }>
}) {
  const { next, error, detail } = await searchParams
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <Logo className="h-12 w-auto mb-12" tone="dark" />
      <LoginForm next={next} initialError={error} detail={detail} />
    </main>
  )
}
