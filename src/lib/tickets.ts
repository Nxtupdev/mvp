/**
 * Tickets por porcentaje (082) — helpers puros del reparto.
 * Spec: planning/specs/tickets-porcentaje-spec.md
 */

/** % del BARBERO: override individual o default del shop. */
export function barberPercent(
  shopDefault: number | null | undefined,
  override: number | null | undefined,
): number {
  const pct = override ?? shopDefault ?? 60
  return Math.min(100, Math.max(0, Math.round(pct)))
}

/**
 * Reparte un total según el % del barbero, en centavos exactos: la
 * parte del barbero se redondea a centavo y la casa recibe el resto —
 * las dos partes SIEMPRE suman el total (nada de perder un centavo en
 * el redondeo de cada lado).
 */
export function splitAmount(
  total: number,
  barberPct: number,
): { barber: number; house: number } {
  const totalCents = Math.round(total * 100)
  const barberCents = Math.round((totalCents * barberPct) / 100)
  return { barber: barberCents / 100, house: (totalCents - barberCents) / 100 }
}

export type TicketRow = {
  id: string
  barber_id: string
  service_name: string | null
  amount: number
  status: string
  created_at: string
  // null = línea registrada A MANO (Mis clientes, 083): sin turno de la
  // cola. Opcional para no romper a quien no la seleccione.
  entry_id?: string | null
}

/** Totales de un conjunto de líneas confirmadas para UN barbero. */
export function barberTotals(rows: TicketRow[], pct: number) {
  const confirmed = rows.filter(r => r.status === 'confirmed')
  const total = confirmed.reduce((s, r) => s + Number(r.amount), 0)
  const { barber, house } = splitAmount(total, pct)
  return {
    count: confirmed.length,
    pending: rows.length - confirmed.length,
    total: Math.round(total * 100) / 100,
    barber_part: barber,
    house_part: house,
  }
}
