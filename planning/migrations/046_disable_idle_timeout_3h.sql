-- ============================================================
-- NXTUP — Desactivar la regla de auto-offline por inactividad (3h)
-- Run in Supabase SQL Editor
--
-- Feedback en operación: la regla de la migración 021 estaba
-- causando problemas en producción. Casos donde el barbero estaba
-- legítimamente trabajando (cliente largo, día lento, descanso
-- extendido aprobado por el dueño) terminaba en offline forzado
-- por el cron — y al volver perdía su posición FIFO.
--
-- Acción: desactivar SOLO el cron job `nxtup-auto-offline-idle`.
-- La función SQL `auto_offline_idle_barbers()` queda definida en
-- la base pero nunca se ejecuta. Cero impacto en otros sistemas:
--
--   * El cron `nxtup-cascade-no-show` (018/035/041/042/045) sigue
--     activo — atrapa al barbero que NO RESPONDIÓ a un cliente
--     en 2 min. Esa regla SÍ es necesaria.
--   * El cron `nxtup-break-expired-offline` (028) sigue activo —
--     atrapa al barbero que se quedó en break más del tiempo
--     permitido + grace. Esa regla SÍ es necesaria para
--     liberar peajes y posiciones de cola.
--   * El cron `nxtup-nightly-reset` (013/044) sigue limpiando el
--     estado al final del día. Cobertura final si algún barbero
--     queda zombie por cualquier otra razón.
--
-- Por qué no borramos la función completa:
--   1. Reversibilidad: si después decidimos reactivarla con
--      otro threshold (5h, 8h, etc.) solo hay que cron.schedule
--      otra vez.
--   2. Audit log: eventos pasados de `idle_timeout_offline` en
--      activity_log siguen visibles en el feed sin romperse.
--   3. Cero costo: una función SQL que no se llama no consume
--      recursos.
--
-- Si en el futuro queremos borrarla del todo, basta con
-- `drop function auto_offline_idle_barbers()` en otra migración.
-- ============================================================

do $$
begin
  perform cron.unschedule('nxtup-auto-offline-idle');
exception when others then
  -- Si el job ya no existe (re-run de esta migración o limpieza
  -- previa), no hacemos nada. La operación es idempotente.
  null;
end $$;

-- ── Verificación ─────────────────────────────────────────────
-- Después de correr esta migración:
--
--   select jobname, schedule, active
--   from cron.job
--   where jobname like 'nxtup-%'
--   order by jobname;
--
-- NO debe aparecer `nxtup-auto-offline-idle` en la lista.
-- SÍ deben seguir apareciendo:
--   * nxtup-cascade-no-show
--   * nxtup-break-expired-offline
--   * nxtup-nightly-reset
--   * nxtup-cleanup-activity-log (de la 009)
