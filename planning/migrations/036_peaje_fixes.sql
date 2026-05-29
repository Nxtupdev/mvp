-- ============================================================
-- NXTUP — Peaje: tres fixes después de operación real en Fade Factory
-- Run in Supabase SQL Editor
--
-- Issues reportados por Frank después de varios días de operación
-- con el sistema de peaje vivo en Fade Factory:
--
--   1. El peaje persistía entre días. Un barbero con
--      late_toll_remaining > 0 al cerrar la barbería seguía con
--      el counter al día siguiente. Cuando tocaba available a la
--      mañana siguiente (antes del threshold), `register_late_arrival`
--      correctamente NO creaba peaje nuevo, pero las filas viejas
--      en late_arrival_toll seguían y el counter denormalizado
--      seguía con valor stale → barbero bloqueado sin razón.
--
--   2. Príncipe entró a las 10:56 con offline→busy (atendiendo
--      walk-in directo, sin pasar por available). A las 12:xx
--      tocó available. El threshold del shop es ~mediodía. El gate
--      `v_already_active_today` solo buscaba state_change a
--      `to_status='available'` ANTES de hoy, así que Príncipe no
--      quedaba exento → se le aplicó peaje incorrectamente. Pero
--      él ya estaba PRESENTE en el shop antes del threshold (tocó
--      busy a las 10:56, claramente llegó a tiempo).
--
--   3. El fix del hack offline→busy→available (que hicimos en el
--      commit 7c2cb11 del TS state route) NO se replicó al SQL
--      `device_update_barber_state` que usan los NXT TAPs físicos.
--      Si los barberos usan los devices físicos, el hack original
--      sigue abierto por ese path.
--
-- Esta migración resuelve los tres:
--
--   A) Update `nightly_state_reset` para limpiar también las
--      filas de late_arrival_toll y resetear el counter
--      denormalizado late_toll_remaining a 0.
--
--   B) Update `register_late_arrival` con el gate ampliado:
--      el barbero queda exento del peaje si:
--        * Ya hubo CUALQUIER state_change a 'available'/'busy'/
--          'break' HOY ANTES del threshold (= estaba presente en
--          el shop antes que aplicara la regla), O
--        * Ya hubo state_change a 'available' HOY a cualquier
--          hora (regla original del 031 — exenta vueltas de
--          break después de haber sido available).
--
--   C) Update `device_update_barber_state` con el mismo fix que
--      aplicamos al TS state route: llamar `register_late_arrival`
--      en TODAS las transiciones a available (no solo desde
--      offline) y también en busy desde offline. Los gates del
--      SQL function se encargan de no crear peajes espurios.
-- ============================================================

-- ============================================================
-- A) nightly_state_reset: limpiar peaje al final del día
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
  toll_deleted_count integer;
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

  -- 3. NUEVO en 036: limpiar peaje completo.
  -- Sin esto, las filas y el counter sobreviven al cierre del día
  -- y al día siguiente el barbero queda bloqueado sin que se haya
  -- "ganado" un peaje nuevo. Las filas viejas son del día anterior
  -- y para ese caso ya no tienen sentido (el peaje se "resuelve"
  -- en el día en curso, no se hereda).
  delete from late_arrival_toll;
  get diagnostics toll_deleted_count = row_count;

  -- Defensivo: garantizar que el counter denormalizado quede en 0
  -- aunque alguna fila quedara en late_arrival_toll por race
  -- condition o ALL DELETE no haya disparado.
  update barbers
  set late_toll_remaining = 0
  where late_toll_remaining > 0;

  return json_build_object(
    'cancelled_entries',   cancelled_count,
    'reset_barbers',       reset_count,
    'toll_rows_cleared',   toll_deleted_count,
    'run_at',              now()
  );
end;
$$;

-- ============================================================
-- B) register_late_arrival: exempt si llegó a tiempo
-- ============================================================

