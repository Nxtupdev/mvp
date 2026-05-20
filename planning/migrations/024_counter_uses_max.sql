-- ============================================================
-- NXTUP — Counter del peaje usa MAX(cuts_remaining)
-- Run in Supabase SQL Editor (después de 023)
--
-- Cambio de semántica en barbers.late_toll_remaining:
--
--   Antes (019/022): count(distinct existing_barber_id) — el
--   counter mostraba CUÁNTOS barberos existentes todavía debían
--   cortes. Bajaba solo cuando uno se quedaba completamente al día.
--
--   Ahora (024): max(cuts_remaining) — el counter muestra
--   CUÁNTAS RONDAS de cortes faltan para que el más lento termine.
--   Baja conforme todos avanzan parejo.
--
-- Ejemplo con 2 existentes (Pantalla y Mauricio) y 2 cortes c/u:
--
--   Inicial:        Pantalla=2, Mauricio=2  →  counter = 2
--   1 corte c/u:    Pantalla=1, Mauricio=1  →  counter = 1
--   2 cortes c/u:   (filas borradas)        →  counter = 0 (verde)
--
-- Ventaja del modelo MAX: cuando ambos avanzan al mismo ritmo, el
-- counter baja en cada ronda — más intuitivo para el barbero
-- tarde y para el dueño viendo el live.
--
-- Caso asimétrico (uno termina antes que el otro): el counter
-- queda anclado al más lento. Si Pantalla termina sus 2 cortes
-- mientras Mauricio sigue debiendo 2, counter = 2 (lo que falta
-- a Mauricio). Es correcto — "te falta tanto como al más lento".
--
-- También actualiza pay_late_arrival_toll y clear_late_arrival_
-- toll porque ambos hacen el recompute inline.
--
-- Al final hace un backfill para alinear el valor actual de
-- todos los barberos con la nueva fórmula.
-- ============================================================

-- ── 1. recompute_late_toll usa MAX ──────────────────────────
create or replace function recompute_late_toll(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max smallint;
begin
  select max(cuts_remaining)::smallint
    into v_max
    from late_arrival_toll
    where late_barber_id = p_barber_id;
  update barbers set late_toll_remaining = coalesce(v_max, 0)
    where id = p_barber_id;
  return coalesce(v_max, 0);
end;
$$;

-- ── 2. pay_late_arrival_toll usa MAX en su recompute inline ──
-- Re-creada completa para no depender de la versión previa. El
-- bump al available_since (de la 022) se conserva.
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

  -- Recompute usando MAX en vez de COUNT(distinct).
  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = coalesce(
        (
          select max(cuts_remaining)::smallint
          from late_arrival_toll
          where late_barber_id = barbers.id
        ),
        0
      )
      where id = any(v_affected_late_ids);
  end if;

  -- Bump del available_since para mantener al existente arriba
  -- del tarde mientras le siga debiendo (del fix de la 022).
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

-- ── 3. clear_late_arrival_toll usa MAX en su recompute inline ──
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
      set late_toll_remaining = coalesce(
        (
          select max(cuts_remaining)::smallint
          from late_arrival_toll
          where late_barber_id = barbers.id
        ),
        0
      )
      where id = any(v_affected_late_ids);
  end if;

  return v_deleted;
end;
$$;

-- ── 4. Backfill: alinear todos los counters al MAX actual ────
update barbers
set late_toll_remaining = coalesce(
  (
    select max(cuts_remaining)::smallint
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
