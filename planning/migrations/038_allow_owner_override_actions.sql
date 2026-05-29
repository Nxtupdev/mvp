-- ============================================================
-- NXTUP — Permitir 'toll_cleared_by_owner' y 'fifo_moved_by_owner'
-- Run in Supabase SQL Editor
--
-- Bug detectado tras desplegar el Centro de Mando del 037:
--
--   `activity_log.action` tiene un CHECK constraint con lista
--   cerrada de valores (migración 029 fue el último que lo
--   extendió, agregando 'idle_timeout_offline'). Las funciones
--   nuevas `clear_barber_toll` y `move_barber_fifo` insertan
--   eventos con `action = 'toll_cleared_by_owner'` y
--   `action = 'fifo_moved_by_owner'` respectivamente — valores no
--   permitidos por el CHECK actual. La transacción aborta con
--   error 23514, la RPC falla, y el endpoint API retorna 500
--   con el mensaje genérico.
--
-- Fix: misma técnica de la 029 — drop + re-add del constraint
-- con la lista expandida.
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
    'idle_timeout_offline',
    'toll_cleared_by_owner',
    'fifo_moved_by_owner'
  ));
