/**
 * debounce — collapse a burst of calls into a single invocation that
 * runs `delay` ms after the last call.
 *
 * Built for the Realtime consumers: a flurry of postgres_changes events
 * (e.g. a cascade that touches several rows at once) would otherwise
 * trigger one refetch per event. Wrapping the refetch in `debounce`
 * collapses the burst into a single refetch, ~`delay` ms after the last
 * event. 250ms is imperceptible to the eye but kills the redundant work.
 *
 * The returned function carries a `.cancel()` so the effect cleanup can
 * drop any pending call on unmount (no setState-after-unmount, no leak).
 *
 * Usage inside a useEffect:
 *   const debounced = debounce(refetch, 250)
 *   channel.on('postgres_changes', cfg, debounced).subscribe()
 *   return () => { debounced.cancel(); supabase.removeChannel(channel) }
 */
export type Debounced<A extends unknown[]> = ((...args: A) => void) & {
  cancel: () => void
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay = 250,
): Debounced<A> {
  let timer: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: A) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, delay)
  }

  debounced.cancel = () => {
    if (timer) clearTimeout(timer)
    timer = null
  }

  return debounced as Debounced<A>
}
