-- ============================================================
-- NXTUP 072 · Auto-cierre de cortes colgados (90 min)
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES del deploy (el /api/health nuevo vigila este cron;
--    el código no selecciona la columna nueva, así que no hay más
--    dependencias de orden).
--
-- Problema real (Fade Factory, oct-2026): el barbero termina el
-- walk-in pero sigue legítimamente ocupado con sus citas externas,
-- así que nunca cambia de estado · y cerrar un corte SOLO era posible
-- cambiando de estado. La entrada quedaba in_progress "en el aire"
-- todo el día (cortes de 454/589 min en el TV) y el dueño las cerraba
-- a mano cada noche. Decisión de Francisco: sin botón extra para el
-- barbero (es la misma gente que no tocaba BUSY); lo resuelve el cron.
--
-- Regla: un corte in_progress con más de 90 minutos (ningún corte
-- real dura eso; el aviso rojo del TV ya suena a los 40) se cierra
-- solo como atendido, marcado auto_completed=true para que las
-- estadísticas puedan distinguir hora de fin real vs estimada.
-- El BARBERO NO SE TOCA: sigue busy, que es su estado real · y el
-- roster del dueño pasa a mostrarlo "Ocupado" a secas (sin cliente),
-- que desde ayer significa exactamente "ocupado por su cuenta".
-- ============================================================

-- ── Columna: cierre automático vs cierre real ───────────────────────
alter table public.queue_entries
  add column if not exists auto_completed boolean not null default false;

comment on column public.queue_entries.auto_completed is
  'true = lo cerró el barrendero de 90 min (072), no una transición del barbero; completed_at es estimado, no real.';

-- ── CHECK de activity_log: ampliar EN LA MISMA migración (lección
--    de la 063/064 · lista cerrada) ──────────────────────────────────
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
    -- Nueva de esta migración:
    'auto_completed'
  ));

-- ── Barrendero ──────────────────────────────────────────────────────
create or replace function public.auto_complete_stale_cuts()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_closed integer := 0;
begin
  for rec in
    select e.id as entry_id, e.shop_id as shop_id, e.barber_id as barber_id,
           e.client_name as client_name, e.called_at as called_at,
           e.auto_busy as was_auto_busy
    from queue_entries e
    where e.status = 'in_progress'
      and coalesce(e.called_at, e.created_at) < v_now - interval '90 minutes'
  loop
    update queue_entries
    set status = 'done',
        completed_at = v_now,
        auto_completed = true
    where id = rec.entry_id
      and status = 'in_progress';

    if found then
      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        rec.shop_id,
        rec.barber_id,
        'auto_completed',
        jsonb_build_object(
          'entry_id', rec.entry_id,
          'client_name', rec.client_name,
          'called_at', rec.called_at,
          'was_auto_busy', rec.was_auto_busy,
          'threshold_minutes', 90
        )
      );
      v_closed := v_closed + 1;
    end if;
  end loop;

  return json_build_object('stale_cuts_closed', v_closed);
end;
$$;

-- Postgres da EXECUTE a PUBLIC por default en funciones nuevas.
revoke execute on function public.auto_complete_stale_cuts() from public, anon, authenticated;

-- ── Cron cada 5 min (umbral de 90: el minuto exacto no importa) ─────
do $$ begin
  perform cron.unschedule('nxtup-auto-complete-stale-cuts');
exception when others then null;
end $$;

select cron.schedule(
  'nxtup-auto-complete-stale-cuts',
  '*/5 * * * *',
  $$ select public.auto_complete_stale_cuts(); $$
);

-- ── Verificación ────────────────────────────────────────────────────
-- Debe devolver la fila del job nuevo.
select jobname, schedule, active from cron.job
where jobname = 'nxtup-auto-complete-stale-cuts';
