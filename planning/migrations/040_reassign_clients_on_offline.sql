-- ============================================================
-- NXTUP — Cliente "en el aire" cuando el barbero va offline
-- Run in Supabase SQL Editor
--
-- Bug reportado por Frank después de pruebas en Fade Factory:
-- Mauricio tenía un cliente asignado (called o in_progress), Frank
-- lo pasó a offline manualmente, y el cliente quedó colgado —
-- nadie lo recogió. Razones:
--
--   * `called` con called_at < (now - 2 min) → la cascada del 018
--     eventualmente lo agarra y lo reasigna. Tarda 2 min.
--   * `in_progress` → NINGÚN cron lo agarra. Queda colgado para
--     siempre, apuntando a un barbero offline.
--
-- Esta migración resuelve el caso aplicando la misma lógica del
-- cascade del 018 INMEDIATAMENTE cuando el barbero pasa a offline,
-- sin esperar 2 minutos:
--
--   * Si hay otro barbero `available` (sin peaje) → cliente se
--     reasigna a él (status='called', called_at=now). El nuevo
--     barbero pierde su FIFO position (available_since=null), igual
--     que en un auto-match normal.
--   * Si NO hay barbero disponible → cliente vuelve a `waiting`,
--     sin barbero asignado. El próximo que toque Available lo
--     recoge automáticamente.
--
-- La función `reassign_barber_clients_on_offline` se llama desde
-- TRES puntos donde el barbero pasa a offline:
--
--   1. State route TS (`/api/barbers/[id]/state` PATCH) — dashboard,
--      PWA del barbero, Centro de Mando del owner. Vía RPC.
--
--   2. `device_update_barber_state` SQL — NXT TAPs físicos. Lo
--      llamamos como parte del bloque offline.
--
--   3. `auto_offline_expired_breaks` SQL (migración 028) — cron
--      que offlinea barberos cuyo break expiró. Si el cliente
--      estaba in_progress cuando el barbero se fue a break y
--      nunca volvió, ahora se libera correctamente.
--
-- NO se modifica `auto_offline_idle_barbers` (migración 021) — su
-- caso busy es 3h+ de idle, donde el cliente físicamente ya no
-- existe; el 'done' que aplica actualmente sigue siendo el trato
-- correcto.
-- ============================================================

-- ── 1. Función central: reasignar o liberar ─────────────────────
create or replace function reassign_barber_clients_on_offline(
  p_barber_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_shop_id uuid;
  v_next_barber_id uuid;
  v_now timestamptz := now();
  v_reassigned int := 0;
  v_returned int := 0;
begin
  select shop_id into v_shop_id from barbers where id = p_barber_id;
  if v_shop_id is null then
    return jsonb_build_object('error', 'barber not found');
  end if;

  for rec in
    select id, client_name, position, status as prev_status
      from queue_entries
      where barber_id = p_barber_id
        and status in ('called', 'in_progress')
      order by coalesce(called_at, created_at) asc
  loop
    -- Buscar próximo barbero disponible (mismo criterio que el
    -- cascade del 018 y el auto-match del check-in: available
    -- con FIFO position, sin peaje, ni el que se está yendo).
    select b.id into v_next_barber_id
      from barbers b
      where b.shop_id = v_shop_id
        and b.status = 'available'
        and b.available_since is not null
        and b.id <> p_barber_id
        and coalesce(b.late_toll_remaining, 0) = 0
      order by b.available_since asc
      limit 1;

    if v_next_barber_id is not null then
      -- Reasignar al próximo barbero. Status pasa a 'called' aunque
      -- venga de 'in_progress' — el nuevo barbero verá un cliente
      -- llamado que tiene que aceptar tocando busy.
      update queue_entries
        set barber_id = v_next_barber_id,
            status = 'called',
            called_at = v_now
        where id = rec.id;

      -- Clear FIFO position del nuevo barbero (saca de la cola
      -- de disponibles), igual que cualquier auto-asignación.
      update barbers
        set available_since = null
        where id = v_next_barber_id;

      insert into activity_log (
        shop_id, barber_id, action, metadata
      )
      values (
        v_shop_id,
        v_next_barber_id,
        'client_assigned',
        jsonb_build_object(
          'client_name', rec.client_name,
          'queue_position', rec.position,
          'entry_id', rec.id,
          'via', 'barber_offline_reassign',
          'previous_barber_id', p_barber_id,
          'previous_status', rec.prev_status
        )
      );

      v_reassigned := v_reassigned + 1;
    else
      -- Sin takers: vuelve al pool de waiting.
      update queue_entries
        set status = 'waiting',
            barber_id = null,
            called_at = null
        where id = rec.id;

      insert into activity_log (
        shop_id, barber_id, action, metadata
      )
      values (
        v_shop_id,
        null,
        'no_show_no_takers',
        jsonb_build_object(
          'client_name', rec.client_name,
          'queue_position', rec.position,
          'entry_id', rec.id,
          'previous_barber_id', p_barber_id,
          'previous_status', rec.prev_status,
          'via', 'barber_offline_no_takers'
        )
      );

      v_returned := v_returned + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'reassigned', v_reassigned,
    'returned_to_waiting', v_returned
  );
