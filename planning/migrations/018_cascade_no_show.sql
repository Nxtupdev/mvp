-- ============================================================
-- NXTUP — Cascade no-show v1 (replaces 016's auto-release)
-- Run in Supabase SQL Editor
--
-- Capa 2 del sistema de turnos: cuando un cliente está en estado
-- 'called' por más de 90 segundos sin que el barbero asignado
-- toque BUSY, el sistema asume que el barbero no está en la silla
-- y CASCADEA el cliente al siguiente barbero disponible de la
-- FIFO. El barbero ausente pasa a 'offline' automáticamente.
--
-- Cómo se relaciona con migrations previas:
--   * Migration 016 introdujo `release_stale_called_entries()`,
--     que a los 5 min mandaba el cliente de vuelta al pool de
--     waiting (sin reasignar). Esta migración LO REEMPLAZA con
--     una lógica más agresiva (90s) y más útil (cascada en vez
--     de simplemente liberar).
--   * El botón "Tomar yo" del próximo barbero (peer claim,
--     /api/queue/[id]/claim) sigue activo y se complementa: un
--     barbero alerta puede reclamar el cliente en cualquier
--     momento ANTES de que el cron dispare. Cascada es el
--     fallback automático si nadie tocó "Tomar yo".
--
-- Penalidad: offline. La elegimos sobre "deja al barbero
-- available" porque si no respondió en 90s claramente no está
-- en la silla, y dejarlo available significa que el sistema le
-- volvería a asignar el próximo cliente — repetir la cascada
-- sería desperdicio. Offline lo saca de la rotación hasta que
-- vuelva a tocar ACTIVE explícitamente.
--
-- Frecuencia del cron: cada 30 segundos. Combinado con el
-- threshold de 90s, la latencia máxima desde "barbero deja de
-- responder" hasta "cascada se dispara" es ~90-120s.
-- ============================================================

-- ── Drop the old cron job from migration 016 ────────────────────
-- We keep the old function around (other places may still call
-- release_stale_called_entries manually for debugging) but it no
-- longer fires on a schedule.
do $$
begin
  perform cron.unschedule('nxtup-release-stale-called');
exception when others then
  null;  -- job didn't exist, nothing to undo
end $$;

-- ── Cascade function ────────────────────────────────────────────
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
      and e.called_at < v_now - interval '90 seconds'
    order by e.called_at asc  -- oldest first
  loop
    -- ── 1. Offline the negligent barber (full reset) ──────────
    -- Same reset we apply on manual offline: clear FIFO position,
    -- clear break bookkeeping, reset the daily break counter.
    -- They have to tap ACTIVE again to re-enter the rotation.
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
        'threshold_seconds', 90
      )
    );

    -- ── 2. Find next available barber (FIFO order) ────────────
    -- Excludes the just-offlined one. We pick the barber who has
    -- been available the longest — same priority order the
    -- check-in route uses for auto-assignment.
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

      -- Clear the new barber's FIFO position — they have a
      -- called client now, same pattern as state.route.ts after
      -- auto-assigning a client.
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
      -- Cliente no se queda quemado — vuelve al pool sin
      -- barbero asignado y el próximo que toque ACTIVE lo
      -- recoge automáticamente (lógica de auto-match en
      -- /api/barbers/[id]/state route).
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
        null,  -- no barber to attribute to
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

-- ── Schedule the cron ───────────────────────────────────────────
-- Re-create idempotently so re-runs don't duplicate the job.
do $$
begin
  perform cron.unschedule('nxtup-cascade-no-show');
exception when others then
  null;
end $$;

-- pg_cron 1.4+ supports sub-minute intervals via the natural-language
-- string syntax. Supabase ships pg_cron >= 1.5 so this works.
select cron.schedule(
  'nxtup-cascade-no-show',
  '30 seconds',
  $$ select public.cascade_no_show_called_entries(); $$
);
