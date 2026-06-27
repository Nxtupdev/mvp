'use client'

/**
 * useQueueCount — live count of clients currently waiting in a shop.
 *
 * Drives the persistent header on the kiosk (`X en cola · Y-Z min`).
 * Without realtime, the count is a snapshot from page load that drifts
 * stale as customers come and go — bad UX on a kiosk that stays open
 * for hours. With realtime, the header updates within ~1s of any
 * change to queue_entries for this shop.
 *
 * How it works:
 *   1. The component starts with `initialCount` (passed from SSR so the
 *      first paint is correct — no flash of "0 in queue" while the
 *      WebSocket connects).
 *   2. On mount, we open a Supabase Realtime channel filtered to this
 *      shop's queue_entries.
 *   3. On any postgres_changes event (INSERT / UPDATE / DELETE), we
 *      do a fresh `count(*)` query against `status='waiting'`. This is
 *      a cheap head-only query and gives us the authoritative number
 *      regardless of what specifically changed.
 *   4. Cleanup removes the channel on unmount, so navigating away
 *      doesn't leak WebSocket connections.
 *
 * We also do one fresh sync on mount (before the realtime kicks in) to
 * cover the case where time passed between the server render and the
 * client hydrating — e.g., the page was open in a tab for minutes
 * before the user came back.
 *
 * Mirrors the realtime pattern used by DisplayBoard (`display-${shop.id}`
 * channel) — same table, different consumer, different channel name so
 * we don't fight for shared subscriptions.
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { debounce } from '@/lib/debounce'

export function useQueueCount(shopId: string, initialCount: number): number {
  const [count, setCount] = useState(initialCount)

  useEffect(() => {
    const supabase = createClient()

    let cancelled = false

    async function syncCount() {
      const { count: fresh } = await supabase
        .from('queue_entries')
        .select('*', { count: 'exact', head: true })
        .eq('shop_id', shopId)
        .eq('status', 'waiting')

      // Guard against late responses arriving after unmount or after
      // the shopId changed (would leak stale data into the new shop's
      // header otherwise).
      if (cancelled) return
      if (fresh != null) setCount(fresh)
    }

    // Fresh sync on mount — covers tabs that sat idle between SSR and
    // hydration. Cheap (HEAD count, no row payload).
    syncCount()

    // Debounce the re-count: a burst of queue changes (e.g. a cascade
    // that touches several rows at once) collapses into one HEAD query
    // ~250ms after the last event, instead of one query per event.
    const debouncedSync = debounce(syncCount, 250)

    const channel = supabase
      .channel(`kiosk-queue-${shopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `shop_id=eq.${shopId}`,
        },
        // Any change in this shop's queue → re-count (debounced). We
        // could optimize by tracking deltas (e.g. on INSERT just +1),
        // but status filters make that fragile (an UPDATE from 'waiting'
        // to 'called' should -1 the visible count; harder to express
        // cleanly than just re-fetching).
        debouncedSync,
      )
      .subscribe()

    return () => {
      cancelled = true
      debouncedSync.cancel()
      supabase.removeChannel(channel)
    }
  }, [shopId])

  return count
}
