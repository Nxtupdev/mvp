import Logo from '@/components/Logo'
import SignupForm from './SignupForm'

export const metadata = {
  title: 'Create account — NXTUP',
}

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <Logo className="h-12 w-auto mb-12" tone="dark" />
      <SignupForm next={next} />
    </main>
  )
}
