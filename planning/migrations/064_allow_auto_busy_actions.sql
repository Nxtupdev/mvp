-- ============================================================
-- NXTUP 064 — Permitir las acciones de la 063 en activity_log
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- HOTFIX de la 063: activity_log.action tiene un CHECK con lista
-- cerrada (009→029→038→039→047→049) y la 063 introdujo dos acciones
-- nuevas ('auto_busy', 'call_returned_to_waiting') SIN ampliarla. El
-- INSERT reventaba dentro de cascade_no_show_called_entries() → toda
-- la función se revertía → el cascade quedó MUDO (ni castigo viejo ni
-- auto-busy nuevo) desde que se corrió la 063 hasta este fix.
-- Detectado en la prueba end-to-end del shop demo (17 ago 2026):
-- la entrada de prueba nunca salió de 'called'.
--
-- Lección (tercera vez con este constraint — ver 047 y 049): toda
-- migración que agregue una acción de activity_log DEBE re-crear
-- este CHECK en la misma migración.
-- ============================================================

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
    -- Nuevas de la 063 (auto-BUSY):
    'auto_busy',
    'call_returned_to_waiting'
  ));
