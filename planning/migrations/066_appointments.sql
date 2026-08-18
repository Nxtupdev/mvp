-- ============================================================
-- NXTUP 066 — Citas en el check-in (kiosko pregunta "¿tienes cita?")
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES de desplegar el código (columna nueva).
--
-- Diseño (Francisco, ago 2026 — discutido antes de construir):
-- el cliente que dice tener cita elige barbero en el kiosko. La entrada
-- nace VISIBLE en el TV ("📅 Cita · Carlos · por confirmar") pero SIN
-- turno real hasta que EL BARBERO la acoja desde su panel — el barbero
-- es la única validación posible (NXTUP no tiene agenda de citas).
--
-- Estados (sin columna de estado — se derivan):
--   * PENDIENTE:  appointment_barber_id ≠ null AND barber_id IS null
--                 → visible, NO elegible para ningún match/promoción.
--   * CONFIRMADA: el accept fija barber_id = appointment_barber_id
--                 → entra al flujo "cliente pedido" que YA existe en la
--                 promoción (su barbero la llama primero al liberarse;
--                 los demás la saltan porque barber_id ≠ null).
--   * RECHAZADA/EXPIRADA: se limpia appointment_barber_id → walk-in
--                 normal del pool (barber_id null, sin marca).
--
-- Degradación: si el barbero no confirma en 10 min, el cron (la misma
-- función del cascade, tick de 10s) la convierte en walk-in — protege
-- al cliente del barbero que no mira el celular.
-- ============================================================

alter table queue_entries
  add column if not exists appointment_barber_id uuid references barbers(id) on delete set null;

comment on column queue_entries.appointment_barber_id is
  'Barbero que el cliente ELIGIÓ al decir "tengo cita" en el kiosko. Pendiente mientras barber_id sea null (no elegible para match); el accept del barbero fija barber_id = este valor (prioridad de "cliente pedido"). Reject/expiración (10 min) la limpian → walk-in normal. Ver 066.';

-- ── CHECK de activity_log: ampliar EN LA MISMA migración (lección de
--    la 063/064 — es la CUARTA vez que este constraint muerde) ────────
alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'state_change',
    'client_assigned',
    'position_kept',
    'position_lost',
    'shop_settings_changed',
    'no_show',
    'no_show_no_takers',
    'idle_timeout_offline',
    'toll_cleared_by_owner',
    'fifo_moved_by_owner',
    'sanction_applied',
    'sanction_cleared',
    'break_restored_by_owner',
    'auto_busy',
    'call_returned_to_waiting',
    -- Nuevas de esta migración (citas):
    'appointment_confirmed',
    'appointment_rejected',
    'appointment_expired'
  ));

-- ── Cascade + degradación de citas en un mismo tick ─────────────────
-- Re-crea la función del cron agregando el barrido de citas pendientes
-- vencidas (>10 min sin confirmar → walk-in del pool). El resto del
-- cuerpo es idéntico a la 063 (auto-BUSY).
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
  v_expired_appointments integer := 0;
begin
  -- ── 0. Citas pendientes vencidas (10 min sin confirmación) ────────
  for rec in
    select e.id as entry_id, e.shop_id as shop_id,
           e.client_name as client_name,
           e.appointment_barber_id as appt_barber_id
    from queue_entries e
    where e.status = 'waiting'
      and e.appointment_barber_id is not null
      and e.barber_id is null
      and e.created_at < v_now - interval '10 minutes'
  loop
    update queue_entries
    set appointment_barber_id = null
    where id = rec.entry_id
      and status = 'waiting'
      and barber_id is null;

    if found then
      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        rec.shop_id,
        rec.appt_barber_id,
        'appointment_expired',
        jsonb_build_object(
          'entry_id', rec.entry_id,
          'client_name', rec.client_name,
          'threshold_minutes', 10
        )
      );
      v_expired_appointments := v_expired_appointments + 1;
    end if;
  end loop;

  -- ── 1. Auto-BUSY (063) — sin cambios ──────────────────────────────
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
      update queue_entries
      set status = 'in_progress',
          auto_busy = true
      where id = rec.entry_id
        and status = 'called';

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
    'returned_to_waiting', v_returned_to_waiting_count,
    'expired_appointments', v_expired_appointments
  );
end;
$$;

revoke execute on function cascade_no_show_called_entries() from public, anon, authenticated;
