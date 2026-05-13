'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupForm({ next }: { next?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [stage, setStage] = useState<'form' | 'sending' | 'check-email'>('form')
  const [error, setError] = useState('')

  const passwordMismatch =
    confirm.length > 0 && confirm !== password && password.length > 0
  const passwordTooShort = password.length > 0 && password.length < 6

  const submitDisabled =
    stage === 'sending' ||
    !email.includes('@') ||
    password.length < 6 ||
    password !== confirm

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (submitDisabled) return
    setStage('sending')
    setError('')

    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(translateError(error.message))
      setStage('form')
      return
    }

    // If "Confirm email" is OFF in Supabase, signUp returns a session immediately.
    // If it's ON, session is null and we need the user to click the email link.
    if (data.session) {
      router.push(next ?? '/dashboard')
      router.refresh()
    } else {
      setStage('check-email')
    }
  }

  if (stage === 'check-email') {
    return (
      <div className="w-full max-w-sm text-center">
        <p className="text-nxtup-active text-xs uppercase tracking-[0.3em] mb-3 font-bold">
          Cuenta creada
        </p>
        <h1 className="text-3xl font-black mb-3">Revisa tu email</h1>
        <p className="text-nxtup-muted leading-relaxed">
          Te enviamos un link a <span className="text-white font-medium">{email}</span>{' '}
          para confirmar tu cuenta. Después podrás iniciar sesión.
        </p>
        <p className="text-nxtup-dim text-xs mt-6 leading-relaxed">
          Si no quieres confirmación por email, desactiva &ldquo;Confirm email&rdquo; en
          Supabase → Authentication → Providers → Email.
        </p>
        <Link
          href="/login"
          className="mt-8 inline-block text-nxtup-muted hover:text-white text-sm underline underline-offset-4 transition-colors"
        >
          Volver al login
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm">
      <p className="text-nxtup-muted text-xs uppercase tracking-[0.3em] mb-3 font-bold">
        Owner sign up
      </p>
      <h1 className="text-3xl font-black mb-8 tracking-tight">Crea tu cuenta</h1>

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

      <label className="text-nxtup-muted text-xs uppercase tracking-widest block mb-2">
        Password
      </label>
      <input
        required
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="Mínimo 6 caracteres"
        autoComplete="new-password"
        minLength={6}
        className={`
          w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border focus:outline-none placeholder:text-nxtup-dim mb-1
          ${passwordTooShort ? 'border-nxtup-busy/60' : 'border-nxtup-dim focus:border-white'}
        `}
      />
      {passwordTooShort && (
        <p className="text-nxtup-busy text-xs mb-3">Mínimo 6 caracteres</p>
      )}
      {!passwordTooShort && <div className="mb-3" />}

      <label className="text-nxtup-muted text-xs uppercase tracking-widest block mb-2">
        Confirm password
      </label>
      <input
        required
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        placeholder="Repite la password"
        autoComplete="new-password"
        minLength={6}
        className={`
          w-full bg-nxtup-line text-white rounded-lg px-4 py-3 border focus:outline-none placeholder:text-nxtup-dim mb-1
          ${passwordMismatch ? 'border-nxtup-busy/60' : 'border-nxtup-dim focus:border-white'}
        `}
      />
      {passwordMismatch && (
        <p className="text-nxtup-busy text-xs mb-3">Las passwords no coinciden</p>
      )}
      {!passwordMismatch && <div className="mb-3" />}

      {error && (
        <p className="text-nxtup-busy text-sm mb-4">{error}</p>
      )}

      <button
        type="submit"
        disabled={submitDisabled}
        className="w-full bg-white text-black font-semibold py-4 rounded-lg disabled:opacity-40 transition-all active:scale-[0.98]"
      >
        {stage === 'sending' ? 'Creando...' : 'Crear cuenta'}
      </button>

      <p className="text-nxtup-dim text-xs mt-6 text-center">
        ¿Ya tienes cuenta?{' '}
        <Link
          href="/login"
          className="text-nxtup-muted hover:text-white underline underline-offset-4"
        >
          Inicia sesión
        </Link>
      </p>
    </form>
  )
}

function translateError(message: string): string {
  if (/already registered|already exists|user already/i.test(message)) {
    return 'Ya hay una cuenta con este email. Inicia sesión.'
  }
  if (/invalid email/i.test(message)) {
    return 'Email inválido.'
  }
  if (/password.*short|password.*length/i.test(message)) {
    return 'La password es muy corta (mínimo 6 caracteres).'
  }
  if (/rate limit/i.test(message)) {
    return 'Demasiados intentos. Espera unos minutos.'
  }
  return message
}
