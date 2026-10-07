import { createAdminClient } from '@/lib/supabase/admin'
import { evaluateAccess } from '@/lib/billing-access'
import { priceIdForPlan, type BillingMode } from '@/lib/billing'
import { getStripe } from '@/lib/stripe'

// ============================================================
// /admin/revenue — Ingresos de NXTUP (suscripciones)
//
// Encendida el 6-oct-2026 con el arranque de cobros (puerta 074,
// cobros desde el lunes 12-oct). Responde las preguntas de los
// socios sin abrir Stripe ni Supabase: quién paga, quién está en
// prueba y hasta cuándo, quién quedó pausado, y el MRR.
//
// La clasificación usa evaluateAccess() — la MISMA función de la
// puerta de cobro del kiosko — así esta página nunca puede
// contradecir lo que el sistema hace de verdad.
//
// El precio NO está pintado en el código: se lee del price live de
// Stripe (igual que la card de /dashboard/billing); si Stripe no
// responde, los KPIs salen sin montos pero la tabla sigue.
//
// Lectura pura: la ven admin y socios por igual (auth en el layout).
// ============================================================

export const dynamic = 'force-dynamic'

type Category = 'blocked' | 'past_due' | 'trial' | 'paying' | 'contract' | 'comp' | 'unknown'

const CATEGORY_ORDER: Category[] = [
  'blocked',
  'past_due',
  'trial',
  'paying',
  'contract',
  'comp',
  'unknown',
]

const CATEGORY_BADGE: Record<Category, { label: string; cls: string; dot: string }> = {
  paying: { label: 'Pagando', cls: 'bg-nxtup-active/20 text-nxtup-active', dot: 'bg-nxtup-active' },
  trial: { label: 'En prueba', cls: 'bg-nxtup-break/20 text-nxtup-break', dot: 'bg-nxtup-break' },
  past_due: { label: 'Pago pendiente', cls: 'bg-nxtup-break/20 text-nxtup-break', dot: 'bg-nxtup-break' },
  blocked: { label: 'Pausado', cls: 'bg-nxtup-busy/20 text-nxtup-busy', dot: 'bg-nxtup-busy' },
  contract: { label: 'Contrato', cls: 'bg-nxtup-dim/30 text-nxtup-muted', dot: 'bg-nxtup-dim' },
  comp: { label: 'Cortesía', cls: 'bg-nxtup-dim/30 text-nxtup-muted', dot: 'bg-nxtup-dim' },
  unknown: { label: 'Sin datos', cls: 'bg-nxtup-dim/30 text-nxtup-muted', dot: 'bg-nxtup-dim' },
}

function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (Number.isNaN(ms)) return null
  return new Date(ms).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    timeZone: 'America/New_York',
  })
}

