-- ============================================================
-- NXTUP 062 — Horario de apertura por día + auto open/close
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES de desplegar el código que la usa (el TV/settings
--    seleccionan la columna nueva; sin ella, esos selects fallan).
--
-- El dueño define horario semanal (por día: activado + abre + cierra)
-- en Configuración. Un cron aplica el horario abriendo/cerrando
-- `is_open` SOLO en las transiciones (no en cada tick), así el toggle
-- manual del dueño siempre gana hasta el próximo borde de horario
-- (cerrar temprano, abrir un festivo, etc.).
--
-- Shape de business_hours (jsonb; NULL = feature apagada, manual puro):
--   { "mon": {"enabled":true,"start":"09:00","end":"19:00"},
--     "tue": {...}, ... "sun": {"enabled":false, ...} }
-- Claves mon..sun (coinciden con to_char(ts,'dy') en inglés).
-- Limitación deliberada: no soporta horarios que cruzan medianoche
-- (end debe ser > start; el cron ignora días inválidos).
-- ============================================================

alter table shops
  add column if not exists business_hours jsonb,
  add column if not exists hours_auto_state boolean;

comment on column shops.business_hours is
  'Horario semanal {mon..sun: {enabled,start,end}}. NULL = sin auto-horario (apertura manual). Editado por el dueño en Configuración. Ver 062.';
comment on column shops.hours_auto_state is
  'Último estado aplicado por el cron de horario. El cron solo toca is_open cuando el estado DESEADO difiere de este (transiciones) — así el toggle manual del dueño gana entre bordes. NULL = re-aplicar al próximo tick.';

create or replace function apply_business_hours()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s record;
  local_ts timestamp;
  day_cfg jsonb;
  local_hm text;
  desired boolean;
begin
  for s in
    select id, business_hours, coalesce(timezone, 'America/New_York') as tz,
           is_open, hours_auto_state
    from shops
    where business_hours is not null
  loop
    local_ts := now() at time zone s.tz;
    day_cfg := s.business_hours -> trim(to_char(local_ts, 'dy'));
    local_hm := to_char(local_ts, 'HH24:MI');

    desired := day_cfg is not null
      and coalesce((day_cfg->>'enabled')::boolean, false)
      and (day_cfg->>'start') is not null
      and (day_cfg->>'end') is not null
      and (day_cfg->>'start') < (day_cfg->>'end')  -- ignora días inválidos
      and local_hm >= (day_cfg->>'start')
      and local_hm <  (day_cfg->>'end');

    -- Solo en transiciones: si el deseado no cambió desde la última
    -- aplicación, NO tocar is_open (respeta el override manual).
    if desired is distinct from s.hours_auto_state then
      update shops
      set is_open = desired,
          hours_auto_state = desired
      where id = s.id;
    end if;
  end loop;
end;
$$;

-- Cada minuto — la función es barata (solo shops con horario definido).
do $$ begin
  perform cron.unschedule('nxtup-business-hours');
exception when others then null;
end $$;

select cron.schedule(
  'nxtup-business-hours',
  '* * * * *',
  $$ select public.apply_business_hours(); $$
);
