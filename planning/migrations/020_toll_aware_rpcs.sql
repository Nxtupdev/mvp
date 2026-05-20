-- ============================================================
-- NXTUP — Toll-aware cascade and device RPCs
-- Run in Supabase SQL Editor (AFTER 019)
--
-- Esta migración integra el sistema de peaje (de la 019) con las
-- piezas que ya teníamos:
--
--   * cascade_no_show_called_entries (018) — al auto-offlinear
--     un barbero que no respondió, limpia sus obligaciones de
--     peaje. Al buscar al siguiente para cascadearle el cliente,
--     excluye barberos pagando peaje.
--
--   * device_get_barber_snapshot (017) — el snapshot ahora
--     incluye late_toll_remaining para que el firmware/PWA
--     pueda mostrar el indicador naranja + contador.
--
--   * device_update_barber_state (017) — engancha las 3
--     transiciones que cambian peaje:
--       - OFFLINE → AVAILABLE: register_late_arrival
--       - BUSY → AVAILABLE (con corte completado): pay toll
--       - * → OFFLINE: clear toll
--     Y bloquea auto-asignación si el barbero está pagando peaje.
-- ============================================================

-- ── 1. Cascade (de 018) ahora respeta el peaje ──────────────
-- Cambios vs versión 018:
--   * Al auto-offlinear el barbero negligente: perform
--     clear_late_arrival_toll(...) para evaporar sus obligaciones
--     (los tardes que esperaban por él quedan parcialmente libres).
--   * Al buscar el "siguiente disponible" para cascadear: filtra
--     b.late_toll_remaining = 0 para no asignar a alguien que
--     está pagando peaje (defeat-the-purpose).
create or replace function cascade_no_show_called_entries()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_next_barber_id uuid;
  v_now timestamptz := now();
  v_cascaded_count integer := 0;
  v_returned_to_waiting_count integer := 0;
begin
  for rec in
    select
      e.id          as entry_id,
      e.shop_id     as shop_id,
      e.barber_id   as negligent_barber_id,
      e.client_name as client_name,
      e.position    as queue_position,
      e.called_at   as called_at
    from queue_entries e
    where e.status = 'called'
      and e.called_at is not null
      and e.called_at < v_now - interval '90 seconds'
    order by e.called_at asc
  loop
    -- 1. Offline al barbero negligente + reset
    update barbers
    set status = 'offline',
        available_since = null,
        break_started_at = null,
        break_held_since = null,
        break_minutes_at_start = null,
        breaks_taken_today = 0,
        break_invalidating_barber_ids = '{}',
        break_invalidated = false
    where id = rec.negligent_barber_id;

    -- NEW (020): borrar TODAS sus filas de peaje (las que owes y
    -- las que le owen). Los tardes que esperaban por él se refresc.
    perform clear_late_arrival_toll(rec.negligent_barber_id);

    insert into activity_log (
      shop_id, barber_id, action, from_status, to_status, metadata
    )
    values (
      rec.shop_id,
      rec.negligent_barber_id,
      'no_show',
      null,
      'offline',
      jsonb_build_object(
        'entry_id', rec.entry_id,
        'client_name', rec.client_name,
        'queue_position', rec.queue_position,
        'called_at', rec.called_at,
        'seconds_elapsed', round(extract(epoch from (v_now - rec.called_at))::numeric, 1),
        'released_by', 'cascade_timeout',
        'threshold_seconds', 90
      )
    );

    -- 2. Buscar próximo barbero (NEW: excluir tarde-bloqueados)
    select b.id
      into v_next_barber_id
      from barbers b
      where b.shop_id = rec.shop_id
        and b.status = 'available'
        and b.available_since is not null
        and b.id <> rec.negligent_barber_id
        and b.late_toll_remaining = 0  -- ← NUEVO en 020
      order by b.available_since asc
      limit 1;

    if v_next_barber_id is not null then
      -- 3a. Cascade: reasignar
      update queue_entries
      set barber_id = v_next_barber_id,
          called_at = v_now
      where id = rec.entry_id;

      update barbers
      set available_since = null
      where id = v_next_barber_id;

      insert into activity_log (
        shop_id, barber_id, action, metadata
      )
      values (
        rec.shop_id,
        v_next_barber_id,
        'client_assigned',
        jsonb_build_object(
          'client_name', rec.client_name,
          'queue_position', rec.queue_position,
          'entry_id', rec.entry_id,
          'via', 'cascade',
          'previous_barber_id', rec.negligent_barber_id
        )
      );

      v_cascaded_count := v_cascaded_count + 1;
    else
      -- 3b. No takers: cliente vuelve al pool
      update queue_entries
      set status = 'waiting',
          barber_id = null,
          called_at = null
      where id = rec.entry_id;

      insert into activity_log (
        shop_id, barber_id, action, metadata
      )
      values (
        rec.shop_id,
        null,
        'no_show_no_takers',
        jsonb_build_object(
          'client_name', rec.client_name,
          'queue_position', rec.queue_position,
          'entry_id', rec.entry_id,
          'previous_barber_id', rec.negligent_barber_id
        )
      );

      v_returned_to_waiting_count := v_returned_to_waiting_count + 1;
    end if;
  end loop;

  return json_build_object(
    'cascaded',            v_cascaded_count,
    'returned_to_waiting', v_returned_to_waiting_count,
    'ran_at',              v_now
  );
end;
$$;

