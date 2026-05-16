-- ============================================================
-- NXTUP — Nightly state reset v1
-- Run in Supabase SQL Editor
--
-- Without this, state from yesterday persists into today:
--   * queue_entries with status waiting/called/in_progress still show
--     up in the live queue the next morning
--   * barbers stuck in 'available' / 'busy' / 'break' overnight skew
--     the FIFO order from sunrise
--   * breaks_taken_today never goes back to 0 if the barber forgets to
--     tap 'offline' before leaving
--
-- The cron runs at 09:00 UTC daily — that maps to:
--     04:00 EST (winter), 05:00 EDT (summer)
--     04:00 Atlantic (DR year-round)
--     03:00 CST, 02:00 MST, 01:00 PST
-- so it always lands well after the last shop has closed and well
-- before the first shop opens.
--
-- Supersedes migration 010 (which only reset breaks_taken_today) —
-- this one also unschedules that old cron to avoid a redundant job.
-- ============================================================

create or replace function nightly_state_reset()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_count integer;
  reset_count integer;
begin
  -- 1. Cancel any queue entries that never made it to 'done'.
  update queue_entries
  set status = 'cancelled'
  where status in ('waiting', 'called', 'in_progress');
  get diagnostics cancelled_count = row_count;

  -- 2. Reset every barber to a clean 'offline' slate.
  update barbers
  set status = 'offline',
      available_since = null,
      break_started_at = null,
      break_held_since = null,
      break_minutes_at_start = null,
      breaks_taken_today = 0
  where status <> 'offline'
     or available_since is not null
     or break_started_at is not null
     or break_held_since is not null
     or break_minutes_at_start is not null
     or breaks_taken_today <> 0;
  get diagnostics reset_count = row_count;

  return json_build_object(
    'cancelled_entries', cancelled_count,
    'reset_barbers',     reset_count,
    'run_at',            now()
  );
end;
$$;

-- ── Cron schedule ────────────────────────────────────────────────────

-- Out with the old break-only cron from migration 010 — its work is
-- now part of nightly_state_reset.
do $$
begin
  perform cron.unschedule('nxtup-reset-daily-breaks');
exception when others then
  null;
end $$;

-- Re-create the schedule idempotently.
do $$
begin
  perform cron.unschedule('nxtup-nightly-reset');
exception when others then
  null;
end $$;

select cron.schedule(
  'nxtup-nightly-reset',
  '0 9 * * *',
  $$ select public.nightly_state_reset(); $$
);
