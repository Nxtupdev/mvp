-- ============================================================
-- NXTUP — Daily break counter reset v1
-- Run in Supabase SQL Editor
--
-- Until now, barbers.breaks_taken_today only reset when a barber tapped
-- 'offline' (end of shift). In practice many barbers stay 'active' or
-- 'available' through the close of the shop or just forget to clock out,
-- which means the next morning their 'first break' (60 min) would be
-- treated as a continuation break (30 min).
--
-- This adds a daily pg_cron job at 10 AM UTC that wipes the counter
-- for every barber, regardless of state. 10 AM UTC was chosen because
-- it lands in pre-opening hours for all of LatAm and the US:
--   UTC-4 (RD, NY summer): 6 AM
--   UTC-5 (US East winter): 5 AM
--   UTC-6 (CDMX): 4 AM
--   UTC-7 (Mountain): 3 AM
--   UTC-8 (Pacific): 2 AM
-- Asia/Pacific shops would need a per-shop timezone override (future work).
-- ============================================================

create or replace function reset_daily_break_counters()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  -- Only touch rows that actually need resetting so the diagnostic count
  -- is meaningful and we avoid no-op writes that would trigger realtime
  -- broadcasts to every connected client.
  update barbers
  set breaks_taken_today = 0
  where breaks_taken_today > 0;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

-- Re-create the schedule idempotently. cron.schedule errors if the job
-- already exists with a different definition, so we unschedule first.
do $$
begin
  perform cron.unschedule('nxtup-reset-daily-breaks');
exception when others then
  null;
end $$;

select cron.schedule(
  'nxtup-reset-daily-breaks',
  '0 10 * * *',
  $$ select public.reset_daily_break_counters(); $$
);
