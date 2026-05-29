-- ============================================================
-- NXTUP — Centro de Mando: quitar peaje + mover FIFO + default 1
-- Run in Supabase SQL Editor
--
-- Tres cambios coordinados que arman la "primera línea de defensa"
-- del dueño cuando algo sale mal con el peaje o cuando él necesita
-- ajustar la cola manualmente:
--
--   1. Bajar el default de `shops.late_arrival_cuts_required` de 2
--      a 1 (los shops existentes no cambian — solo afecta nuevos).
--      Además, bajar Fade Factory específicamente a 1 ahora mismo
--      para alinear el shop en producción con el nuevo default.
--
--   2. Nueva función SQL `clear_barber_toll(p_barber_id)` para que
--      el dueño pueda quitar la penalidad de un barbero desde el
--      Centro de Mando. Borra todas las filas que involucran al
--      barbero como late_barber_id (deuda hacia los existing) y
--      como existing_barber_id (obligaciones que él tenía hacia
--      otros lates), refresca counters denormalizados de los
--      afectados, e inserta un evento `toll_cleared_by_owner` en
--      activity_log para auditoría.
--
--   3. Nueva función SQL `move_barber_fifo(p_barber_id, p_direction)`
--      para mover un barbero un slot arriba o abajo en la cola FIFO.
--      Solo aplica a barberos en status='available' con
--      late_toll_remaining = 0 — si está pagando peaje no se puede
--      mover (regla del dueño: primero le quitas el peaje, luego lo
--      mueves). Swap del `available_since` con el vecino.
--
-- Las funciones son SECURITY DEFINER pero NO verifican ownership
-- aquí — eso queda en los endpoints API correspondientes que
-- chequean la cookie de auth del dueño antes de llamar la RPC.
--
-- Ref: register_late_arrival, pay_late_arrival_toll, clear_late_
-- arrival_toll de 019/022/027/036.
-- ============================================================

-- ── 1. Bajar default de cuts_required a 1 ──────────────────────
alter table shops
  alter column late_arrival_cuts_required set default 1;

-- ── Backfill manual para Fade Factory ──────────────────────────
-- Por nombre, no por ID hardcoded, para que sea portable a otros
-- entornos donde Fade Factory tenga UUID distinto (ej. staging).
update shops
set late_arrival_cuts_required = 1
where name ilike '%fade%factory%'
  and late_arrival_cuts_required <> 1;

-- ── 2. Bajar el coalesce de register_late_arrival a 1 ─────────
-- Mantiene la lógica del 036 (gate ampliado) intacta. Solo cambia
-- el fallback del default cuando un shop NO tiene cuts_required
-- explícitamente (que no debería pasar, pero por defensiva).
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
  select s.id, s.timezone, s.late_arrival_threshold_time,
         s.late_arrival_cuts_required
    into v_shop_id, v_tz, v_threshold, v_required
    from barbers b
    join shops s on s.id = b.shop_id
    where b.id = p_barber_id;

  if v_shop_id is null then return 0; end if;
  if v_threshold is null then return 0; end if;

  -- Gate ampliado (036): exempt si presencia previa antes del
  -- threshold O ya hubo available hoy.
  select exists (
    select 1 from activity_log
    where barber_id = p_barber_id
      and action = 'state_change'
      and (created_at at time zone v_tz)::date
          = (v_now at time zone v_tz)::date
      and (
        ((created_at at time zone v_tz)::time < v_threshold
         and to_status in ('available', 'busy', 'break'))
        or to_status = 'available'
      )
  ) into v_exempt;

  if v_exempt then
    return 0;
  end if;

  v_local_time := (v_now at time zone v_tz)::time;
  if v_local_time < v_threshold then return 0; end if;

  -- Fallback default ajustado en 037: 1 (antes 2). Solo aplica si
  -- el shop no tiene cuts_required explícitamente seteado, lo cual
  -- no debería pasar después de 019.
  v_required := coalesce(v_required, 1);

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

