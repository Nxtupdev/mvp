-- ============================================================
-- NXTUP 060 — Auto-reseed de la barbería DEMO (pg_cron)
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- La puerta pública /demo lee el shop demo EN VIVO. Pero el reset nocturno
-- (nightly_state_reset, migración 013) apaga los barberos y cancela la cola
-- cada día a las 09:00 UTC → sin esto, /demo mostraría un tablero MUERTO la
-- mayor parte del tiempo.
--
-- Este cron llama reset_demo_shop() (migración 059) cada 30 min:
--   - mantiene el demo vivo con timestamps SIEMPRE frescos,
--   - se auto-recupera del reset nocturno en ≤30 min,
--   - es idempotente y read-only para el visitante.
--
-- Requiere que la migración 059 (reset_demo_shop) ya esté corrida.
-- ============================================================

-- Idempotente: quita el job viejo si existe antes de re-crearlo.
do $$ begin
  perform cron.unschedule('nxtup-demo-reseed');
exception when others then null;
end $$;

select cron.schedule(
  'nxtup-demo-reseed',
  '*/30 * * * *',
  $$ select public.reset_demo_shop(); $$
);
