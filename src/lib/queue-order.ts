/**
 * FIFO ordering of available barbers — anti-manipulation primitive.
 *
 * The barber whose `available_since` is OLDEST is #1 (next to be assigned).
 * Non-available barbers (busy / break / offline) don't get a position.
 *
 * `available_since` is set by the server every time a barber transitions
 * INTO 'available' (clock-in or finishing a cut), so the order reflects
 * exactly the events the user described:
 *   1. Order they clocked in (offline → available).
 *   2. Order they finished cuts and returned (busy → available).
 *
 * Surfacing this number publicly (TV, dashboard, barber app) makes the
 * queue impossible to manipulate silently.
 */

export type BarberOrderable = {
  id: string
  status: string
  available_since: string | null
  /**
   * If the shop has `keep_position_on_break = true` and the barber is
   * currently on break, this holds the `available_since` they had at the
   * moment they walked off — so we can compute the position they'll come
   * back to. Null otherwise.
   */
  break_held_since?: string | null
}

/**
 * Returns a Map from barber id → 1-indexed position in the available FIFO.
 *
 * A barber appears in the map only when:
 *   - status === 'available' (not busy / break / offline), AND
 *   - available_since is set.
 *
 * available_since is intentionally cleared by the API when a client is
 * matched to that barber (status='called'). They're still 'available'
 * but momentarily out of the FIFO until they finish that haircut and
 * re-enter the queue (going 'busy' → 'available' again).
 */
export function buildBarberOrder(
  barbers: BarberOrderable[],
): Map<string, number> {
  const sorted = barbers
    .filter(b => b.status === 'available' && b.available_since !== null)
    .sort((a, b) => {
      const ta = new Date(a.available_since!).getTime()
      const tb = new Date(b.available_since!).getTime()
      return ta - tb
    })

  const map = new Map<string, number>()
  sorted.forEach((b, idx) => map.set(b.id, idx + 1))
  return map
}

/**
 * For each barber currently on BREAK with a held position
 * (`break_held_since` is set), returns the position they'll return to
 * once they reactivate — assuming the rest of the queue stays as-is.
 *
 * Computed by ranking their `break_held_since` against the active
 * barbers' `available_since`. Carlos with held=09:00 alongside Jose at
 * available=09:05 → Carlos comes back to #1, Jose drops to #2.
 *
 * NOT used for actual client matching (only available barbers get a
 * client). It's a display-only signal so the owner / TV / barber app
 * can show "Vuelve a #1" next to a barber on break.
 */
export function buildHeldPositions(
  barbers: BarberOrderable[],
): Map<string, number> {
  const timeline: { id: string; ts: number; held: boolean }[] = []
  for (const b of barbers) {
    if (b.status === 'available' && b.available_since) {
      timeline.push({
        id: b.id,
        ts: new Date(b.available_since).getTime(),
        held: false,
      })
    } else if (b.status === 'break' && b.break_held_since) {
      timeline.push({
        id: b.id,
        ts: new Date(b.break_held_since).getTime(),
        held: true,
      })
    }
  }
  timeline.sort((a, b) => a.ts - b.ts)
  const map = new Map<string, number>()
  timeline.forEach((t, idx) => {
    if (t.held) map.set(t.id, idx + 1)
  })
  return map
}

/**
 * Sorts barbers for visual display so the queue order is obvious:
 *   1. FIFO-positioned barbers first (#1, #2, ...).
 *   2. Then everyone else (busy / break / available-without-position),
 *      grouped by status priority and broken ties alphabetically.
 *
 * Pure function — does not mutate the input.
 */
export function sortByQueueOrder<T extends BarberOrderable & { name: string }>(
  barbers: T[],
  order: Map<string, number>,
): T[] {
  const statusRank: Record<string, number> = {
    available: 1, // available without position (just got matched a client)
    busy: 2,
    break: 3,
    offline: 4,
  }

  return [...barbers].sort((a, b) => {
    const pa = order.get(a.id)
    const pb = order.get(b.id)
    if (pa !== undefined && pb !== undefined) return pa - pb
    if (pa !== undefined) return -1
    if (pb !== undefined) return 1
    const ra = statusRank[a.status] ?? 99
    const rb = statusRank[b.status] ?? 99
    if (ra !== rb) return ra - rb
    return a.name.localeCompare(b.name)
  })
}
