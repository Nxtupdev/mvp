-- ============================================================
-- NXTUP — Break mode v1
-- Run in Supabase SQL Editor
--
-- Until now the "what happens with my FIFO position when I take a
-- break" question had a single answer per shop, controlled by the
-- `keep_position_on_break` boolean:
--   * true  → barber keeps their spot if they return within
--             break_minutes + grace
--   * false → barber always loses their spot
--
-- Barbers asked for a third option: "I'm happy to KEEP my position
-- BUT if someone below me actually worked (took a walk-in and
-- finished it) while I was away, then I clearly didn't deserve to
-- jump back ahead of them — bump me to the end."
--
-- We model this as a small enum on the shop:
--   * 'guaranteed'     — current default. Reservation always holds
--                        within break_minutes + grace.
--   * 'not_guaranteed' — same as above, EXCEPT the reservation is
--                        invalidated the instant a barber listed in
--                        `break_invalidating_barber_ids` completes a
--                        walk-in. "Use it or lose it."
--
-- The `keep_position_on_break` column is no longer read by new code
-- but is left in place to avoid a destructive drop while old clients
-- might still be deployed. A follow-up migration can remove it once
-- everything is updated.
-- ============================================================

-- ── shops: the new mode flag ─────────────────────────────────
alter table shops
  add column if not exists break_mode text not null default 'guaranteed'
    check (break_mode in ('guaranteed', 'not_guaranteed'));

comment on column shops.break_mode is
  'Reservation policy for on-break barbers. ''guaranteed'' = current behavior, '
  '''not_guaranteed'' = reservation invalidates the moment any barber below '
  'completes a walk-in during the break.';

-- ── barbers: snapshot + denormalized invalidation flag ───────
-- At BREAK time we snapshot which barbers were below this one in the
-- live FIFO (only when break_mode = 'not_guaranteed'). When any of
-- those barbers later completes a walk-in (status='done' transition),
-- the API flips `break_invalidated = true` on this row. The flag is
-- cleared whenever the barber leaves the 'break' state for any reason.
alter table barbers
  add column if not exists break_invalidating_barber_ids uuid[] not null default '{}';

alter table barbers
  add column if not exists break_invalidated boolean not null default false;

comment on column barbers.break_invalidating_barber_ids is
  'Snapshot of barber ids that were BELOW this barber in the FIFO at the '
  'moment this barber went on break. Only populated when '
  'shops.break_mode = ''not_guaranteed''. Cleared on leaving break.';

comment on column barbers.break_invalidated is
  'True once any barber in break_invalidating_barber_ids has completed a '
  'walk-in since this break began. When true, returning from break sends '
  'the barber to the end of the queue regardless of elapsed time.';

-- ── Index for the API''s array-contains lookup ───────────────
-- The state route runs:
--   update barbers set break_invalidated = true
--   where status = 'break'
--     and shop_id = $1
--     and break_invalidating_barber_ids @> array[$completing_barber_id]
-- A GIN index makes the @> predicate cheap even with many barbers on
-- break across a busy shop.
create index if not exists idx_barbers_break_invalidating
  on barbers using gin (break_invalidating_barber_ids);
