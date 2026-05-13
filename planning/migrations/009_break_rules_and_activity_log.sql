-- ============================================================
-- NXTUP — Break position rules + activity log v1
-- Run in Supabase SQL Editor
--
-- Adds two configurable rules per shop:
--   * keep_position_on_break: if true, a barber who returns from break
--     within the allowed window keeps their FIFO position (e.g. Carlos #1
--     goes to break, Jose moves up to #1, Carlos returns within 1h+5min
--     and goes back to #1). If false (default), current behavior — they
--     get a fresh available_since and fall to the end of the queue.
--   * break_position_grace_minutes: extra minutes after the configured
--     break duration before they lose their position. Default 5.
--
-- Adds an append-only activity_log of every barber state transition,
-- client assignment, position kept/lost, and shop config change. Used
-- by the owner dashboard to resolve disputes ("yo no me fui a break
-- tan temprano"). Retention is 90 days via pg_cron — older rows are
-- deleted nightly to keep the table fast at scale.
-- ============================================================

-- ── 1. Shop-level break rules ───────────────────────────────────────
alter table shops
  add column if not exists keep_position_on_break boolean not null default false,
  add column if not exists break_position_grace_minutes integer not null default 5;

-- ── 2. Per-barber break-position bookkeeping ────────────────────────
-- When a barber goes on break and keep_position_on_break is true,
-- their available_since is moved into break_held_since (instead of
-- being cleared). On return, if they're within the allowed window,
-- this value is restored to available_since and they keep their slot.
alter table barbers
  add column if not exists break_held_since timestamptz,
  -- Snapshot of the break duration that applies to the CURRENT break,
  -- in minutes. Prevents races if the owner changes shop config while
  -- a barber is on break.
  add column if not exists break_minutes_at_start integer;

-- ── 3. activity_log table ───────────────────────────────────────────
create table if not exists activity_log (
  id           uuid primary key default gen_random_uuid(),
  shop_id      uuid not null references shops on delete cascade,
  barber_id    uuid references barbers on delete set null,
  action       text not null
                 check (action in (
                   'state_change',
                   'client_assigned',
                   'position_kept',
                   'position_lost',
                   'shop_settings_changed'
                 )),
  from_status  text,
  to_status    text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

-- Hot read pattern: "give me the last N events for this shop" — index
-- by (shop_id, created_at desc) keeps the dashboard query O(log n).
create index if not exists activity_log_shop_created
  on activity_log (shop_id, created_at desc);

-- Per-barber filter is also common ("show only Carlos's activity").
create index if not exists activity_log_barber_created
  on activity_log (barber_id, created_at desc);

alter table activity_log enable row level security;

-- Owner has full access (read/write) to their shop's logs.
drop policy if exists "owner full access" on activity_log;
create policy "owner full access" on activity_log
  for all using (
    shop_id in (select id from shops where owner_id = auth.uid())
  ) with check (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

-- ── 4. Realtime publication for activity_log ────────────────────────
-- The dashboard's Activity page can subscribe so new entries appear
-- live without needing to poll.
do $$ begin
  alter publication supabase_realtime add table activity_log;
exception when others then null;
end $$;

-- ── 5. 90-day retention cleanup ─────────────────────────────────────
-- Append-only logs grow forever otherwise. At ~50 events per shop per
-- day across thousands of shops this would hit hundreds of millions of
-- rows per year. 90 days is plenty for dispute resolution; longer-term
-- analytics live in derived/aggregated tables (future work).

create or replace function cleanup_old_activity_logs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer;
begin
  delete from activity_log
  where created_at < now() - interval '90 days';
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

-- Schedule the cleanup nightly at 03:15 UTC (low-traffic hour for most
-- US/LatAm barbershops). pg_cron is available on Supabase under the
-- "extensions" schema; enabling it is idempotent.
create extension if not exists pg_cron with schema extensions;

-- Re-create the schedule idempotently. cron.schedule errors if the job
-- already exists with a different definition, so we unschedule first.
do $$
begin
  perform cron.unschedule('nxtup-cleanup-activity-log');
exception when others then
  -- Job didn't exist — fine.
  null;
end $$;

select cron.schedule(
  'nxtup-cleanup-activity-log',
  '15 3 * * *',
  $$ select public.cleanup_old_activity_logs(); $$
);
