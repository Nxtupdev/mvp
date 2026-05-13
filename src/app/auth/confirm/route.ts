import { NextRequest, NextResponse } from 'next/server'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/dashboard'

  const supabase = await createClient()

  // PKCE flow: ?code=...
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    console.error('[auth/confirm] exchangeCodeForSession failed:', error.message)
    return NextResponse.redirect(
      new URL(`/login?error=invalid&detail=${encodeURIComponent(error.message)}`, origin),
    )
  }

  // Token hash flow: ?token_hash=...&type=...
  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash })
    if (!error) return NextResponse.redirect(new URL(next, origin))
    console.error('[auth/confirm] verifyOtp failed:', error.message, 'type=', type)
    return NextResponse.redirect(
      new URL(`/login?error=invalid&detail=${encodeURIComponent(error.message)}`, origin),
    )
  }

  console.error(
    '[auth/confirm] missing params. URL:',
    request.url,
    'searchParams:',
    Object.fromEntries(searchParams),
  )
  return NextResponse.redirect(new URL('/login?error=invalid&detail=missing-params', origin))
}
