-- ============================================================
-- NXTUP — Fix: pay_late_arrival_toll mantiene al existente arriba
-- Run in Supabase SQL Editor (después de 019)
--
-- Bug detectado en operación:
--
--   Mauricio (existing) completa el corte 1 de 2 que le debe a
--   Pascual (late). El state route le setea available_since=now(),
--   que es DESPUÉS del available_since de Pascual. Como la FIFO se
--   ordena por available_since asc, Mauricio aparece visualmente
--   POR DEBAJO de Pascual en el TV — al revés de la regla:
--
--     "Cada existente debe completar 2 cortes para CAER debajo
--      del tarde. Mientras le deba, sigue arriba."
--
-- Fix: en pay_late_arrival_toll, después del decremento, si el
-- existente todavía debe a uno o más tardes, le bajamos el
-- available_since a (min(late.available_since) - 1s) para que la
-- FIFO lo mantenga arriba de ese late.
--
-- Cuando complete TODOS sus cortes (fila se borra, no debe nada),
-- la próxima transición busy→available no aplica el ajuste y su
-- available_since=now() lo deja naturalmente debajo. Correcto.
--
-- Edge case: si el existente ya estaba con available_since más
-- antiguo que el late (caso normal pre-cut), no lo movemos
-- (LEAST() preserva el más viejo).
-- ============================================================

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
  -- Step 1: decrementar cuts_remaining para las filas donde este
  -- barbero es el existente, y capturar a quiénes afectamos.
  with decremented as (
    update late_arrival_toll
      set cuts_remaining = cuts_remaining - 1
      where existing_barber_id = p_existing_barber_id
        and cuts_remaining > 0
      returning late_barber_id, cuts_remaining
  )
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from decremented;

  -- Step 2: borrar filas que llegaron a 0.
  delete from late_arrival_toll
    where existing_barber_id = p_existing_barber_id
      and cuts_remaining = 0;

  -- Step 3: refrescar el counter denormalizado de los tardes
  -- afectados (algunos pueden haber bajado a 0 = sin peaje).
  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = (
        select count(distinct existing_barber_id)::smallint
        from late_arrival_toll
        where late_barber_id = barbers.id
      )
      where id = any(v_affected_late_ids);
  end if;

  -- ── NUEVO en 022: mantener al existente arriba de los tardes ──
  --
  -- Si este barbero TODAVÍA debe cortes a uno o más tardes,
  -- bajamos su available_since al (min de los tardes que aún le
  -- debe) menos 1 segundo. Eso lo mantiene arriba de esos tardes
  -- en la FIFO visual hasta que termine su 2do corte.
  --
  -- LEAST() asegura que NO movemos hacia adelante (más reciente)
  -- accidentalmente — solo hacia atrás. Si ya estaba más viejo
  -- que el late (caso normal mañanero), preservamos el original.
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

grant execute on function pay_late_arrival_toll(uuid) to anon, authenticated;
