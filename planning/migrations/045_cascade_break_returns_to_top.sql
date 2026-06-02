-- ============================================================
-- NXTUP — Cascade break: regreso garantizado al #1
-- Run in Supabase SQL Editor
--
-- Bug detectado en producción (test del dueño hoy):
--
--   La migración 041 (`cascade_to_break_not_offline`) seteaba
--   `break_held_since = called_at del cliente colgado` con la
--   asunción de que el barbero negligente era el #1 al momento
--   del cascade — y por tanto called_at lo dejaba arriba de
--   "todos los que se hicieron available después".
--
--   La asunción solo se cumple cuando él era el ÚNICO available
--   al recibir el cliente. En el caso real con varios disponibles,
--   el available_since de los demás (8:00 AM, 8:05 AM, …) es
--   ANTERIOR al called_at del cliente (10:00 AM). Resultado: al
--   regresar del break, el barbero recibe available_since = 10:00
--   pero los demás siguen con 8:00 / 8:05 — pierde el #1.
--
--   Ejemplo concreto del bug:
--     8:00  A tap Available  (FIFO #1)
--     8:05  B tap Available  (FIFO #2)
--     10:00 Cliente llega → asignado a A
--     10:02 Cascade fires → A goes to break, held_since = 10:00
--     10:05 A toca Available (dentro del grace)
--           A.available_since restored to 10:00 (held_since)
--           FIFO: B (8:05) → #1, A (10:00) → #2 ❌
--
-- Política correcta confirmada con el dueño:
--
--   Si un barbero recibe un cliente y no responde en 2 min, va
--   a break. Si toca Available dentro del grace (15 min + grace),
--   debe regresar como #1 — independientemente de quién más esté
--   en la cola. Es la "redención rápida" del cascade-break.
--
--   Para break VOLUNTARIO (el barbero tocó Break él mismo) NO
--   aplica este fix. Ese flujo usa el `available_since` previo del
--   barbero, que ya conserva el orden FIFO correcto.
--
-- Fix: calcular `v_held_since` dinámicamente como
-- (MIN(available_since de los demás barberos available en el shop)
-- - 1 segundo). Eso garantiza que al regresar quede arriba de
-- cualquiera. Fallback si no hay otros disponibles: called_at - 1h.
--
-- Cero impacto en lo demás:
--   * El flujo de cascade-reassignment al próximo barbero queda igual.
--   * El activity_log mantiene el shape (solo cambia el valor de
--     break_held_since en el metadata).
--   * El state endpoint cuando un barbero vuelve de break →
--     available NO se toca — ya lee break_held_since como
--     nextAvailableSince correctamente.
--   * Break voluntario sigue funcionando exactamente igual.
-- ============================================================

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
  v_held_since timestamptz;
  v_oldest_other_available timestamptz;
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
      and e.called_at < v_now - interval '120 seconds'
    order by e.called_at asc
  loop
    -- ── 1. Send barber to break (15 min) instead of offline ───
    --
    -- ── CAMBIO EN 045 ─────────────────────────────────────────
    -- break_held_since se calcula como (MIN(available_since de
    -- los otros barberos available en este shop) - 1s) para
    -- garantizar que el barbero regrese como #1 si toca Available
    -- dentro del grace. Si no hay nadie más disponible, fallback
    -- a called_at - 1 hora.
    --
    -- Antes de 045 era simplemente `rec.called_at`, lo cual fallaba
    -- cuando había otros barberos cuyo available_since era ANTERIOR
    -- al called_at (caso común de mañana abierta).
    select min(b2.available_since)
      into v_oldest_other_available
      from barbers b2
      where b2.shop_id = rec.shop_id
        and b2.id <> rec.negligent_barber_id
        and b2.status = 'available'
        and b2.available_since is not null;

    v_held_since := coalesce(
      v_oldest_other_available - interval '1 second',
      rec.called_at - interval '1 hour'
    );

    update barbers
    set status = 'break',
        available_since = null,
        break_started_at = v_now,
        break_held_since = v_held_since,
        break_minutes_at_start = 15,
        -- breaks_taken_today NO se incrementa — break impuesto
        -- por el sistema, no cuenta contra la quota diaria.
        break_invalidating_barber_ids = '{}',
        break_invalidated = false
    where id = rec.negligent_barber_id;

    insert into activity_log (
      shop_id, barber_id, action, from_status, to_status, metadata
    )
    values (
      rec.shop_id,
      rec.negligent_barber_id,
      'no_show',
      null,
      'break',
      jsonb_build_object(
        'entry_id', rec.entry_id,
        'client_name', rec.client_name,
        'queue_position', rec.queue_position,
        'called_at', rec.called_at,
        'seconds_elapsed', round(extract(epoch from (v_now - rec.called_at))::numeric, 1),
        'released_by', 'cascade_timeout',
        'threshold_seconds', 120,
        'sent_to', 'break_15min',
        'break_held_since', v_held_since,
        'break_minutes_at_start', 15,
        -- Metadata adicional para auditar el cálculo del 045.
        'oldest_other_available', v_oldest_other_available,
        'held_since_strategy',
          case
            when v_oldest_other_available is not null then 'min_other_minus_1s'
            else 'called_at_minus_1h_fallback'
          end
      )
    );

    -- ── 2. Cascade the client to next available barber ────────
    -- Igual que antes — el cliente NO sufre por el no-show del
    -- barbero. Si nadie disponible, vuelve a waiting.
    select b.id
      into v_next_barber_id
      from barbers b
      where b.shop_id = rec.shop_id
        and b.status = 'available'
        and b.available_since is not null
        and b.id <> rec.negligent_barber_id
      order by b.available_since asc
      limit 1;

    if v_next_barber_id is not null then
      -- 2a. Cascade: reassign the entry to next barber
      update queue_entries
      set barber_id = v_next_barber_id,
          called_at = v_now  -- reset the clock for the new barber
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
      -- 2b. No takers: send entry back to waiting pool
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
    'cascaded',           v_cascaded_count,
    'returned_to_waiting', v_returned_to_waiting_count,
    'ran_at',             v_now
  );
end;
$$;

-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración:
--
-- 1) Función redefinida:
--   select pg_get_functiondef(oid)
--   from pg_proc
--   where proname = 'cascade_no_show_called_entries';
--   El cuerpo debe incluir la query nueva con `min(b2.available_since)`.
--
-- 2) El cron sigue activo sin cambios:
--   select jobname, schedule, active
--   from cron.job
--   where jobname = 'nxtup-cascade-no-show';
--   → 1 fila: active=true, schedule='10 seconds'.
--
-- 3) Test manual:
--   - Shop con 2+ barberos. A available desde la mañana, B available
--     desde la mañana después de A. A es #1, B es #2.
--   - Llega cliente → asignado a A. A.available_since = null.
--   - Espera 2+ minutos sin que A toque Busy. Cron de cascade
--     dispara. A → break, break_held_since = (B.available_since - 1s).
--   - A toca Available dentro del grace.
--   - A.available_since se restaura a (B.available_since - 1s).
--   - FIFO: A → #1, B → #2. ✓
--
-- 4) Auditoría: las nuevas keys en metadata de activity_log
--   (`oldest_other_available`, `held_since_strategy`) permiten
--   ver post-mortem qué cálculo se aplicó en cada cascade.
