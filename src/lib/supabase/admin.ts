import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. Bypasses Row Level Security.
 *
 * ONLY use this from server-side device endpoints that have already
 * validated a `x-device-token` header against `DEVICE_API_TOKEN`. Never
 * expose it to the browser or to user-authenticated routes — RLS is our
 * safety net everywhere else.
 *
 * Required env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY  (from Supabase dashboard → Settings → API)
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env var',
    )
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