create or replace function register_late_arrival(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id      uuid;
  v_tz           text;
  v_threshold    time;
  v_required     smallint;
  v_now          timestamptz := now();
  v_local_time   time;
  v_inserted     smallint := 0;
  v_exempt       boolean;
begin
  -- Cargar config de la tienda
  select s.id, s.timezone, s.late_arrival_threshold_time,
         s.late_arrival_cuts_required
    into v_shop_id, v_tz, v_threshold, v_required
    from barbers b
    join shops s on s.id = b.shop_id
    where b.id = p_barber_id;

  if v_shop_id is null then return 0; end if;
  if v_threshold is null then return 0; end if;

  -- ── Gate ampliado en 036 ───────────────────────────────────
  -- Antes (031): solo `to_status = 'available'` exentaba. Eso dejaba
  -- afuera al caso de Príncipe (entró a busy antes del threshold sin
  -- tocar available primero).
  --
  -- Ahora el barbero queda EXENTO del peaje si CUALQUIERA de estos
  -- dos casos aplica:
  --
  --   1. Tuvo una transición a 'available'/'busy'/'break' HOY
  --      ANTES del threshold. Eso indica que estaba presente en
  --      el shop a tiempo, sin importar qué botón tocó primero.
  --
  --   2. Tuvo una transición a 'available' HOY a cualquier hora
  --      (regla original del 031, sigue vigente): exenta vueltas
  --      de break después de haber sido available aunque sea
  --      tarde — el peaje es por LLEGADA, no por estado actual.
  --
  -- Importante: este check corre ANTES de que el state route
  -- inserte el activity_log de la transición ACTUAL, así que solo
  -- considera state_changes PREVIOS de hoy.
  select exists (
    select 1 from activity_log
    where barber_id = p_barber_id
      and action = 'state_change'
      and (created_at at time zone v_tz)::date
          = (v_now at time zone v_tz)::date
      and (
        -- Caso 1: presencia previa antes del threshold
        ((created_at at time zone v_tz)::time < v_threshold
         and to_status in ('available', 'busy', 'break'))
        -- Caso 2: ya hubo available hoy
        or to_status = 'available'
      )
  ) into v_exempt;

  if v_exempt then
    return 0;
  end if;

  -- Hora local actual vs threshold
  v_local_time := (v_now at time zone v_tz)::time;
  if v_local_time < v_threshold then return 0; end if;

  v_required := coalesce(v_required, 2);

  -- Crear filas de peaje, una por barbero existente (active o busy)
  insert into late_arrival_toll
    (late_barber_id, existing_barber_id, shop_id, cuts_remaining)
  select p_barber_id, b.id, v_shop_id, v_required
    from barbers b
    where b.shop_id = v_shop_id
      and b.id <> p_barber_id
      and b.status in ('available', 'busy')
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  perform recompute_late_toll(p_barber_id);

  return v_inserted;
end;
$$;

-- ============================================================
-- C) device_update_barber_state: cerrar hack offline→busy→active
--    en el path del NXT TAP físico
-- ============================================================
--
-- Cambios respecto a la versión del 027 (delta mínimo):
--
--   * Cuando p_target = 'available', llamar register_late_arrival
--     SIEMPRE (no solo si v_from_status = 'offline'). El gate del
--     SQL function (ampliado en B arriba) se encarga de no crear
--     peajes espurios en transiciones legítimas.
--
--   * Cuando p_target = 'busy' Y v_from_status != 'available',
--     también llamar register_late_arrival. Cubre el caso del
--     barbero que llega tarde y toca busy directo (atendiendo
--     walk-in) sin pasar nunca por available.
--
-- El resto del cuerpo de la función queda idéntico a la 027.
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
    -- Cleanup queue_entries.
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

    -- ── Register late arrival — fix 036: llamar SIEMPRE ─────────
    -- Antes (027): solo si v_from_status = 'offline'. Eso dejaba
    -- el hack offline→busy→available abierto en el path del
    -- device. El gate ampliado de register_late_arrival (sección B
    -- de esta migración) se encarga de no crear peajes espurios
    -- en transiciones legítimas (vueltas de break, busy→available
    -- mid-day, etc).
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
    -- ── NUEVO en 036: cerrar el hack offline→busy directo ──────
    -- Si el barbero pasa a busy desde algo que NO es available,
    -- chequeamos también el peaje. Esto cubre el caso del barbero
    -- que llega tarde y toca busy directo (atendiendo walk-in)
    -- sin pasar nunca por available — bajo la versión del 027
    -- el peaje nunca se evaluaba.
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

-- ── Cleanup defensivo del estado actual (Fade Factory) ─────────
-- Por si quedaron peajes acumulados de los días anteriores debido al
-- bug del issue 1. Borra todas las filas y resetea el counter, así
-- la próxima jornada empieza limpia. Inofensivo si la tabla está
-- vacía. CORRER SOLO UNA VEZ — los registros de peajes a partir de
-- ahora se manejan correctamente por el nightly_state_reset
-- actualizado.
delete from late_arrival_toll;
update barbers set late_toll_remaining = 0 where late_toll_remaining > 0;
