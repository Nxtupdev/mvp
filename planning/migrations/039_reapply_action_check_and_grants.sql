-- ============================================================
-- NXTUP — Re-aplicar CHECK + grants del Centro de Mando (idempotente)
-- Run in Supabase SQL Editor
--
-- Frank reporta que los botones del Centro de Mando (Quitar penalidad
-- y mover ↑/↓) siguen dando error 500 incluso después del 037 y 038.
-- El response del endpoint es `{"error":"No se pudo mover el barbero"}`
-- que es el fallback genérico cuando la RPC retorna error de Postgres.
--
-- Hipótesis más probable: la 038 (CHECK constraint) no se aplicó
-- correctamente o el grant de las funciones no se mantuvo.
--
-- Esta migración es defensiva — re-aplica los dos elementos
-- críticos sin tocar la lógica de las funciones:
--
--   1. Drop + re-add del CHECK constraint con la lista completa
--      (incluye los valores de 038). Idempotente.
--
--   2. Re-grant execute en clear_barber_toll y move_barber_fifo
--      por si el rol no los recibió. Idempotente.
--
-- Si después de esta migración los botones siguen fallando, el
-- endpoint API (commit acompañante) ahora devuelve el error real
-- de Postgres en el JSON del response — la pantalla te dirá la
-- causa concreta sin necesidad de SQL Editor.
-- ============================================================

-- ── 1. Re-aplicar CHECK constraint ──────────────────────────────
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

-- ── 2. Re-grant execute en las funciones del Centro de Mando ──
-- Si Postgres ya las tenía, el grant es no-op.
grant execute on function clear_barber_toll(uuid) to anon, authenticated;
grant execute on function move_barber_fifo(uuid, text) to anon, authenticated;
