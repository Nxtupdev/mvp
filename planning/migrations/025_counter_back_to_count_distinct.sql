-- ============================================================
-- NXTUP — Counter del peaje vuelve a COUNT(distinct)
-- Run in Supabase SQL Editor (después de 024)
--
-- Revertimos la 024. Después de aclarar la regla con el dueño:
--
--   El counter representa "barberos anteriores que todavía no
--   han TERMINADO sus 2 cortes". Decrementa solo cuando uno de
--   ellos completa su 2do corte (su fila se borra), no en cada
--   corte individual.
--
-- Ejemplo con 2 anteriores (Pantalla y Mauricio) y 2 cortes c/u:
--
--   Inicial:           ambos sin cortes hechos  →  counter = 2
--   Pantalla 1er corte: ambos siguen pendientes  →  counter = 2
--   Mauricio 1er corte: ambos siguen pendientes  →  counter = 2
--   Pantalla 2do corte: Pantalla terminó, baja   →  counter = 1
--   Mauricio 2do corte: Mauricio también baja    →  counter = 0 (verde)
--
-- Equivalente a COUNT(distinct existing_barber_id) sobre las
-- filas activas del peaje. Si la fila existe, ese barbero
-- todavía está "arriba" del tarde.
--
-- Re-crea las 3 funciones afectadas y hace backfill al final.
-- ============================================================

-- ── 1. recompute_late_toll vuelve a COUNT(distinct) ─────────
create or replace function recompute_late_toll(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count smallint;
begin
  select count(distinct existing_barber_id)::smallint
    into v_count
    from late_arrival_toll
    where late_barber_id = p_barber_id;
  update barbers set late_toll_remaining = coalesce(v_count, 0)
    where id = p_barber_id;
  return coalesce(v_count, 0);
end;
$$;

-- ── 2. pay_late_arrival_toll vuelve a COUNT(distinct) ───────
create or replace function pay_late_arrival_toll(p_existing_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_late_ids   uuid[];
  v_min_late_available  timestamptz;
begin
  with decremented as (
    update late_arrival_toll
      set cuts_remaining = cuts_remaining - 1
      where existing_barber_id = p_existing_barber_id
        and cuts_remaining > 0
      returning late_barber_id, cuts_remaining
  )
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from decremented;

  delete from late_arrival_toll
    where existing_barber_id = p_existing_barber_id
      and cuts_remaining = 0;

  -- Recompute usando COUNT(distinct) — "barberos anteriores
  -- que todavía no terminan sus N cortes".
  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = (
        select count(distinct existing_barber_id)::smallint
        from late_arrival_toll
        where late_barber_id = barbers.id
      )
      where id = any(v_affected_late_ids);
  end if;

  -- Bump del available_since (preservado del fix de 022).
  select min(b2.available_since) into v_min_late_available
    from late_arrival_toll t
    join barbers b2 on b2.id = t.late_barber_id
    where t.existing_barber_id = p_existing_barber_id
      and t.cuts_remaining > 0
      and b2.available_since is not null;

  if v_min_late_available is not null then
    update barbers
      set available_since = least(
        available_since,
        v_min_late_available - interval '1 second'
      )
      where id = p_existing_barber_id
        and available_since is not null;
  end if;

  return coalesce(array_length(v_affected_late_ids, 1), 0);
end;
$$;

-- ── 3. clear_late_arrival_toll vuelve a COUNT(distinct) ─────
create or replace function clear_late_arrival_toll(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_late_ids uuid[];
  v_deleted          smallint;
begin
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from late_arrival_toll
    where existing_barber_id = p_barber_id;

  delete from late_arrival_toll
    where late_barber_id = p_barber_id
       or existing_barber_id = p_barber_id;
  get diagnostics v_deleted = row_count;

  update barbers set late_toll_remaining = 0 where id = p_barber_id;

  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = (
        select count(distinct existing_barber_id)::smallint
        from late_arrival_toll
        where late_barber_id = barbers.id
      )
      where id = any(v_affected_late_ids);
  end if;

  return v_deleted;
end;
$$;

-- ── 4. Backfill: alinear todos los counters al nuevo modelo ──
update barbers
set late_toll_remaining = coalesce(
  (
    select count(distinct existing_barber_id)::smallint
    from late_arrival_toll
    where late_barber_id = barbers.id
  ),
  0
)
where exists (
  select 1 from late_arrival_toll where late_barber_id = barbers.id
)
   or late_toll_remaining > 0;

grant execute on function recompute_late_toll(uuid)     to anon, authenticated;
grant execute on function pay_late_arrival_toll(uuid)   to anon, authenticated;
grant execute on function clear_late_arrival_toll(uuid) to anon, authenticated;
