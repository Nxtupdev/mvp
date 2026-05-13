-- ============================================================
-- NXTUP — Configurable break durations v1
-- Run in Supabase SQL Editor
-- ============================================================

-- Shop-level config: first break is longer (default 60 min, e.g. lunch),
-- subsequent breaks are shorter (default 30 min, e.g. bathroom / smoke).
alter table shops
  add column if not exists first_break_minutes integer not null default 60,
  add column if not exists next_break_minutes  integer not null default 30;

-- Backfill from the legacy single column for existing shops.
update shops
  set first_break_minutes = break_duration_minutes
  where break_duration_minutes is not null
    and break_duration_minutes <> first_break_minutes
    and first_break_minutes = 60;  -- only if shop is still on default

-- Per-barber counter — increments when going to break,
-- resets to 0 when going offline (end of shift).
alter table barbers
  add column if not exists breaks_taken_today integer not null default 0;

-- Index for fast count reads (rarely useful but cheap)
create index if not exists barbers_breaks_today
  on barbers (shop_id, breaks_taken_today);

-- Note: the legacy column shops.break_duration_minutes is left in place for
-- backwards compatibility. A follow-up migration can drop it after all
-- consumers are migrated to first_break_minutes / next_break_minutes.
