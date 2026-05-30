-- ============================================================
-- NXTUP — Cascade no-show: enviar a break 15 min, no offline
-- Run in Supabase SQL Editor
--
-- Cambio de política reportado por Frank después de operación real:
--
--   El barbero puede no responder al cliente en 2 min por razones
--   legítimas — fue al baño, está cobrándole a otro, está sirviendo
--   un café. Mandarlo a OFFLINE inmediatamente (que le hace perder
--   su posición FIFO) es muy duro: el barbero estaba en la
--   barbería, solo no escuchó al cliente.
--
--   Política nueva:
--     1. Al expirar los 2 min sin respuesta → barbero pasa a BREAK
--        de 15 min con su posición FIFO retenida (break_held_since).
--     2. Si toca AVAILABLE dentro de los 15 min → vuelve a su
--        posición original (lo cual ya hace el flujo normal de
--        break en el state route).
--     3. Si NO toca AVAILABLE en 15 min → el cron 028
--        `auto_offline_expired_breaks` lo manda a offline
--        (definitivo, pierde posición). Eso ya está implementado.
--
-- Cambios en `cascade_no_show_called_entries`:
--
--   * status pasa de 'offline' a 'break'
--   * break_started_at = now()
--   * break_minutes_at_start = 15
--   * break_held_since = called_at del cliente que estaba colgado
--     (T en que llegó el cliente; el barbero era el #1 de FIFO
--     justo antes, así que held=called_at lo mantiene arriba
--     de todos los que se hicieron available después)
--   * breaks_taken_today NO se incrementa — es break impuesto por
--     el sistema, no voluntario; no consume su quota diaria.
--
-- El comportamiento sobre el cliente NO cambia:
--   * Si hay otro barbero available → cascade al próximo
--   * Si no → vuelve a waiting
--
-- El activity_log mantiene action='no_show' (no rompemos el feed
-- ni el CHECK constraint) pero el to_status pasa a 'break' y se
-- añade `sent_to: 'break_15min'` en el metadata para auditoría.
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
    -- break_held_since = called_at del cliente. En ese instante
    -- el barbero era el #1 de FIFO (acaba de recibir cliente),
    -- así que held=called_at lo mantiene encima de cualquiera
    -- que se haya hecho available después.
    v_held_since := rec.called_at;

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
        'break_minutes_at_start', 15
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
