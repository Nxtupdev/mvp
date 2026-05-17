-- ============================================================
-- NXTUP — No-show auto-release v1
-- Run in Supabase SQL Editor
--
-- Real-world bug: a barber is ACTIVE, has a client called to their
-- chair, and walks off the floor (genuine forgetfulness OR pretending
-- to "hold" their #1 spot). The client is stuck in 'called' state,
-- the next barber can't help them, the shop loses revenue and the
-- client either fumes or leaves.
--
-- Two-layer fix; this migration is Layer 1.
--   Layer 1 (this file): pg_cron checks every minute and releases
--     any queue_entry stuck in 'called' for >5 min. The negligent
--     barber gets moved to offline + activity_log no_show entry.
--   Layer 2 (in app code): the next-available barber sees a "Tomar
--     yo" banner on their dashboard after 60s, can pre-empt the
--     auto-release.
--
-- 5 minutes is conservative on purpose: it absorbs legit cases like
-- "barber is finalizing the previous client / went to wash hands"
-- without being so long the client gives up.
-- ============================================================

create or replace function release_stale_called_entries()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  released_count integer := 0;
begin
  for rec in
    select
      e.id          as entry_id,
      e.shop_id     as shop_id,
      e.barber_id   as negligent_barber_id,
      e.client_name as client_name,
      e.called_at   as called_at
    from queue_entries e
    where e.status = 'called'
      and e.called_at is not null
      and e.called_at < now() - interval '5 minutes'
  loop
    -- 1. Return the entry to the unassigned waiting pool so any
    --    barber can grab it (auto-match logic in /api/barbers state
    --    will pick it up the next time someone goes available).
    update queue_entries
    set status = 'waiting',
        barber_id = null,
        called_at = null
    where id = rec.entry_id;

    -- 2. Mark the negligent barber as offline. Clearing every break-
    --    related field too so when they come back, ACTIVE puts them
    --    cleanly at the bottom of the FIFO instead of restoring a
    --    stale held position.
    update barbers
    set status = 'offline',
        available_since = null,
        break_started_at = null,
        break_held_since = null,
        break_minutes_at_start = null,
        break_invalidating_barber_ids = '{}',
        break_invalidated = false
    where id = rec.negligent_barber_id;

    -- 3. Audit row. 'no_show' is the new action — the dueño can
    --    filter the activity feed for these to spot repeat offenders.
    insert into activity_log (
      shop_id, barber_id, action, from_status, to_status, metadata
    )
    values (
      rec.shop_id,
      rec.negligent_barber_id,
      'no_show',
      'available',
      'offline',
      jsonb_build_object(
        'entry_id', rec.entry_id,
        'client_name', rec.client_name,
        'called_at', rec.called_at,
        'minutes_elapsed', round((extract(epoch from (now() - rec.called_at)) / 60)::numeric, 1),
        'released_by', 'auto_timeout'
      )
    );

    released_count := released_count + 1;
  end loop;

  return json_build_object('released', released_count, 'ran_at', now());
end;
$$;

-- ── Cron schedule ────────────────────────────────────────────────
-- Re-create idempotently so re-runs of this migration don't
-- duplicate the job.
do $$
begin
  perform cron.unschedule('nxtup-release-stale-called');
exception when others then
  null;
end $$;

select cron.schedule(
  'nxtup-release-stale-called',
  '* * * * *',  -- every minute
  $$ select public.release_stale_called_entries(); $$
);
