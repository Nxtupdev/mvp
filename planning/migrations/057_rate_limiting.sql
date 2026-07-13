-- ============================================================
-- NXTUP — Rate limiting app-level, DB-backed (sin deps nuevas)
-- Run in Supabase SQL Editor
--
-- Contador de ventana fija por bucket (`scope:ip:ventana`), incrementado
-- ATÓMICAMENTE en una sola sentencia (sin race bajo carga). Lo usan los
-- endpoints públicos sin auth (kiosk/checkin, kiosk/lookup-client).
--
-- ⚠️ Esto es la capa APP-LEVEL (reglas de negocio + abuso casual). La
-- protección de FLOOD/DDoS a escala (1000 tiendas) va en el BORDE
-- (Vercel Firewall/WAF o Cloudflare), NO aquí — bajo flood real un
-- limitador DB-backed pone la carga del ataque sobre Postgres. Ver
-- memoria: nxtup-rate-limiting-scale.
-- ============================================================

create table if not exists rate_limit_counters (
  bucket text primary key,
  count int not null default 0,
  created_at timestamptz not null default now()
);

-- Incrementa el contador del bucket y devuelve el nuevo valor, atómico.
-- SECURITY DEFINER: lo llama el service role desde los endpoints.
create or replace function rate_limit_hit(p_bucket text)
returns int
language sql
security definer
set search_path = public
as $$
  insert into rate_limit_counters (bucket, count)
  values (p_bucket, 1)
  on conflict (bucket)
  do update set count = rate_limit_counters.count + 1
  returning count;
$$;

grant execute on function rate_limit_hit(text) to service_role;

-- Barrido de buckets de ventanas cerradas (basura inofensiva de filas
-- diminutas). Cron-eable nocturno; idempotente.
create or replace function rate_limit_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from rate_limit_counters where created_at < now() - interval '1 day';
$$;

grant execute on function rate_limit_cleanup() to service_role;

-- Sin acceso directo a la tabla: solo vía las RPC (definer) o service role.
alter table rate_limit_counters enable row level security;
