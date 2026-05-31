-- ============================================================
-- NXTUP — Bajar el tick del cron de cascade de 30s a 10s
-- Run in Supabase SQL Editor
--
-- Feedback del dueño de Fade Factory: después de los 2 minutos de
-- threshold, hay un delay perceptible (hasta 30s) antes de que el
-- cliente se cascadee al próximo barbero. Causa: el cron del
-- `cascade_no_show_called_entries` corre cada 30s, así que la
-- ventana de espera POST-threshold va de 1s a 30s, promedio ~15s.
--
-- Fix: bajar el tick del cron a 10s. Eso reduce la ventana de
-- espera post-threshold a 1-10s, promedio ~5s.
--
-- Cero cambios en la lógica de la función ni en el threshold
-- (siguen siendo 2 minutos). Solo cambia con qué frecuencia el
-- cron despierta a buscar entries vencidos.
--
-- Costo: ~3x más ticks del cron por minuto. El query del cron es
-- un index lookup sobre el set de queue_entries con status='called'
-- (un set muy pequeño en cualquier instante real, generalmente
-- 0-5 entries por shop). La carga adicional en la DB es trivial
-- — la cuenta de Supabase ni lo nota incluso a escala de 10k shops.
--
-- Idempotente: unschedule + schedule con el mismo job name.
-- ============================================================

do $$
begin
  perform cron.unschedule('nxtup-cascade-no-show');
exception when others then
  null;  -- job didn't exist, nothing to undo
end $$;

select cron.schedule(
  'nxtup-cascade-no-show',
  '10 seconds',
  $$ select public.cascade_no_show_called_entries(); $$
);

-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración:
--
--   select jobname, schedule, active
--   from cron.job
--   where jobname = 'nxtup-cascade-no-show';
--
-- Debe devolver 1 fila: active=true, schedule='10 seconds'.
