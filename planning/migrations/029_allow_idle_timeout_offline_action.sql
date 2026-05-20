-- ============================================================
-- NXTUP — Permitir 'idle_timeout_offline' en activity_log.action
-- Run in Supabase SQL Editor
--
-- Bug detectado en operación:
--
--   El CHECK constraint de activity_log.action no incluye
--   'idle_timeout_offline'. Las migraciones 021 (idle 3h) y 028
--   (break expirado) intentan insertar logs con esa acción y
--   fallan con error 23514 (violación de CHECK). La transacción
--   completa se aborta — el barbero ni siquiera se actualiza a
--   offline, queda zombie.
--
-- Por eso Jesus pudo quedar +176:59 en break sin que el cron lo
-- moviera a offline: la función corría, intentaba el log, el
-- CHECK explotaba, todo el rollback.
--
-- Fix: expandir el CHECK para incluir 'idle_timeout_offline' como
-- valor válido. La columna metadata.reason discrimina entre los
-- distintos motivos (break_expired, available_no_action,
-- busy_too_long).
-- ============================================================

alter table activity_log
  drop constraint if exists activity_log_action_check;

alter table activity_log
  add constraint activity_log_action_check
  check (action in (
    'state_change',
    'client_assigned',
    'position_kept',
    'position_lost',
    'shop_settings_changed',
    'no_show',
    'no_show_no_takers',
    'idle_timeout_offline'
  ));
