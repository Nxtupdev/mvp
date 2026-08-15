-- ============================================================
-- NXTUP 063 — Auto-BUSY: invertir el default del no-show a los 2 min
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES de desplegar el código (usa la columna nueva).
--
-- PROBLEMA (Francisco, ago 2026): el cascade castigaba al minuto 2 sin
-- BUSY asumiendo "no está" — pero el caso FRECUENTE es el barbero que SÍ
-- está pelando y no tocó el botón. Resultado: cola mentirosa, castigos
-- injustos, clientes "movidos" a barberos que los ven llegar en la silla
-- de otro.
--
-- NUEVO DEFAULT: a los 2 min sin BUSY el sistema asume que el barbero
-- ESTÁ TRABAJANDO → la entrada pasa a in_progress con marca AUTO_BUSY
-- (provisional, el barbero nunca confirmó) y el barbero pasa a 'busy'.
-- La detección de ausencia real pasa del timer ciego a los ojos del
-- piso: el "Tomar yo" del siguiente barbero queda ABIERTO mientras la
-- entrada sea auto_busy (guardas en /api/queue/[entry_id]/claim). Si
-- alguien reclama → el ausente va a BREAK (regla decidida por Francisco;
-- si no vuelve, el cron de break vencido (028) lo baja a offline solo).
--
-- La ventana 0-2 min ahora es EXCLUSIVA del barbero llamado: ya no hay
-- reclamo al minuto 1 (evita robos por error a un presente distraído).
--
-- Caso borde: si al minuto 2 el barbero ya NO está en available/busy
-- (tocó BREAK u OFFLINE legítimamente durante la ventana), no se le
-- inventa un busy — la entrada vuelve al pool de waiting (comportamiento
-- 3b del cascade viejo), sin castigo (él sí marcó su salida).
-- ============================================================

alter table queue_entries
  add column if not exists auto_busy boolean not null default false;

comment on column queue_entries.auto_busy is
  'true = in_progress puesto por el SISTEMA a los 2 min sin BUSY (provisional, el barbero no confirmó). Mientras esté en true, el "Tomar yo" sigue abierto para el siguiente barbero. Se limpia a false cuando el barbero confirma con una acción terminal o cuando otro lo reclama. Ver 063.';

create or replace function cascade_no_show_called_entries()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_barber_status text;
  v_now timestamptz := now();
  v_auto_busy_count integer := 0;
  v_returned_to_waiting_count integer := 0;
begin
  for rec in
    select
      e.id          as entry_id,
      e.shop_id     as shop_id,
      e.barber_id   as called_barber_id,
      e.client_name as client_name,
      e.position    as queue_position,
      e.called_at   as called_at
    from queue_entries e
    where e.status = 'called'
      and e.called_at is not null
      and e.called_at < v_now - interval '120 seconds'
    order by e.called_at asc
  loop
    select b.status into v_barber_status
    from barbers b
    where b.id = rec.called_barber_id;

    if v_barber_status in ('available', 'busy') then
      -- ── AUTO-BUSY: asumir que está trabajando ────────────────
      update queue_entries
      set status = 'in_progress',
          auto_busy = true
      where id = rec.entry_id
        and status = 'called';  -- guard contra carrera con un BUSY tardío

      if found then
        update barbers
        set status = 'busy',
            available_since = null
        where id = rec.called_barber_id;

        insert into activity_log (
          shop_id, barber_id, action, from_status, to_status, metadata
        )
        values (
          rec.shop_id,
          rec.called_barber_id,
          'auto_busy',
          'called',
          'in_progress',
          jsonb_build_object(
            'entry_id', rec.entry_id,
            'client_name', rec.client_name,
            'called_at', rec.called_at,
            'threshold_seconds', 120
          )
        );

        v_auto_busy_count := v_auto_busy_count + 1;
      end if;
    else
      -- ── Barbero salió LEGÍTIMAMENTE (break/offline marcado) ──
      -- No se inventa un busy: la entrada vuelve al pool. Sin castigo.
      update queue_entries
      set status = 'waiting',
          barber_id = null,
          called_at = null
      where id = rec.entry_id
        and status = 'called';

      if found then
        insert into activity_log (shop_id, barber_id, action, metadata)
        values (
          rec.shop_id,
          null,
          'call_returned_to_waiting',
          jsonb_build_object(
            'client_name', rec.client_name,
            'entry_id', rec.entry_id,
            'previous_barber_id', rec.called_barber_id,
            'barber_status', v_barber_status
          )
        );

        v_returned_to_waiting_count := v_returned_to_waiting_count + 1;
      end if;
    end if;
  end loop;

  return json_build_object(
    'auto_busy', v_auto_busy_count,
    'returned_to_waiting', v_returned_to_waiting_count
  );
end;
$$;

-- Lección de la auditoría del demo: las funciones nacen ejecutables por
-- PUBLIC en Postgres — revocar siempre. El cron corre como superusuario
-- y no necesita grants.
revoke execute on function cascade_no_show_called_entries() from public, anon, authenticated;

-- El cron 'nxtup-cascade-no-show' (10s, migración 042) sigue llamando a
-- esta misma función — no hay que re-agendar nada.
