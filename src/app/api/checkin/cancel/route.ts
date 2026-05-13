import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const { entry_id } = await request.json()
  if (!entry_id) return Response.json({ error: 'Missing entry_id' }, { status: 400 })

  const supabase = await createClient()

  const { error } = await supabase
    .from('queue_entries')
    .update({ status: 'cancelled' })
    .eq('id', entry_id)
    .eq('status', 'waiting')

  if (error) return Response.json({ error: 'No se pudo cancelar' }, { status: 500 })
  return Response.json({ ok: true })
}
