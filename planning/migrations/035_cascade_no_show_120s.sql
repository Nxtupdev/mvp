-- ============================================================
-- NXTUP — Cascade no-show threshold: 90s → 120s
-- Run in Supabase SQL Editor
--
-- Frank ajustó la regla después de probarla en Fade Factory:
-- 90 segundos era demasiado agresivo, el barbero a veces tarda
-- ese tanto en levantarse de su silla a saludar al próximo
-- cliente. Subimos el threshold a 2 minutos (120 segundos),
-- que es más realista sin diluir la regla.
--
-- Cambios:
--   * Función `cascade_no_show_called_entries`: el threshold
--     interno pasa de `interval '90 seconds'` a
--     `interval '120 seconds'`, y el metadata `threshold_seconds`
--     del activity_log pasa de 90 a 120 para que las herramientas
--     downstream lo reflejen.
--   * Cron `nxtup-cascade-no-show`: se re-registra con el mismo
--     tick de 30 segundos (latencia máxima desde "called_at" hasta
--     cascada = 120s + 30s = 150s).
--
-- Idempotente: la función usa CREATE OR REPLACE; el cron se
-- desregistra (silencioso si no existe) y se vuelve a crear.
--
-- Contexto previo:
--   * Migration 018 introdujo la regla original a 90s.
--   * Esta migración 035 solo ajusta los números — la lógica
--     de cascada (offline + reasignar / vuelta a waiting) se
--     mantiene igual.
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
    order by e.called_at asc  -- oldest first
  loop
    -- ── 1. Offline the negligent barber (full reset) ──────────
    update barbers
    set status = 'offline',
        available_since = null,
        break_started_at = null,
        break_held_since = null,
        break_minutes_at_start = null,
        breaks_taken_today = 0,
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
      null,  -- from_status unknown; could be available/break/offline by now
      'offline',
      jsonb_build_object(
        'entry_id', rec.entry_id,
        'client_name', rec.client_name,
        'queue_position', rec.queue_position,
        'called_at', rec.called_at,
        'seconds_elapsed', round(extract(epoch from (v_now - rec.called_at))::numeric, 1),
        'released_by', 'cascade_timeout',
        'threshold_seconds', 120
      )
    );

    -- ── 2. Find next available barber (FIFO order) ────────────
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
      -- ── 3a. Cascade: reassign the entry to next barber ──────
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
      -- ── 3b. No takers: send entry back to waiting pool ──────
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

-- ── Re-schedule the cron (tick: 30s, sin cambios) ───────────────
-- Idempotente: desregistra si existe, luego crea. Si la 018 original
-- nunca dejó el cron registrado (vimos esto en el diagnóstico de
-- Frank), igual queda en buen estado después de esta migración.
do $$
begin
  perform cron.unschedule('nxtup-cascade-no-show');
exception when others then
  null;  -- job didn't exist, nothing to undo
end $$;

select cron.schedule(
  'nxtup-cascade-no-show',
  '30 seconds',
  $$ select public.cascade_no_show_called_entries(); $$
);

-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración:
--
--   select jobname, schedule, active
--   from cron.job
--   where jobname = 'nxtup-cascade-no-show';
--
-- Debe devolver 1 fila: active=true, schedule='30 seconds'.
