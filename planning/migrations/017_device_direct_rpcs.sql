-- ============================================================
-- NXTUP — Device-direct Supabase RPCs v1
-- Run in Supabase SQL Editor
--
-- Latency surgery for the NXT TAP hardware. Previously the device
-- bounced through Vercel:
--
--   device → POST /api/barbers/[id]/state    (Vercel: ~10s on cold)
--   device → GET  /api/barbers/[id]/snapshot (Vercel: another ~3-5s)
--
-- Each Vercel hop ate ~10s on cold start. Plus the device made TWO
-- round trips per tap. Net latency to the TV display: 15-20s in
-- worst case.
--
-- This migration moves the device's hot path off Vercel entirely.
-- The Postgres functions below mirror what the Vercel endpoints did,
-- callable directly from the firmware via Supabase's REST RPC API:
--
--   POST https://<project>.supabase.co/rest/v1/rpc/
--        device_update_barber_state
--
--   POST https://<project>.supabase.co/rest/v1/rpc/
--        device_get_barber_snapshot
--
-- The state RPC also returns the fresh snapshot in its response, so a
-- tap goes from TWO HTTP calls down to ONE. Combined with Supabase's
-- always-warm distributed edge, target latency is ~300-600ms (vs the
-- 15-20s ceiling we just hit).
--
-- Web/owner flows still go through Vercel — only the device's hot
-- path changes. The Vercel endpoints remain available unchanged.
-- ============================================================

-- ── Token storage ────────────────────────────────────────────────
-- The device token used to live only in Vercel's env. We now need it
-- queryable from Postgres. A tiny app_settings KV table is the
-- simplest fit; production-grade installs can swap this for Vault.
create table if not exists app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

comment on table app_settings is
  'Server-side configuration the database needs to read. Currently '
  'stores the device API token for the device-direct RPCs. Treat '
  'rows as secrets — RLS denies all access; functions read via '
  'SECURITY DEFINER.';

alter table app_settings enable row level security;

-- No policies → no anonymous reads. Functions below read via
-- SECURITY DEFINER, which bypasses RLS.

-- The token itself needs to be set ONCE manually after this migration
-- runs. Use the same value already in Vercel's DEVICE_API_TOKEN env:
--
--   insert into app_settings (key, value)
--     values ('device_api_token', 'YOUR-TOKEN-HERE')
--   on conflict (key) do update set value = excluded.value;

