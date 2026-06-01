-- ============================================================
-- NXTUP — Peaje: persistencia anti-evasión + fix del bump visual
-- Run in Supabase SQL Editor
--
-- Tres arreglos coordinados a la lógica del late_arrival_toll
-- después del feedback del dueño de Fade Factory:
--
-- ── A) Fix bump visual (Bug crítico que él reporta) ─────────
--
-- Escenario en el shop: 4 barberos en cola + 3 busy + 1 tardío.
-- El tardío debe quedarse abajo de los 7 hasta que cada uno
-- complete UN corte. Visualmente lo que pasa hoy: cuando uno
-- de los 3 busy termina y vuelve a available, el "bump" de
-- 022 lo coloca arriba del tardío SOLO si todavía debe cortes.
-- Como el default ahora es `cuts_required = 1` (migración 037),
-- después de completar su 1 corte la fila se borra y el bump
-- no aplica → el existente cae DEBAJO del tardío. Resultado:
-- el tardío parece subir en la lista sin haber pagado.
--
-- Fix: el bump ya no depende de filas remanentes. Se aplica
-- cuando HAY tardíos en el shop con peaje activo (counter>0).
-- Mientras exista al menos un tardío pagando, cualquier
-- existente que regresa a available cae arriba de él.
--
-- Guardia para no romper la lógica entre múltiples tardíos:
-- si el barbero que paga es ÉL MISMO un tardío en peaje
-- (late_toll_remaining > 0), NO lo bumpeamos — los tardíos
-- entre sí preservan el orden de llegada.
--
-- ── B) Anti-evasión: peaje persiste al offline ──────────────
--
-- Bug detectado: si Luis (tardío) toca offline, clear_late_
-- arrival_toll borraba SUS deudas. Volvía a tocar available
-- y el gate de "no double-charging" de register_late_arrival
-- lo dejaba entrar limpio. Cheat trivial.
--
-- Fix: clear_late_arrival_toll ahora solo borra el lado del
-- EXISTENTE. Cuando un barbero toca offline:
--   * Si era EXISTENTE (le debía cortes a tardíos): sus
--     obligaciones se evaporan (el tardío pierde una espera
--     por él, porque ya no va a hacer cortes).
--   * Si era TARDÍO (debía a su shop): sus deudas PERSISTEN.
--     Cuando vuelva, sigue pagando. Si todos sus existentes
--     ya pagaron mientras estaba afuera, ese counter ya está
--     en 0 y entra limpio — pero eso es justo, sus colegas
--     SÍ trabajaron.
--
-- Las únicas formas de borrar el lado del tardío son:
--   1. Se paga completo (counter llega a 0 por cortes reales)
--   2. El dueño quita la penalidad (clear_barber_toll del 037
--      desde el botón "Quitar penalidad" del Centro de Mando)
--   3. Reset nocturno (parte C de esta misma migración)
--
-- ── C) Reset nocturno incluye peaje ──────────────────────────
--
-- El cron `nightly_state_reset` (migración 013, corre 09:00 UTC)
-- ya cancela queue_entries colgadas y resetea barberos a
-- offline. Pero NO toca late_arrival_toll. Resultado: los
-- peajes de ayer se cargan al día siguiente. Lo extendemos
-- para que también vacíe la tabla y resetee el counter
-- denormalizado.
-- ============================================================


-- ── A) Bump visual fix ────────────────────────────────────────

create or replace function pay_late_arrival_toll(p_existing_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_late_ids  uuid[];
  v_self_in_peaje      boolean;
  v_min_late_available timestamptz;
begin
  -- Step 1: decrementar cuts_remaining para filas donde este barbero
  -- es el existente. Capturar los late_barber_id afectados.
  with decremented as (
    update late_arrival_toll
      set cuts_remaining = cuts_remaining - 1
      where existing_barber_id = p_existing_barber_id
        and cuts_remaining > 0
      returning late_barber_id, cuts_remaining
  )
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from decremented;

  -- Step 2: borrar filas que llegaron a 0 (obligación pagada).
  delete from late_arrival_toll
    where existing_barber_id = p_existing_barber_id
      and cuts_remaining = 0;

  -- Step 3: refrescar counter denormalizado de los tardíos afectados.
  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = (
        select count(distinct existing_barber_id)::smallint
        from late_arrival_toll
        where late_barber_id = barbers.id
      )
      where id = any(v_affected_late_ids);
  end if;

  -- ── Bump del existente arriba del tardío (lógica NUEVA en 044) ──
  --
  -- Cambio clave vs 022: el bump ya no depende de que el existente
  -- TODAVÍA tenga filas con cuts_remaining > 0. Ahora se dispara
  -- por la existencia de tardíos con peaje activo en el shop.
  -- Esto hace que la regla funcione correctamente con
  -- cuts_required = 1 (default actual): después del único corte
  -- del existente, su fila se borra pero seguimos bumpeándolo
  -- arriba mientras el tardío no haya cobrado todas las deudas.
  --
  -- Guardia: si el que paga es ÉL MISMO un tardío con peaje
  -- (late_toll_remaining > 0), no lo bumpeamos por encima de
  -- los otros tardíos. Los tardíos entre sí mantienen su orden
  -- de llegada natural.

  -- ¿El que está pagando está en peaje a su vez?
  select coalesce(late_toll_remaining, 0) > 0
    into v_self_in_peaje
    from barbers
    where id = p_existing_barber_id;

  if not coalesce(v_self_in_peaje, false) then
    -- Buscar el available_since más viejo entre los tardíos del MISMO
    -- shop que aún están pagando peaje. Si existe alguno, bumpeamos
    -- al existente a 1 segundo antes.
    select min(b2.available_since)
      into v_min_late_available
      from barbers b_self
      join barbers b2 on b2.shop_id = b_self.shop_id
      where b_self.id = p_existing_barber_id
        and b2.id <> p_existing_barber_id
        and b2.status = 'available'
        and b2.available_since is not null
        and coalesce(b2.late_toll_remaining, 0) > 0;

    if v_min_late_available is not null then
      update barbers
        set available_since = least(
          available_since,
          v_min_late_available - interval '1 second'
        )
        where id = p_existing_barber_id
          and available_since is not null;
    end if;
  end if;

  return coalesce(array_length(v_affected_late_ids, 1), 0);
end;
$$;

grant execute on function pay_late_arrival_toll(uuid) to anon, authenticated;


-- ── B) Anti-evasión: clear solo el lado del existente ─────────

