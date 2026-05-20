-- ============================================================
-- NXTUP — Pay toll on ANY busy → active (no queue_entry needed)
-- Run in Supabase SQL Editor (después de 022)
--
-- Diseño original (020): pay_late_arrival_toll solo se llamaba si
-- la transición BUSY→AVAILABLE marcó un queue_entry de in_progress
-- → done. La razón era anti-gaming.
--
-- Bug en operación real: la gran mayoría de los clientes en DR/USA
-- entran walk-in sin pasar por QR ni kiosko. El barbero toca BUSY
-- al empezar y ACTIVE al terminar, queue_entries nunca se mueve.
-- Bajo la regla vieja, el peaje nunca se decrementa — el barbero
-- tarde queda bloqueado para siempre.
--
-- Revisión: cualquier BUSY → AVAILABLE cuenta como 1 corte.
-- Gaming no es preocupación real porque:
--
--   * Los existentes NO tienen incentivo de pagar peaje rápido.
--     Al revés: quieren mantener al tarde bloqueado para tener más
--     turnos para sí mismos.
--
--   * El tarde no puede pagar su propio peaje. pay_late_arrival_toll
--     decrementa filas donde el barbero es existing_barber_id; el
--     tarde es late_barber_id en sus propias filas.
--
-- Esta migración re-crea device_update_barber_state cambiando la
-- guardia. Todo el resto del cuerpo de la función queda idéntico.
-- ============================================================

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
  v_current_late_toll smallint := 0;
begin
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

  if v_from_status = p_target then
    return device_get_barber_snapshot(p_barber_id, p_device_token)
           || jsonb_build_object('noop', true);
  end if;

  if p_target = 'available' then
    -- Cleanup de in_progress y called (si veníamos de busy). Ya no
    -- usamos el rowcount como gate del pay — ver comentario abajo.
    update queue_entries
      set status = 'done', completed_at = v_now
      where barber_id = p_barber_id and status = 'in_progress';

    if v_from_status = 'busy' then
      update queue_entries
        set status = 'done', completed_at = v_now
        where barber_id = p_barber_id and status = 'called';
    end if;

    -- ── Pay late-arrival toll (revisado en 023) ──────────────
    -- Cualquier BUSY → AVAILABLE cuenta como 1 corte, sin importar
    -- si había queue_entry o no. Walk-ins sin check-in son el caso
    -- común en operación real, y bajo la regla vieja el peaje
    -- nunca decrementaba.
    if v_from_status = 'busy' then
      perform pay_late_arrival_toll(p_barber_id);
    end if;

    if v_from_status = 'busy' then
      update barbers
        set break_invalidated = true
        where shop_id = v_barber.shop_id
          and status = 'break'
          and break_invalidated = false
          and break_invalidating_barber_ids @> array[p_barber_id];
    end if;

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

    select late_toll_remaining into v_current_late_toll
      from barbers where id = p_barber_id;

    if coalesce(v_current_late_toll, 0) = 0 then
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
