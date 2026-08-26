-- ============================================================
-- NXTUP 067 — Expiración de reservas de voz que nunca llegaron
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- Solo DB — no requiere deploy de código.
--
-- Problema (Francisco, ago 2026): los clientes que llaman (Mamacita)
-- entran a la cola con arrived_at NULL. El pool ya los salta (state
-- route los excluye hasta el check-in) y las stats no los cuentan,
-- pero su tarjeta "en camino" vive en el TV TODO el día — solo el
-- reset nocturno (013) la mataba. Cola visualmente inflada.
--
-- Regla acordada (dos relojes, según lo que el cliente prometió):
--   * Con eta_at:  hora prometida + 15 min de gracia → cancelar.
--   * Sin eta_at:  45 min desde la llamada (created_at) → cancelar.
--
-- El cliente que llega tarde NO se rechaza: el kiosko no encuentra
-- entrada pendiente y lo crea como walk-in normal al final de la cola
-- (ese flujo ya existe — perdió el puesto guardado, no el corte).
--
-- Función propia + cron cada minuto (NO se toca la función del
-- cascade, que está probada en batalla). Retorna JSON con el conteo
-- (el SQL Editor no muestra raise notice — lección vieja).
-- ============================================================

-- ── CHECK de activity_log: ampliar EN LA MISMA migración (lección de
--    la 063/064 — lista cerrada; toda acción nueva lo re-crea aquí) ──
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
    -- Nueva de esta migración:
    'voice_no_show'
  ));

-- ── Barrido de reservas de voz vencidas ─────────────────────────────
create or replace function expire_voice_no_shows()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_expired integer := 0;
begin
  for rec in
    select e.id as entry_id, e.shop_id as shop_id,
           e.client_name as client_name,
           e.eta_at as eta_at, e.created_at as created_at,
           e.mamacita_entry_id as mamacita_entry_id
    from queue_entries e
    where e.status = 'waiting'
      and e.mamacita_entry_id is not null
      and e.arrived_at is null
      and (
        (e.eta_at is not null and e.eta_at < v_now - interval '15 minutes')
        or
        (e.eta_at is null and e.created_at < v_now - interval '45 minutes')
      )
  loop
    -- Guarda re-chequeada: si hizo check-in entre el select y aquí
    -- (arrived_at ya no es null), no se toca.
    update queue_entries
    set status = 'cancelled'
    where id = rec.entry_id
      and status = 'waiting'
      and arrived_at is null;

    if found then
      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        rec.shop_id,
        null,
        'voice_no_show',
        jsonb_build_object(
          'entry_id', rec.entry_id,
          'client_name', rec.client_name,
          'mamacita_entry_id', rec.mamacita_entry_id,
          'eta_at', rec.eta_at,
          'called_shop_at', rec.created_at,
          'grace_minutes', case when rec.eta_at is not null then 15 else 45 end
        )
      );
      v_expired := v_expired + 1;
    end if;
  end loop;

  return json_build_object('voice_no_shows_expired', v_expired);
end;
$$;

-- Postgres da EXECUTE a PUBLIC por default en funciones nuevas.
revoke execute on function expire_voice_no_shows() from public, anon, authenticated;

-- ── Cron cada minuto (idempotente, patrón de la 062) ────────────────
do $$ begin
  perform cron.unschedule('nxtup-expire-voice-no-shows');
exception when others then null;
end $$;

select cron.schedule(
  'nxtup-expire-voice-no-shows',
  '* * * * *',
  $$ select public.expire_voice_no_shows(); $$
);