create or replace function clear_late_arrival_toll(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_late_ids uuid[];
  v_deleted           smallint;
begin
  -- Capturar los tardíos que tenían a este barbero como existente
  -- ANTES del delete, para refrescarles el counter después.
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from late_arrival_toll
    where existing_barber_id = p_barber_id;

  -- ── CAMBIO CRÍTICO en 044 ──────────────────────────────────
  -- Antes borraba AMBOS lados:
  --     WHERE late_barber_id = p_barber_id
  --        OR existing_barber_id = p_barber_id
  -- Ahora SOLO el lado del existente. El lado del tardío persiste
  -- pase lo que pase con el estado del tardío. Esto cierra la
  -- evasión por offline → available.
  --
  -- Si el barbero era un EXISTENTE: sus obligaciones se evaporan
  -- (los tardíos esperando por él quedan parcialmente libres).
  -- Si era TARDÍO: sus deudas se quedan vivas.
  -- Si era ambos (raro): solo limpiamos su lado de existente.
  delete from late_arrival_toll
    where existing_barber_id = p_barber_id;
  get diagnostics v_deleted = row_count;

  -- NO reseteamos barbers.late_toll_remaining = 0 del barbero
  -- mismo (eso lo hacíamos antes porque borrábamos sus filas
  -- como tardío también). Ahora si era tardío, su counter sigue
  -- reflejando los existentes que aún le deben cortes.

  -- Refrescar el counter de los tardíos afectados (los que tenían
  -- a este barbero como existente y ya no).
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

grant execute on function clear_late_arrival_toll(uuid) to anon, authenticated;


-- ── C) Reset nocturno extendido para incluir peaje ────────────

create or replace function nightly_state_reset()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_count    integer;
  reset_count        integer;
  toll_rows_deleted  integer;
  toll_barbers_reset integer;
begin
  -- 1. Cancelar queue entries que nunca llegaron a 'done'.
  update queue_entries
  set status = 'cancelled'
  where status in ('waiting', 'called', 'in_progress');
  get diagnostics cancelled_count = row_count;

  -- 2. Resetear todos los barberos a un estado limpio (offline).
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

  -- 3. NUEVO en 044: limpiar todo el peaje del día anterior.
  -- Hoy es un día nuevo — los peajes de ayer no se cargan.
  -- Esta es una de las 3 únicas formas de borrar el lado del
  -- tardío (las otras: lo paga completo, o el dueño usa el
  -- botón "Quitar penalidad" → clear_barber_toll del 037).
  delete from late_arrival_toll;
  get diagnostics toll_rows_deleted = row_count;

  update barbers
  set late_toll_remaining = 0
  where coalesce(late_toll_remaining, 0) > 0;
  get diagnostics toll_barbers_reset = row_count;

  return json_build_object(
    'cancelled_entries',  cancelled_count,
    'reset_barbers',      reset_count,
    'toll_rows_deleted',  toll_rows_deleted,
    'toll_barbers_reset', toll_barbers_reset,
    'run_at',             now()
  );
end;
$$;

grant execute on function nightly_state_reset() to anon, authenticated;


-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración:
--
-- 1) Las 3 funciones deben quedar redefinidas:
--   select proname
--   from pg_proc
--   where proname in ('pay_late_arrival_toll',
--                     'clear_late_arrival_toll',
--                     'nightly_state_reset');
--   → 3 filas.
--
-- 2) El cron existente sigue activo, sin cambios al schedule:
--   select jobname, schedule, active
--   from cron.job
--   where jobname = 'nxtup-nightly-reset';
--   → 1 fila: active=true, schedule='0 9 * * *'.
--
-- 3) Test manual del bump (en staging, no producción):
--   - Setea late_arrival_threshold_time en un shop a una hora pasada.
--   - Pedro y Carlos toman Available antes del threshold.
--   - Pedro toma un cliente → busy.
--   - Luis toma Available después del threshold → registra peaje.
--     barbers.late_toll_remaining para Luis debe ser 2.
--   - Pedro termina cliente → busy → available.
--     Su available_since debe quedar 1s ANTES del de Luis.
--     Luis.late_toll_remaining debe bajar a 1.
--   - Pedro toca offline.
--     Su lado de existente se borra. Luis.late_toll_remaining → 0.
--     Luis ya entra a la rotación.
--
-- 4) Test manual de la anti-evasión:
--   - Luis tiene peaje activo (late_toll_remaining = 2).
--   - Luis toca offline → sus deudas PERSISTEN en late_arrival_toll.
--   - Luis toca Available → register_late_arrival devuelve 0
--     (gate de no-double-charging), pero los rows viejos siguen.
--     Luis.late_toll_remaining sigue siendo lo que era.