end;
$$;

grant execute on function reassign_barber_clients_on_offline(uuid)
  to anon, authenticated;

-- ── 2. Update device_update_barber_state (path NXT TAP) ─────────
-- Cambio mínimo respecto a la versión actual (036): llamar la
-- nueva función en el bloque offline ANTES del update del barbero,
-- para que la búsqueda de "otro barbero available" no nos incluya
-- a nosotros mismos accidentalmente (aunque sí lo excluye por id,
-- mejor consistencia).
--
-- El resto del cuerpo es idéntico al de la 036.
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
    update queue_entries
      set status = 'done', completed_at = v_now
      where barber_id = p_barber_id and status = 'in_progress';

    if v_from_status = 'busy' then
      update queue_entries
        set status = 'done', completed_at = v_now
        where barber_id = p_barber_id and status = 'called';
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

    if v_from_status = 'busy' then
      perform pay_late_arrival_toll(p_barber_id);
    end if;

    perform register_late_arrival(p_barber_id);

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
    if v_from_status <> 'available' then
      perform register_late_arrival(p_barber_id);
    end if;

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
    -- ── NUEVO en 040 ─────────────────────────────────────────
    -- ANTES de actualizar al barbero a offline, liberar/reasignar
    -- los clientes que tenía colgados (called o in_progress).
    perform reassign_barber_clients_on_offline(p_barber_id);

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

-- ── 3. Update auto_offline_expired_breaks (cron 028) ────────────
-- Si el cliente in_progress quedó pegado a un barbero que se fue
-- a break y nunca volvió, ahora se libera correctamente cuando
-- el cron lo apague.
create or replace function auto_offline_expired_breaks()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_count integer := 0;
begin
  for rec in
    select b.id,
           b.shop_id,
           b.name,
           b.break_started_at,
           (
             coalesce(
               b.break_minutes_at_start,
               case when coalesce(b.breaks_taken_today, 0) <= 1
                 then s.first_break_minutes
                 else s.next_break_minutes
               end
             ) +
             coalesce(s.break_position_grace_minutes, 5)
           ) as total_allowed_minutes
      from barbers b
      join shops s on s.id = b.shop_id
      where b.status = 'break'
        and b.break_started_at is not null
        and b.break_started_at + make_interval(mins =>
          coalesce(
            b.break_minutes_at_start,
            case when coalesce(b.breaks_taken_today, 0) <= 1
              then s.first_break_minutes
              else s.next_break_minutes
            end
          ) +
          coalesce(s.break_position_grace_minutes, 5)
        ) < v_now
  loop
    -- Reasignar clientes colgados ANTES del update a offline.
    perform reassign_barber_clients_on_offline(rec.id);

    update barbers
      set status = 'offline',
          available_since = null,
          break_started_at = null,
          break_held_since = null,
          break_minutes_at_start = null,
          breaks_taken_today = 0,
          break_invalidating_barber_ids = '{}',
          break_invalidated = false
      where id = rec.id;

    perform clear_late_arrival_toll(rec.id);

    insert into activity_log (
      shop_id, barber_id, action, from_status, to_status, metadata
    )
    values (
      rec.shop_id,
      rec.id,
      'idle_timeout_offline',
      'break',
      'offline',
      jsonb_build_object(
        'reason', 'break_expired',
        'break_started_at', rec.break_started_at,
        'total_allowed_minutes', rec.total_allowed_minutes,
        'minutes_over', round(
          (extract(epoch from (v_now - rec.break_started_at)) / 60
            - rec.total_allowed_minutes)::numeric,
          1
        )
      )
    );

    v_count := v_count + 1;
  end loop;

  return json_build_object(
    'offlined', v_count,
    'ran_at',  v_now
  );
end;
$$;
