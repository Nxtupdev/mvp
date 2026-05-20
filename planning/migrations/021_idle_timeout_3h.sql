-- ============================================================
-- NXTUP — Idle timeout auto-offline v1
-- Run in Supabase SQL Editor
--
-- Capa 5 del sistema de turnos. Cierra la rendija que la 018
-- (cascada de no-show de 90s) deja abierta:
--
--   * 018 atrapa AL BARBERO al que le llamaron un cliente y NO
--     respondió en 90s. Pero si nadie le llama un cliente en
--     todo el día, ese caso nunca dispara.
--   * 013 (nightly reset) eventualmente lo agarra, pero hasta las
--     3 AM siguientes el barbero queda zombie en pantalla.
--
-- Esta capa pega un cron de 5 min que revisa por barberos "idle"
-- y los manda a offline:
--
--   AVAILABLE: available_since > 3h atrás (no ha completado un
--     corte ni recibido un cliente en 3h).
--   BREAK:     break_started_at > 3h atrás (break eterno — se
--     fue a almorzar y nunca volvió a tocar ACTIVE).
--   BUSY:      su entrada in_progress tiene called_at > 3h atrás
--     (tap en BUSY hace 3h, no tapeó ACTIVE de regreso —
--     probablemente terminó el cliente y se fue).
--
-- Para el caso BUSY también cerramos la queue_entry como 'done'
-- (cleanup) para que no aparezca un cliente in_progress flotando.
--
-- Trade-off del threshold:
--   * 3h es agresivo — un barbero en un Monday lento puede no
--     hacer un corte en 3h. Falso positivo: lo apaga; barbero
--     toca ACTIVE de nuevo (gate de WiFi pero rápido). Costo bajo.
--   * Si esto se siente molesto en operación, subimos a 4-5h.
--     Para hacerlo configurable per-shop hay que agregar columna
--     shops.idle_timeout_hours y joinarlo en el query.
--
-- Frecuencia del cron: 5 min. La latencia entre "barbero idle 3h"
-- y "auto-offline" es entonces 3h-3h5m. Suficiente.
-- ============================================================

create or replace function auto_offline_idle_barbers()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_threshold timestamptz := v_now - interval '3 hours';
  v_count integer := 0;
begin
  -- UNION ALL de las 3 condiciones para procesarlas uniformemente.
  -- Cada fila trae también el `reason` y el `idle_since` para que
  -- el activity_log explique POR QUÉ se apagó este barbero.
  for rec in
    -- 1. AVAILABLE sin actividad
    select b.id, b.shop_id, b.name, b.status as from_status,
           'available_no_action'::text as reason,
           b.available_since as idle_since
      from barbers b
      where b.status = 'available'
        and b.available_since is not null
        and b.available_since < v_threshold

    union all

    -- 2. BREAK eterno
    select b.id, b.shop_id, b.name, b.status as from_status,
           'break_too_long'::text as reason,
           b.break_started_at as idle_since
      from barbers b
      where b.status = 'break'
        and b.break_started_at is not null
        and b.break_started_at < v_threshold

    union all

    -- 3. BUSY congelado — usamos el called_at del in_progress como
    -- proxy de "cuándo tapeó busy" (gap real entre called→busy es
    -- pocos segundos, ignorable a escala de 3h).
    select b.id, b.shop_id, b.name, b.status as from_status,
           'busy_too_long'::text as reason,
           qe.called_at as idle_since
      from barbers b
      join queue_entries qe
        on qe.barber_id = b.id and qe.status = 'in_progress'
      where b.status = 'busy'
        and qe.called_at is not null
        and qe.called_at < v_threshold
  loop
    -- Reset completo a offline (mismo conjunto de fields que el
    -- offline manual del state route y la cascada del 018).
    update barbers
      set status = 'offline',
          available_since = null,
          break_started_at = null,
          break_held_since = null,
          break_minutes_at_start = null,
          breaks_taken_today = 0,
          break_invalidating_barber_ids = '{}',
          break_invalidated = false
      where id = rec.id;

    -- Limpiar obligaciones de peaje (de y hacia este barbero).
    -- Si era barbero existente debiendo cortes a alguien tarde,
    -- los tardes a quienes debía se liberan parcialmente.
    perform clear_late_arrival_toll(rec.id);

    -- Si estaba busy, cerrar su in_progress como 'done' (cleanup).
    -- El cliente ya no existe físicamente (3h+ esperando es
    -- imposible), pero al menos la queue_entry no queda flotando.
    if rec.from_status = 'busy' then
      update queue_entries
        set status = 'done', completed_at = v_now
        where barber_id = rec.id and status = 'in_progress';
    end if;

    insert into activity_log (
      shop_id, barber_id, action, from_status, to_status, metadata
    )
    values (
      rec.shop_id,
      rec.id,
      'idle_timeout_offline',
      rec.from_status,
      'offline',
      jsonb_build_object(
        'reason', rec.reason,
        'idle_since', rec.idle_since,
        'hours_idle', round(
          extract(epoch from (v_now - rec.idle_since))::numeric / 3600, 2
        ),
        'threshold_hours', 3
      )
    );

    v_count := v_count + 1;
  end loop;

  return json_build_object(
    'offlined', v_count,
    'ran_at',  v_now
  );
end;
$$;

-- ── Schedule ──────────────────────────────────────────────────
-- Re-create idempotently para que re-runs no dupliquen el job.
do $$
begin
  perform cron.unschedule('nxtup-auto-offline-idle');
exception when others then
  null;
end $$;

select cron.schedule(
  'nxtup-auto-offline-idle',
  '*/5 * * * *',  -- cada 5 minutos
  $$ select public.auto_offline_idle_barbers(); $$
);

grant execute on function auto_offline_idle_barbers() to anon, authenticated;