-- ── 2. Snapshot del dispositivo expone late_toll_remaining ───
-- Re-crea device_get_barber_snapshot del 017 añadiendo el campo
-- al barber object. El firmware/PWA puede usarlo para mostrar
-- el indicador naranja + contador "Esperando: X".
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
  -- Auth
  select value into v_expected_token from app_settings where key = 'device_api_token';
  if v_expected_token is null or p_device_token is null
     or p_device_token <> v_expected_token then
    raise exception 'invalid device token' using errcode = '28000';
  end if;

  select * into v_barber from barbers where id = p_barber_id;
  if not found then
    raise exception 'barber not found' using errcode = '02000';
  end if;

  select * into v_shop from shops where id = v_barber.shop_id;
  if not found then
    raise exception 'shop not found' using errcode = '02000';
  end if;

  -- FIFO position — NOTA: incluimos a los tarde-bloqueados en la
  -- numeración porque visualmente aparecen en la lista del TV.
  -- El auto-call los salta vía late_toll_remaining > 0, pero la
  -- posición visual sigue siendo correcta.
  with ranked as (
    select id, row_number() over (order by available_since asc nulls last) as rn
    from barbers
    where shop_id = v_barber.shop_id
      and status = 'available'
      and available_since is not null
  )
  select rn into v_fifo_pos from ranked where id = p_barber_id;

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

  select id, client_name, position into v_called
  from queue_entries
  where barber_id = p_barber_id and status = 'called'
  limit 1;

  select id, client_name, position into v_current
  from queue_entries
  where barber_id = p_barber_id and status = 'in_progress'
  limit 1;

  return jsonb_build_object(
    'barber', jsonb_build_object(
      'id',                     v_barber.id,
      'name',                   v_barber.name,
      'status',                 v_barber.status,
      'breaks_taken_today',     coalesce(v_barber.breaks_taken_today, 0),
      'break_started_at',       v_barber.break_started_at,
      'break_minutes_at_start', v_barber.break_minutes_at_start,
      -- ← NUEVO en 020
      'late_toll_remaining',    coalesce(v_barber.late_toll_remaining, 0)
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

grant execute on function device_get_barber_snapshot(uuid, text) to anon, authenticated;

-- ── 3. State update enganchado con los helpers de peaje ──────
-- Re-crea device_update_barber_state del 017. Cambios vs 017:
--
--   * Available branch:
--     - Detecta si el corte se completó (rowcount del UPDATE de
--       queue_entries) → perform pay_late_arrival_toll(...).
--     - Si v_from_status = 'offline' → perform register_late_arrival.
--     - Auto-call del próximo cliente solo si late_toll_remaining = 0
--       después de los pasos anteriores. Un barbero bloqueado por
--       peaje NO recibe cliente automático.
--
--   * Offline branch:
--     - perform clear_late_arrival_toll antes de retornar.
--
--   * Busy / Break: sin cambios de peaje (peaje persiste en break).
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
  v_cuts_completed int := 0;
  v_current_late_toll smallint := 0;
begin
  -- Auth
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

  -- Idempotent guard
  if v_from_status = p_target then
    return device_get_barber_snapshot(p_barber_id, p_device_token)
           || jsonb_build_object('noop', true);
  end if;

  if p_target = 'available' then
    -- Marcar in_progress como done; capturar rowcount para peaje.
    with completed as (
      update queue_entries
        set status = 'done', completed_at = v_now
        where barber_id = p_barber_id and status = 'in_progress'
        returning 1
    )
    select count(*)::int into v_cuts_completed from completed;

    if v_from_status = 'busy' then
      update queue_entries
        set status = 'done', completed_at = v_now
        where barber_id = p_barber_id and status = 'called';
    end if;

    -- ← NUEVO 020: si se completó al menos 1 corte real, pagar peaje
    if v_cuts_completed > 0 then
      perform pay_late_arrival_toll(p_barber_id);
    end if;

    -- Invalidar reservas de break de peers (sin cambios)
    if v_from_status = 'busy' then
      update barbers
        set break_invalidated = true
        where shop_id = v_barber.shop_id
          and status = 'break'
          and break_invalidated = false
          and break_invalidating_barber_ids @> array[p_barber_id];
    end if;

    -- Restaurar posición held si aplica (sin cambios)
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

    -- ← NUEVO 020: si veníamos de OFFLINE, evaluar y registrar peaje
    if v_from_status = 'offline' then
      perform register_late_arrival(p_barber_id);
    end if;

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

    -- ← NUEVO 020: auto-call SOLO si no está pagando peaje.
    -- Refrescamos late_toll_remaining para captar el state post-register.
    select late_toll_remaining into v_current_late_toll
      from barbers where id = p_barber_id;

    if coalesce(v_current_late_toll, 0) = 0 then
      -- Buscar próximo cliente: específicamente solicitado primero,
      -- luego cualquiera sin asignar.
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
    -- Sin cambios de peaje (peaje persiste en break)
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

    -- ← NUEVO 020: limpiar peaje del que se va Y de los que le debían
    perform clear_late_arrival_toll(p_barber_id);

    insert into activity_log (shop_id, barber_id, action, from_status, to_status, metadata)
    values (
      v_barber.shop_id, p_barber_id, 'state_change', v_from_status, 'offline',
      jsonb_build_object('via', 'device')
    );
  end if;

  return device_get_barber_snapshot(p_barber_id, p_device_token);
end;
$$;

grant execute on function device_update_barber_state(uuid, text, text) to anon, authenticated;
