-- ============================================================
-- NXTUP — Fix: relajar el CHECK de cuts_remaining a >= 0
-- Run in Supabase SQL Editor
--
-- Bug detectado en producción:
--
--   La tabla late_arrival_toll tiene un CHECK (cuts_remaining > 0).
--   Cuando pay_late_arrival_toll trata de decrementar una fila de 1
--   a 0 (segundo corte del barbero existente), Postgres rechaza el
--   UPDATE porque 0 viola el CHECK > 0. La transacción aborta y el
--   DELETE que viene después (que iba a borrar las filas en 0)
--   tampoco corre. Resultado: la fila queda atascada en 1, y
--   sucesivos pay() también fallan al intentar bajar de 1 a 0.
--
-- Síntoma visible: el counter de Pascual nunca llegaba a 0 por
-- más ciclos que hicieras — siempre quedaba al menos 1 fila viva
-- con cuts_remaining=1.
--
-- Fix: relajar el constraint a >= 0. La función pay() ya borra las
-- filas que llegan a 0 INMEDIATAMENTE después del UPDATE en la
-- misma transacción, así que 0 es un estado transitorio válido.
-- ============================================================

alter table late_arrival_toll
  drop constraint if exists late_arrival_toll_cuts_remaining_check;

alter table late_arrival_toll
  add constraint late_arrival_toll_cuts_remaining_check
    check (cuts_remaining >= 0);

-- Backfill defensivo: por si quedaron filas en estados inconsistentes
-- del intento fallido (todas deberían tener cuts_remaining > 0 en
-- realidad, pero limpiamos por si acaso).
delete from late_arrival_toll where cuts_remaining <= 0;

-- Recompute counters por si la inconsistencia dejó valores stale.
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
