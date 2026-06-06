-- ============================================================
-- NXTUP — Migración 049
-- Acción "break_restored_by_owner" en activity_log
--
-- Run in Supabase SQL Editor
--
-- Contexto: dueños reportan que sus barberos a veces tocan BREAK
-- en su PWA sin querer y "pierden" su primer break de 60 min (el
-- contador `breaks_taken_today` queda en 1 y el siguiente break se
-- considera el "segundo" = 30 min). No hay forma actual de
-- restaurar el contador.
--
-- Esta migración solo prepara el CHECK constraint del activity_log
-- para que el endpoint /api/barbers/[id]/break/restore (próxima
-- adición) pueda loggear sus eventos. El esquema y las funciones
-- de break no cambian — solo agregamos el log permitido.
--
-- IMPORTANTE: la lista del CHECK debe INCLUIR todas las acciones
-- históricas (las de migraciones 037/038/039 + las de la 047).
-- Si omitimos alguna, el ALTER falla porque rows existentes
-- violan el constraint nuevo. Mismo pitfall que tuvimos en la 047.
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
    -- Nueva acción de esta migración:
    'break_restored_by_owner'
  ));


-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración:
--
--   select conname, pg_get_constraintdef(oid)
--   from pg_constraint
--   where conname = 'activity_log_action_check';
--
-- Debe devolver 1 fila con la lista completa de 13 acciones
-- (12 históricas + break_restored_by_owner).
