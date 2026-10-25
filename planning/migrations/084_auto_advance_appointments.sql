-- ============================================================
-- NXTUP 084 · Auto-avance de clientes amarrados (citas en cadena)
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES del deploy (el /api/health vigila este cron nuevo y
--    Configuración lee la columna nueva — aunque con fail-open).
--
-- Caso real (NuevaYol, 25-oct): un cliente amarrado a su barbero
-- (cita / "cliente pedido") esperó indefinidamente porque su barbero
-- atendía citas en cadena SIN tocar Disponible — ese toque era lo único
-- que se lo pasaba. Decisión de Francisco: NO depender de que los
-- barberos toquen botones ("no lo van a hacer"); el sistema asume, igual
-- que el auto-BUSY (063): asumir trabajo, no ausencia.
--
-- Regla: si un barbero está OCUPADO con un corte que empezó hace más de
-- N minutos (default 40, ajustable por barbería) Y tiene un cliente
-- amarrado que YA LLEGÓ esperándolo, el sistema asume que el barbero
-- siguió con él:
--   * el corte actual se cierra como atendido, auto_completed = true
--     (mismo marcador del barrendero 072: hora de fin estimada);
--   * el cliente que esperaba pasa a in_progress con ese barbero
--     (called_at = ahora: su propio reloj arranca aquí);
--   * queda en activity_log como 'appointment_auto_advanced'.
-- El barbero NO se toca (sigue busy, que es su estado real).
-- NO se marca auto_busy en el que entra: ese flag habilita "Tomar yo"
-- para los compañeros, y un cliente amarrado no es para otro barbero.
-- Cortes cerrados así no generan línea de ticket: aparecen en "Mis
-- clientes" como "Sin servicio marcado · marcar" (el dinero no se pierde).
-- ============================================================

-- ── Umbral por barbería ─────────────────────────────────────────────
alter table public.shops
  add column if not exists appointment_advance_minutes integer not null default 40
    check (appointment_advance_minutes between 20 and 120);

comment on column public.shops.appointment_advance_minutes is
  'Minutos de corte tras los cuales, si el barbero sigue ocupado y tiene un cliente amarrado que ya llegó, el sistema asume que pasó al siguiente (084).';

-- ── CHECK de activity_log: ampliar EN LA MISMA migración (lista
--    cerrada; última versión en la 082) ─────────────────────────────
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
    'appointment_confirmed',
    'appointment_rejected',
    'appointment_expired',
    'voice_no_show',
    'auto_completed',
    'ticket_corrected',
    'ticket_deleted',
    'tickets_settled',
    -- Nueva de esta migración:
    'appointment_auto_advanced'
  ));

-- ── Auto-avance ─────────────────────────────────────────────────────
create or replace function public.auto_advance_appointments()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_advanced integer := 0;
begin
  for rec in
    select cur.id as cur_id, cur.shop_id, cur.barber_id,
           cur.client_name as cur_name, cur.called_at as cur_called_at,
           nxt.id as nxt_id, nxt.client_name as nxt_name,
           s.appointment_advance_minutes as threshold
    from queue_entries cur
    join barbers b on b.id = cur.barber_id
    join shops s on s.id = cur.shop_id
    -- El SIGUIENTE amarrado de ese barbero que ya llegó (los de voz sin
    -- arrived_at vienen en camino y no cuentan).
    join lateral (
      select n.id, n.client_name
      from queue_entries n
      where n.barber_id = cur.barber_id
        and n.status = 'waiting'
        and (n.mamacita_entry_id is null or n.arrived_at is not null)
      order by n.position asc
      limit 1
    ) nxt on true
    where cur.status = 'in_progress'
      and b.status = 'busy'
      and coalesce(cur.called_at, cur.created_at)
          < v_now - make_interval(mins => s.appointment_advance_minutes)
  loop
    -- Reclamo ATÓMICO de las dos filas: si el barbero tocó algo en el
    -- mismo instante, el guard de estado hace que aquí no pase nada.
    update queue_entries
    set status = 'done', completed_at = v_now, auto_completed = true
    where id = rec.cur_id and status = 'in_progress';

    if found then
      update queue_entries
      set status = 'in_progress', called_at = v_now
      where id = rec.nxt_id and status = 'waiting';

      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        rec.shop_id,
        rec.barber_id,
        'appointment_auto_advanced',
        jsonb_build_object(
          'closed_entry_id', rec.cur_id,
          'closed_client', rec.cur_name,
          'closed_called_at', rec.cur_called_at,
          'advanced_entry_id', rec.nxt_id,
          'advanced_client', rec.nxt_name,
          'threshold_minutes', rec.threshold
        )
      );
      v_advanced := v_advanced + 1;
    end if;
  end loop;

  return json_build_object('appointments_advanced', v_advanced);
end;
$$;

-- Postgres da EXECUTE a PUBLIC por default en funciones nuevas.
revoke execute on function public.auto_advance_appointments() from public, anon, authenticated;

-- ── Cron cada 2 min (umbral de 40: unos minutos de más no importan) ──
do $$ begin
  perform cron.unschedule('nxtup-auto-advance-appointments');
exception when others then null;
end $$;

select cron.schedule(
  'nxtup-auto-advance-appointments',
  '*/2 * * * *',
  $$ select public.auto_advance_appointments(); $$
);

-- ── Verificación ────────────────────────────────────────────────────
select jobname, schedule, active from cron.job
where jobname = 'nxtup-auto-advance-appointments';