-- ── 3. clear_barber_toll: el dueño quita la penalidad ──────────
-- Borra todas las filas de late_arrival_toll que involucran a este
-- barbero, tanto como late como existing. Refresca los counters de
-- los lates afectados (aquellos que tenían a este barbero como
-- existing reciben alivio parcial). Inserta un evento en
-- activity_log para auditoría con `released_by = 'owner'` en el
-- metadata — diferente del 'cascade_timeout' del 018 para que el
-- dueño pueda distinguir.
--
-- Retorna JSON con detalle de filas borradas y barberos afectados.
create or replace function clear_barber_toll(p_barber_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id uuid;
  v_affected_late_ids uuid[];
  v_was_late boolean;
  v_rows_as_late integer;
  v_rows_as_existing integer;
begin
  -- Necesitamos el shop_id para el activity_log y para chequear
  -- que el barbero exista.
  select shop_id into v_shop_id
    from barbers
    where id = p_barber_id;

  if v_shop_id is null then
    return jsonb_build_object('error', 'barber not found');
  end if;

  -- Snapshot: ¿este barbero era late él mismo?
  select exists (
    select 1 from late_arrival_toll where late_barber_id = p_barber_id
  ) into v_was_late;

  -- Snapshot: a quiénes les vamos a aflojar (los lates que tenían
  -- a este como existing). Los necesitamos antes de borrar para
  -- refrescar sus counters después.
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from late_arrival_toll
    where existing_barber_id = p_barber_id;

  -- Borrar filas donde este es el late (quita SU peaje)
  delete from late_arrival_toll
    where late_barber_id = p_barber_id;
  get diagnostics v_rows_as_late = row_count;

  -- Borrar filas donde este es el existing (libera a otros lates
  -- que esperaban a este — comportamiento consistente con clear_
  -- late_arrival_toll del 019, pero aquí lo hacemos como gesto
  -- del dueño, no como side effect de ir offline).
  delete from late_arrival_toll
    where existing_barber_id = p_barber_id;
  get diagnostics v_rows_as_existing = row_count;

  -- Reset counter del barbero clearado.
  update barbers set late_toll_remaining = 0 where id = p_barber_id;

  -- Refrescar counters de los lates que esperaban a este.
  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = (
        select count(distinct existing_barber_id)::smallint
        from late_arrival_toll
        where late_barber_id = barbers.id
      )
      where id = any(v_affected_late_ids);
  end if;

  -- Activity log para auditoría.
  insert into activity_log (shop_id, barber_id, action, metadata)
  values (
    v_shop_id,
    p_barber_id,
    'toll_cleared_by_owner',
    jsonb_build_object(
      'was_late',         v_was_late,
      'rows_as_late',     v_rows_as_late,
      'rows_as_existing', v_rows_as_existing,
      'affected_lates',   coalesce(array_length(v_affected_late_ids, 1), 0),
      'released_by',      'owner'
    )
  );

  return jsonb_build_object(
    'rows_as_late',     v_rows_as_late,
    'rows_as_existing', v_rows_as_existing,
    'affected_lates',   coalesce(array_length(v_affected_late_ids, 1), 0)
  );
end;
$$;

grant execute on function clear_barber_toll(uuid) to anon, authenticated;

-- ── 4. move_barber_fifo: el dueño sube o baja un barbero ───────
-- Mueve un barbero un slot en la FIFO. Funciona solo si:
--   * El barbero está en status='available'
--   * No tiene peaje (late_toll_remaining = 0)
--   * Existe un vecino en la dirección pedida
--
-- Mecánica: swap del `available_since` con el vecino. Eso preserva
-- todos los demás barberos en sus posiciones relativas.
--
-- Si el vecino tiene peaje (late_toll_remaining > 0), el move
-- ESTÁ PERMITIDO — el dueño puede pasar un barbero limpio por
-- arriba o por debajo de un late. Solo está bloqueado el move
-- desde el lado del barbero que tiene peaje (si quieres mover un
-- late, primero le quitas el peaje con clear_barber_toll).
--
-- Retorna JSON con detalle del swap (qué barberos intercambiaron
-- y a qué timestamps quedaron).
create or replace function move_barber_fifo(
  p_barber_id uuid,
  p_direction text  -- 'up' o 'down'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id        uuid;
  v_status         text;
  v_toll           smallint;
  v_avail_since    timestamptz;
  v_neighbor_id    uuid;
  v_neighbor_avail timestamptz;
begin
  if p_direction not in ('up', 'down') then
    return jsonb_build_object('error', 'invalid direction');
  end if;

  -- Cargar el barbero target.
  select shop_id, status, late_toll_remaining, available_since
    into v_shop_id, v_status, v_toll, v_avail_since
    from barbers
    where id = p_barber_id;

  if v_shop_id is null then
    return jsonb_build_object('error', 'barber not found');
  end if;

  if v_status <> 'available' then
    return jsonb_build_object(
      'error', 'barber not in available state',
      'current_status', v_status
    );
  end if;

  if v_avail_since is null then
    return jsonb_build_object('error', 'barber has no FIFO position');
  end if;

  if v_toll > 0 then
    return jsonb_build_object(
      'error', 'barber is paying toll — clear it first',
      'toll_remaining', v_toll
    );
  end if;

  -- Encontrar el vecino en la dirección pedida.
  -- "up" = vecino con available_since MÁS VIEJO (el inmediato
  -- arriba) → swap pone a este barbero arriba.
  -- "down" = vecino con available_since MÁS NUEVO (el inmediato
  -- abajo) → swap pone a este barbero abajo.
  if p_direction = 'up' then
    select id, available_since
      into v_neighbor_id, v_neighbor_avail
      from barbers
      where shop_id = v_shop_id
        and status = 'available'
        and available_since is not null
        and available_since < v_avail_since
        and id <> p_barber_id
      order by available_since desc
      limit 1;
  else
    select id, available_since
      into v_neighbor_id, v_neighbor_avail
      from barbers
      where shop_id = v_shop_id
        and status = 'available'
        and available_since is not null
        and available_since > v_avail_since
        and id <> p_barber_id
      order by available_since asc
      limit 1;
  end if;

  if v_neighbor_id is null then
    return jsonb_build_object(
      'error', 'no neighbor in that direction',
      'direction', p_direction
    );
  end if;

  -- Swap atómico de los timestamps.
  update barbers set available_since = v_neighbor_avail where id = p_barber_id;
  update barbers set available_since = v_avail_since    where id = v_neighbor_id;

  -- Activity log para auditoría.
  insert into activity_log (shop_id, barber_id, action, metadata)
  values (
    v_shop_id,
    p_barber_id,
    'fifo_moved_by_owner',
    jsonb_build_object(
      'direction',         p_direction,
      'swapped_with',      v_neighbor_id,
      'old_available_since', v_avail_since,
      'new_available_since', v_neighbor_avail
    )
  );

  return jsonb_build_object(
    'direction',         p_direction,
    'swapped_with',      v_neighbor_id,
    'new_available_since', v_neighbor_avail
  );
end;
$$;

grant execute on function move_barber_fifo(uuid, text) to anon, authenticated;