-- ── Snapshot RPC ──────────────────────────────────────────────────
-- Mirrors the response shape of /api/barbers/[id]/snapshot so the
-- firmware doesn't have to change its parser when the URL flips.
--
-- Replaces several round trips with one SQL function call:
--   1. fetch barber
--   2. fetch shop
--   3. fetch peers (for FIFO computation)
--   4. fetch called + current queue entries
--   5. compute fifo_position + held_position
create or replace function device_get_barber_snapshot(
  p_barber_id  uuid,
  p_device_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_token text;
  v_barber         barbers%rowtype;
  v_shop           shops%rowtype;
  v_fifo_pos       int;
  v_held_pos       int;
  v_called         record;
  v_current        record;
begin
  -- ── Auth: validate the device token ──
  select value into v_expected_token from app_settings where key = 'device_api_token';
  if v_expected_token is null or p_device_token is null
     or p_device_token <> v_expected_token then
    raise exception 'invalid device token' using errcode = '28000';
  end if;

  -- ── Read barber row ──
  select * into v_barber from barbers where id = p_barber_id;
  if not found then
    raise exception 'barber not found' using errcode = '02000';
  end if;

  -- ── Read shop row ──
  select * into v_shop from shops where id = v_barber.shop_id;
  if not found then
    raise exception 'shop not found' using errcode = '02000';
  end if;

  -- ── Compute FIFO position ──
  -- Available barbers sorted by available_since (oldest first = #1).
  with ranked as (
    select id, row_number() over (order by available_since asc nulls last) as rn
    from barbers
    where shop_id = v_barber.shop_id
      and status = 'available'
      and available_since is not null
  )
  select rn into v_fifo_pos from ranked where id = p_barber_id;

  -- ── Compute held position ──
  -- For barbers on break with a held slot (and not invalidated under
  -- not_guaranteed mode), what position would they return to. This
  -- mirrors buildHeldPositions() in src/lib/queue-order.ts.
  with timeline as (
    select id,
      case
        when status = 'available' and available_since is not null then available_since
        when status = 'break' and break_held_since is not null and not coalesce(break_invalidated, false) then break_held_since
        else null
      end as ts,
      status = 'break' as is_held
    from barbers
    where shop_id = v_barber.shop_id
  ),
  ranked as (
    select id, is_held, row_number() over (order by ts asc) as rn
    from timeline
    where ts is not null
  )
  select rn into v_held_pos from ranked where id = p_barber_id and is_held;

  -- ── Called / current client lookups ──
  select id, client_name, position into v_called
  from queue_entries
  where barber_id = p_barber_id and status = 'called'
  limit 1;

  select id, client_name, position into v_current
  from queue_entries
  where barber_id = p_barber_id and status = 'in_progress'
  limit 1;

  -- ── Assemble JSON identical to the old Vercel route ──
  return jsonb_build_object(
    'barber', jsonb_build_object(
      'id',                     v_barber.id,
      'name',                   v_barber.name,
      'status',                 v_barber.status,
      'breaks_taken_today',     coalesce(v_barber.breaks_taken_today, 0),
      'break_started_at',       v_barber.break_started_at,
      'break_minutes_at_start', v_barber.break_minutes_at_start
    ),
    'shop', jsonb_build_object(
      'first_break_minutes',          v_shop.first_break_minutes,
      'next_break_minutes',           v_shop.next_break_minutes,
      'keep_position_on_break',       v_shop.keep_position_on_break,
      'break_position_grace_minutes', v_shop.break_position_grace_minutes
    ),
    'fifo_position',  v_fifo_pos,
    'held_position',  v_held_pos,
    'called_client',  case when v_called.id is not null
      then jsonb_build_object('name', v_called.client_name, 'position', v_called.position)
      else null end,
    'current_client', case when v_current.id is not null
      then jsonb_build_object('name', v_current.client_name, 'position', v_current.position)
      else null end,
    'server_time', now()
  );
end;
$$;

-- Anyone with the anon key (which is public) can CALL this function,
-- but they need the device token to actually get data out — token
-- check above is the real gate.
grant execute on function device_get_barber_snapshot(uuid, text) to anon, authenticated;

-- ── State update RPC ──────────────────────────────────────────────
-- Mirrors /api/barbers/[barber_id]/state for the device path
-- (isDeviceRequest = true): no IP gate, no owner check, just apply
-- the transition and return the fresh snapshot.
--
-- For each target status:
--   * available — complete in_progress, possibly invalidate peer
--                 break reservations, find + call next client
--   * busy      — move called → in_progress, mark barber busy
--   * break     — snapshot below-barbers (not_guaranteed mode),
--                 stamp break fields
--   * offline   — clear position + break state
create or replace function device_update_barber_state(
  p_barber_id    uuid,
  p_target       text,
  p_device_token text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_token text;
  v_barber         barbers%rowtype;
  v_shop           shops%rowtype;
  v_from_status    text;
  v_now            timestamptz := now();
  v_next_count     int;
  v_break_minutes  int;
  v_held_since     timestamptz;
  v_invalidating   uuid[];
  v_next_avail     timestamptz;
  v_position_restored boolean := false;
  v_elapsed_min    numeric;
  v_allowed_min    int;
  v_lost_reason    text;
  v_next_entry     record;
  v_called_entry   record;
begin
  -- ── Auth ──
  select value into v_expected_token from app_settings where key = 'device_api_token';
  if v_expected_token is null or p_device_token is null
     or p_device_token <> v_expected_token then
    raise exception 'invalid device token' using errcode = '28000';
  end if;

  if p_target not in ('available', 'busy', 'break', 'offline') then
    raise exception 'invalid target status: %', p_target using errcode = '22023';
  end if;

  select * into v_barber from barbers where id = p_barber_id;
  if not found then
    raise exception 'barber not found' using errcode = '02000';
  end if;

  select * into v_shop from shops where id = v_barber.shop_id;
  if not found then
    raise exception 'shop not found' using errcode = '02000';
  end if;

  v_from_status := v_barber.status;

  -- Idempotent guard — already in target state, return current snapshot.
  if v_from_status = p_target then
    return device_get_barber_snapshot(p_barber_id, p_device_token) || jsonb_build_object('noop', true);
  end if;

  -- ── Branch per target ──
  if p_target = 'available' then
    -- Mark any in-flight entries done. busy→available also sweeps stale
    -- 'called' entries (the BUSY tap should have moved them already).
    update queue_entries
      set status = 'done', completed_at = v_now
      where barber_id = p_barber_id
        and status = case when v_from_status = 'busy' then 'in_progress' else 'in_progress' end;

    if v_from_status = 'busy' then
      update queue_entries
        set status = 'done', completed_at = v_now
        where barber_id = p_barber_id and status = 'called';
    end if;

    -- Invalidate peer break reservations whose snapshot included us.
    -- Mirrors the not_guaranteed cleanup in the Vercel route.
    if v_from_status = 'busy' then
      update barbers
        set break_invalidated = true
        where shop_id = v_barber.shop_id
          and status = 'break'
          and break_invalidated = false
          and break_invalidating_barber_ids @> array[p_barber_id];
    end if;

    -- Returning from break? Maybe restore held position.
    v_next_avail := v_now;
    if v_from_status = 'break' and v_barber.break_held_since is not null
       and v_barber.break_started_at is not null then
      v_elapsed_min := extract(epoch from (v_now - v_barber.break_started_at)) / 60;
      v_break_minutes := coalesce(
        v_barber.break_minutes_at_start,
        case when coalesce(v_barber.breaks_taken_today, 0) + 1 <= 1
          then v_shop.first_break_minutes
          else v_shop.next_break_minutes
        end
      );
      v_allowed_min := v_break_minutes + coalesce(v_shop.break_position_grace_minutes, 5);

      if v_elapsed_min <= v_allowed_min and coalesce(v_barber.break_invalidated, false) = false then
        v_next_avail := v_barber.break_held_since;
        v_position_restored := true;
      else
        v_lost_reason := case
          when coalesce(v_barber.break_invalidated, false) then 'invalidated_by_below'
          else 'exceeded_grace'
        end;
      end if;
    end if;

    update barbers
      set status = 'available',
          available_since = v_next_avail,
          break_started_at = null,
          break_held_since = null,
          break_minutes_at_start = null,
          break_invalidating_barber_ids = '{}',
          break_invalidated = false
      where id = p_barber_id;

    -- Activity log for the transition + position outcome.
    insert into activity_log (shop_id, barber_id, action, from_status, to_status, metadata)
    values (
      v_barber.shop_id, p_barber_id, 'state_change', v_from_status, 'available',
      jsonb_build_object('available_since', v_next_avail, 'via', 'device')
    );

    if v_from_status = 'break' and v_barber.break_held_since is not null then
      if v_position_restored then
        insert into activity_log (shop_id, barber_id, action, metadata)
        values (v_barber.shop_id, p_barber_id, 'position_kept',
          jsonb_build_object(
            'held_since', v_barber.break_held_since,
            'elapsed_minutes', v_elapsed_min,
            'allowed_minutes', v_allowed_min,
            'via', 'device'
          ));
      else
        insert into activity_log (shop_id, barber_id, action, metadata)
        values (v_barber.shop_id, p_barber_id, 'position_lost',
          jsonb_build_object(
            'held_since', v_barber.break_held_since,
            'elapsed_minutes', v_elapsed_min,
            'allowed_minutes', v_allowed_min,
            'reason', coalesce(v_lost_reason, 'exceeded_grace'),
            'via', 'device'
          ));
      end if;
    end if;

    -- Find + call next client (specifically requested or unassigned).
    select id, client_name, position into v_next_entry
    from queue_entries
    where shop_id = v_barber.shop_id
      and barber_id = p_barber_id
      and status = 'waiting'
    order by position asc
    limit 1;

    if v_next_entry.id is null then
      select id, client_name, position into v_next_entry
      from queue_entries
      where shop_id = v_barber.shop_id
        and barber_id is null
        and status = 'waiting'
      order by position asc
      limit 1;
    end if;

    if v_next_entry.id is not null then
      update queue_entries
        set status = 'called', barber_id = p_barber_id, called_at = v_now
        where id = v_next_entry.id;
      update barbers set available_since = null where id = p_barber_id;
      insert into activity_log (shop_id, barber_id, action, metadata)
      values (v_barber.shop_id, p_barber_id, 'client_assigned',
        jsonb_build_object(
          'client_name', v_next_entry.client_name,
          'queue_position', v_next_entry.position,
          'entry_id', v_next_entry.id,
          'via', 'device'
        ));
    end if;

  elsif p_target = 'busy' then
    select id, client_name, position into v_called_entry
    from queue_entries
    where barber_id = p_barber_id and status = 'called'
    limit 1;

    if v_called_entry.id is not null then
      update queue_entries set status = 'in_progress' where id = v_called_entry.id;
    end if;

    update barbers
      set status = 'busy', available_since = null
      where id = p_barber_id;

    insert into activity_log (shop_id, barber_id, action, from_status, to_status, metadata)
    values (
      v_barber.shop_id, p_barber_id, 'state_change', v_from_status, 'busy',
      case when v_called_entry.id is not null then
        jsonb_build_object(
          'client_name', v_called_entry.client_name,
          'queue_position', v_called_entry.position,
          'via', 'device'
        )
      else jsonb_build_object('via', 'device') end
    );

  elsif p_target = 'break' then
    v_next_count := coalesce(v_barber.breaks_taken_today, 0) + 1;
    v_break_minutes := case when v_next_count <= 1
      then v_shop.first_break_minutes
      else v_shop.next_break_minutes
    end;

    v_held_since := case
      when v_from_status = 'available' and v_barber.available_since is not null
        then v_barber.available_since
      else null
    end;

    -- not_guaranteed snapshot of below-barbers
    v_invalidating := '{}';
    if v_shop.break_mode = 'not_guaranteed' and v_held_since is not null then
      with my_rank as (
        select row_number() over (order by available_since asc) as rn
        from barbers
        where shop_id = v_barber.shop_id
          and status = 'available'
          and available_since is not null
          and id = p_barber_id
      ),
      ranked as (
        select id, row_number() over (order by available_since asc) as rn
        from barbers
        where shop_id = v_barber.shop_id
          and status = 'available'
          and available_since is not null
      )
      select coalesce(array_agg(r.id), '{}') into v_invalidating
      from ranked r, my_rank m
      where r.rn > m.rn;
    end if;

    update barbers
      set status = 'break',
          available_since = null,
          break_started_at = v_now,
          break_held_since = v_held_since,
          break_minutes_at_start = v_break_minutes,
          breaks_taken_today = v_next_count,
          break_invalidating_barber_ids = v_invalidating,
          break_invalidated = false
      where id = p_barber_id;

    insert into activity_log (shop_id, barber_id, action, from_status, to_status, metadata)
    values (
      v_barber.shop_id, p_barber_id, 'state_change', v_from_status, 'break',
      jsonb_build_object(
        'break_number', v_next_count,
        'break_minutes', v_break_minutes,
        'held_position_since', v_held_since,
        'break_mode', v_shop.break_mode,
        'invalidating_barbers_count', coalesce(array_length(v_invalidating, 1), 0),
        'via', 'device'
      )
    );

  else  -- 'offline'
    update barbers
      set status = 'offline',
          available_since = null,
          break_started_at = null,
          break_held_since = null,
          break_minutes_at_start = null,
          breaks_taken_today = 0,
          break_invalidating_barber_ids = '{}',
          break_invalidated = false
      where id = p_barber_id;

    insert into activity_log (shop_id, barber_id, action, from_status, to_status, metadata)
    values (
      v_barber.shop_id, p_barber_id, 'state_change', v_from_status, 'offline',
      jsonb_build_object('via', 'device')
    );
  end if;

  -- Return the fresh snapshot so the device skips a second roundtrip.
  return device_get_barber_snapshot(p_barber_id, p_device_token);
end;
$$;

grant execute on function device_update_barber_state(uuid, text, text) to anon, authenticated;
