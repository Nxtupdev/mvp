import { NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * PATCH /api/barbers/[barber_id]/avatar
 *
 * Lets the barber update their own avatar from their dashboard, which
 * isn't authenticated (no login). The "auth" here is the unguessable
 * UUID in the URL — same trust model as the rest of the barber
 * dashboard, Calendly booking links, etc.
 *
 * Uses the service-role client so it can bypass owner-only RLS.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ barber_id: string }> },
) {
  const { barber_id } = await params

  let body: { avatar?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Body inválido' }, { status: 400 })
  }

  // Accept null (clear) or any string — the avatar list lives in app code,
  // not the DB, so we trust the client to send a valid ID. Worst case the
  // UI renders the fallback initials.
  const newAvatar: string | null = body.avatar ?? null

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('barbers')
    .update({ avatar: newAvatar })
    .eq('id', barber_id)
    .select('id, avatar')
    .single()

  if (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: 'Barbero no encontrado' }, { status: 404 })
  }

  return Response.json({ ok: true, avatar: data.avatar })
}
