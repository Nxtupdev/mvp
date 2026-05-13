'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const ERROR_MESSAGES: Record<string, string> = {
  invalid: 'El link expiró o no es válido. Solicita uno nuevo.',
}

type Mode = 'password' | 'magic'

export default function LoginForm({
  next,
  initialError,
  detail,
}: {
  next?: string
  initialError?: string
  detail?: string
}) {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('password')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [stage, setStage] = useState<'form' | 'sending' | 'sent'>('form')
  const [error, setError] = useState(
    initialError ? (ERROR_MESSAGES[initialError] ?? '') : '',
  )
  const [debug, setDebug] = useState(detail ?? '')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (stage === 'sending') return
    setStage('sending')
    setError('')
    setDebug('')

    const supabase = createClient()

    if (mode === 'password') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setStage('form')
      } else {
        router.push(next ?? '/dashboard')
        router.refresh()
      }
      return
    }

    // Magic link
    const params = new URLSearchParams()
    if (next) params.set('next', next)
    const redirectTo = `${window.location.origin}/auth/confirm${
      params.toString() ? '?' + params.toString() : ''
    }`

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    })

    if (error) {
      setError(error.message)
      setStage('form')
    } else {
      setStage('sent')
    }
  }

  if (stage === 'sent') {
    return (
      <div className="w-full max-w-sm text-center">
        <p className="text-nxtup-active text-xs uppercase tracking-[0.3em] mb-3 font-bold">
          Check your email
        </p>
        <h1 className="text-3xl font-black mb-3">Magic link sent</h1>
        <p className="text-nxtup-muted leading-relaxed">
          Enviamos un link de acceso a{' '}
          <span className="text-white font-medium">{email}</span>. Ábrelo en este
          dispositivo.
        </p>
        <button
          onClick={() => {
            setStage('form')
            setMode('password')
          }}
          className="mt-8 text-nxtup-muted hover:text-white text-sm underline underline-offset-4 transition-colors"
        >
          Back to sign in
        </button>
      </div>
    )
  }

  const ctaLabel =
    stage === 'sending'
      ? mode === 'password'
        ? 'Signing in...'
        : 'Enviando...'
      : mode === 'password'
        ? 'Sign in'
        : 'Send magic link'

  const submitDisabled =
    stage === 'sending' ||
    !email.includes('@') ||
    (mode === 'password' && password.length < 6)

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-3 font-bold">
        Owner sign in
      </p>
      <h1 className="text-3xl font-black mb-8 tracking-tight">Welcome back</h1>

      <label className="text-nxtup-muted text-xs uppercase tracking-widest block mb-2">
        Email
      </label>
      <input
        required
        type="email"
        value={email}
        onChange={e => setEmail(e.target.value)}
        placeholder="you@yourshop.com"
        autoComplete="email"
        className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim mb-4"
      />

      {mode === 'password' && (
        <>
          <label className="text-nxtup-muted text-xs uppercase tracking-widest block mb-2">
            Password
          </label>
          <input
            required
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            minLength={6}
            className="w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border border-nxtup-dim focus:border-white focus:outline-none placeholder:text-nxtup-dim mb-4"
          />
        </>
      )}

      {error && (
        <div className="mb-4">
          <p className="text-nxtup-busy text-sm">{error}</p>
          {debug && (
            <p className="text-nxtup-dim text-xs mt-1 font-mono break-all">
              {debug}
            </p>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full bg-white text-black font-semibold py-4 rounded-lg disabled:opacity-40 transition-all active:scale-[0.98]"
      >
        {ctaLabel}
      </button>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'password' ? 'magic' : 'password')
          setError('')
          setDebug('')
        }}
        className="w-full mt-4 text-nxtup-muted hover:text-white text-sm underline underline-offset-4 transition-colors"
      >
        {mode === 'password'
          ? 'Use email link instead'
          : 'Use password instead'}
      </button>

      <p className="text-nxtup-dim text-xs mt-6 text-center leading-relaxed">
        ¿No tienes cuenta?{' '}
        <Link
          href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`}
          className="text-nxtup-muted hover:text-white underline underline-offset-4"
        >
          Regístrate
        </Link>
      </p>
    </form>
  )
}
