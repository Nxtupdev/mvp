import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/admin'
import { validatePanelTokenValue } from '@/lib/panel-token'
import ControlPanel from '@/app/dashboard/barbers/control/ControlPanel'

// ============================================================
// /panel/[shop_id] — Centro de Mando temporal (sin dashboard)
//
// Ruta pública con acceso gated por un token en el query param `?t=`.
// El token vive en shop_control_tokens (migración 043). Al validar,
// renderiza el mismo componente ControlPanel que usa el dashboard
// pero con `panelToken` para que las APIs lo acepten como auth.
//
// Caso de uso: el dueño de NXTUP genera un link desde su dashboard
// y se lo pasa al dueño de un shop nuevo (barbería de prueba) para
// que pruebe el centro de mando sin tener cuenta ni acceso al
// resto del dashboard. Cuando el token expira o se revoca, esta
// página deja de funcionar — el dueño nuevo no puede entrar más.
//
// Sin token / token inválido / token expirado → render de la
// pantalla "Acceso no disponible" con instrucciones para volver
// a pedir el link.
// ============================================================

export const dynamic = 'force-dynamic'

export default async function PanelPage({
  params,
  searchParams,
}: {
  params: Promise<{ shop_id: string }>
  searchParams: Promise<{ t?: string }>
}) {
  const { shop_id } = await params
  const { t: token } = await searchParams

  const tokenShopId = await validatePanelTokenValue(token)
  if (!tokenShopId) return <AccessDenied reason="invalid_or_expired" />
  if (tokenShopId !== shop_id) return <AccessDenied reason="wrong_shop" />

  // Token válido — usamos admin client porque no hay cookie de dueño
  // aquí. La autorización ya pasó vía token.
  const admin = createAdminClient()

  const { data: shop } = await admin
    .from('shops')
    .select('id, name, first_break_minutes, next_break_minutes, break_position_grace_minutes, break_mode')
    .eq('id', shop_id)
    .maybeSingle()
  if (!shop) return <AccessDenied reason="shop_not_found" />

  const [{ data: barbers }, { data: entries }] = await Promise.all([
    admin
      .from('barbers')
      .select(
        'id, name, status, avatar, available_since, break_started_at, break_held_since, break_minutes_at_start, breaks_taken_today, break_invalidated, late_toll_remaining',
      )
      .eq('shop_id', shop_id)
      .order('name'),
    admin
      .from('queue_entries')
      .select('id, barber_id, client_name, status, position')
      .eq('shop_id', shop_id)
      .in('status', ['called', 'in_progress']),
  ])

  const shopWithMode = {
    ...shop,
    break_mode:
      ((shop as { break_mode?: string }).break_mode as
        | 'guaranteed'
        | 'not_guaranteed'
        | undefined) ?? 'guaranteed',
  }

  return (
    <div className="min-h-screen bg-nxtup-bg flex flex-col">
      <header className="border-b border-nxtup-line/40 px-4 py-3">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold">
          Centro de mando · Acceso temporal
        </p>
      </header>
      <ControlPanel
        shop={shopWithMode}
        initialBarbers={barbers ?? []}
        initialEntries={entries ?? []}
        panelToken={token ?? null}
      />
    </div>
  )
}

function AccessDenied({
  reason,
}: {
  reason: 'invalid_or_expired' | 'wrong_shop' | 'shop_not_found'
}) {
  const msg =
    reason === 'invalid_or_expired'
      ? 'Este link expiró o ya no está activo. Pídele a quien te lo envió que genere uno nuevo.'
      : reason === 'wrong_shop'
        ? 'El link no corresponde a esta barbería.'
        : 'No encontramos la barbería asociada a este link.'

  return (
    <main className="min-h-screen bg-nxtup-bg flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
          Centro de mando
        </p>
        <h1 className="text-2xl font-black tracking-tight text-white mb-3">
          Acceso no disponible
        </h1>
        <p className="text-nxtup-muted text-sm mb-6">{msg}</p>
        <Link
          href="/"
          className="text-white text-xs uppercase tracking-[0.2em] underline hover:no-underline"
        >
          Ir a NXTUP
        </Link>
      </div>
    </main>
  )
}