export default async function AdminRevenuePage() {
  const admin = createAdminClient()

  const [{ data: shopsRaw }, { data: subsRaw }] = await Promise.all([
    admin
      .from('shops')
      .select('id, name, logo_url, created_at, trial_ends_at')
      .order('created_at', { ascending: true }),
    admin
      .from('subscriptions')
      .select('shop_id, status, billing_mode, current_period_end, cancel_at_period_end'),
  ])

  const shops = (shopsRaw ?? []) as {
    id: string
    name: string
    logo_url: string | null
    created_at: string
    trial_ends_at: string | null
  }[]

  const subByShop = new Map<
    string,
    {
      status: string | null
      billing_mode: BillingMode | null
      current_period_end: string | null
      cancel_at_period_end: boolean
    }
  >()
  for (const s of subsRaw ?? []) {
    const row = s as {
      shop_id: string
      status: string | null
      billing_mode: BillingMode | null
      current_period_end: string | null
      cancel_at_period_end: boolean
    }
    subByShop.set(row.shop_id, row)
  }

  // Precio mensual desde Stripe (live). null → KPIs sin monto.
  let monthlyAmount: number | null = null
  try {
    const priceId = priceIdForPlan('pro')
    if (priceId) {
      const price = await getStripe().prices.retrieve(priceId)
      if (typeof price.unit_amount === 'number') monthlyAmount = price.unit_amount / 100
    }
  } catch (err) {
    console.error('[admin/revenue] no se pudo leer el precio de Stripe', err)
  }

  const rows = shops.map(shop => {
    const sub = subByShop.get(shop.id) ?? null
    const access = evaluateAccess(sub, shop.trial_ends_at)

    let category: Category
    if (sub?.billing_mode === 'comp') category = 'comp'
    else if (sub?.billing_mode === 'contract') category = 'contract'
    else if (sub?.status === 'past_due') category = 'past_due'
    else if (access.reason === 'subscription') category = 'paying'
    else if (access.reason === 'trial') category = 'trial'
    else if (access.reason === 'blocked') category = 'blocked'
    else category = 'unknown'

    // Línea de detalle: la fecha que le importa a un socio según el caso.
    let detail: string
    const trialDate = fmtDate(shop.trial_ends_at)
    const periodDate = fmtDate(sub?.current_period_end)
    switch (category) {
      case 'paying':
        detail = sub?.cancel_at_period_end
          ? `Se cancela el ${periodDate ?? '?'}`
          : periodDate
            ? `Se renueva el ${periodDate}`
            : 'Suscripción activa'
        break
      case 'past_due':
        detail = 'Stripe reintentando el cobro · acceso abierto'
        break
      case 'trial':
        detail = trialDate ? `Prueba hasta el ${trialDate}` : 'En prueba'
        break
      case 'blocked':
        detail = trialDate
          ? `Prueba venció el ${trialDate} · check-in cerrado`
          : 'Sin acceso · check-in cerrado'
        break
      case 'contract':
        detail = 'Facturación por fuera (acuerdo directo)'
        break
      case 'comp':
        detail = 'Gratis por decisión de socios'
        break
      default:
        detail = 'Sin información de cobro'
    }

    return { shop, category, detail, cancelPending: !!sub?.cancel_at_period_end }
  })

  rows.sort(
    (a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category),
  )

  const count = (c: Category) => rows.filter(r => r.category === c).length
  const paying = count('paying')
  const mrr = monthlyAmount !== null ? paying * monthlyAmount : null
  const nextTrialEnd = rows
    .filter(r => r.category === 'trial' && r.shop.trial_ends_at)
    .map(r => r.shop.trial_ends_at as string)
    .sort()[0]

  const kpis: { label: string; value: string; sub: string }[] = [
    {
      label: 'MRR',
      value: mrr !== null ? `$${mrr}` : '·',
      sub:
        monthlyAmount !== null
          ? `${paying} pagando × $${monthlyAmount}/mes`
          : `${paying} pagando`,
    },
    {
      label: 'En prueba',
      value: String(count('trial')),
      sub: nextTrialEnd ? `la más próxima vence el ${fmtDate(nextTrialEnd)}` : 'sin pruebas activas',
    },
    {
      label: 'Pausados',
      value: String(count('blocked') + count('past_due')),
      sub: count('past_due') > 0 ? `${count('past_due')} con pago pendiente` : 'sin acceso al check-in',
    },
    {
      label: 'Sin cobro',
      value: String(count('comp') + count('contract')),
      sub: 'cortesía + contrato',
    },
  ]

  return (
    <main className="px-6 sm:px-10 py-10 max-w-6xl">
      <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-3">
        Reportes · Finanzas
      </p>
      <h1 className="text-3xl font-black tracking-tight mb-2">Ingresos</h1>
      <p className="text-nxtup-muted text-sm mb-8 max-w-prose">
        Suscripciones de NXTUP Queue por barbería: quién paga, quién está en
        prueba y quién quedó pausado. Es la misma regla que abre o cierra el
        kiosko — lo que ves aquí es lo que el sistema hace.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {kpis.map(k => (
          <div key={k.label} className="rounded-2xl border border-nxtup-line p-5">
            <p className="text-nxtup-muted text-[10px] uppercase tracking-[0.3em] font-bold mb-2">
              {k.label}
            </p>
            <p className="text-3xl font-black tracking-tight tabular-nums">{k.value}</p>
            <p className="text-nxtup-muted text-xs mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-nxtup-line bg-nxtup-line/30 overflow-hidden">
        <div className="hidden md:grid grid-cols-[2.5fr_1.2fr_2fr] gap-4 px-5 py-3 border-b border-nxtup-line text-nxtup-muted text-[10px] uppercase tracking-widest font-bold">
          <div>Barbería</div>
          <div>Cobro</div>
          <div>Detalle</div>
        </div>

        <ul>
          {rows.map(({ shop, category, detail }) => {
            const badge = CATEGORY_BADGE[category]
            return (
              <li
                key={shop.id}
                className="md:grid md:grid-cols-[2.5fr_1.2fr_2fr] md:gap-4 md:items-center px-5 py-4 border-b border-nxtup-line last:border-b-0 flex flex-col gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {shop.logo_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shop.logo_url}
                      alt=""
                      className="w-9 h-9 rounded-md object-cover flex-shrink-0 bg-white"
                    />
                  ) : (
                    <div className="w-9 h-9 rounded-md bg-nxtup-dim flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-xs font-bold">
                        {shop.name.slice(0, 2).toUpperCase()}
                      </span>
                    </div>
                  )}
                  <p className="text-white text-sm font-bold truncate">{shop.name}</p>
                </div>

                <div>
                  <span
                    className={`inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold px-2 py-1 rounded ${badge.cls}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`} />
                    {badge.label}
                  </span>
                </div>

                <div className="text-xs text-nxtup-muted">{detail}</div>
              </li>
            )
          })}
        </ul>
      </div>
    </main>
  )
}
