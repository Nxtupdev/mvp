-- ============================================================
-- NXTUP 071 — Salud de crons + retención del historial de pg_cron
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES del deploy (el endpoint /api/health llama a la
--    función nueva; sin ella respondería 503 permanente).
--
-- Port del punto #13 del dealer (sus 081+082+084, fundidas aquí en la
-- forma final — sin pasar por los dos bugs que ellos ya pagaron:
-- corridas 'connecting' que parecían jobs muertos, y el timeout por
-- recorrer la tabla entera por cada job).
--
-- Por qué: `nxtup-cascade-no-show` mueve el piso de TODAS las tiendas
-- cada 10 segundos; si se detiene, los clientes quedan en 'called'
-- para siempre y nadie se entera (nos pasó en silencio con el CHECK
-- de la 063 — un timeout de 5 min lo descubrió de casualidad). Esta
-- función + /api/health + un monitor externo son el vigilante.
--
-- Además: pg_cron NUNCA borra su historial. Con el tick de 10s son
-- 8.640 filas/día solo del cascade; en dealer la tabla creció hasta
-- tumbar la consulta de salud por timeout. Retención a 7 días, diaria.
-- ============================================================

begin;
set local lock_timeout = '5s';

-- Salud: una sola pasada sobre las últimas 48 h. Solo corridas
-- TERMINADAS (succeeded/failed) — pg_cron inserta una fila transitoria
-- al arrancar cada corrida y sin este filtro un job vivo puede parecer
-- muerto (bug 082 del dealer).
create or replace function public.nxtup_cron_health()
returns table (
  jobname     text,
  schedule    text,
  active      boolean,
  last_start  timestamptz,
  last_end    timestamptz,
  last_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with recent as (
    select distinct on (r.jobid) r.jobid, r.start_time, r.end_time, r.status
    from cron.job_run_details r
    where r.start_time > now() - interval '48 hours'
      and r.status in ('succeeded', 'failed')
    order by r.jobid, r.start_time desc
  )
  select j.jobname, j.schedule, j.active, d.start_time, d.end_time, d.status
  from cron.job j
  left join recent d on d.jobid = j.jobid
  where j.jobname like 'nxtup-%'
  order by j.jobname;
$$;

revoke all on function public.nxtup_cron_health() from public, anon, authenticated;
grant execute on function public.nxtup_cron_health() to service_role;

-- Limpieza diaria del historial (recomendación de Supabase para pg_cron).
do $$
begin
  perform cron.unschedule('nxtup-cleanup-cron-history');
exception when others then null;
end $$;
select cron.schedule(
  'nxtup-cleanup-cron-history',
  '35 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);

commit;

-- Primera limpieza, fuera de la transacción para no retener candados
-- largos. Si el editor corta por tiempo, volver a correrla hasta que
-- termine (con el cascade a 10s desde agosto puede haber cientos de
-- miles de filas acumuladas).
delete from cron.job_run_details where end_time < now() - interval '7 days';

-- ── Verificación ────────────────────────────────────────────────────
-- Fila por cada job nxtup-% con su última corrida; debe responder <1s.
select * from nxtup_cron_health();
