-- ============================================================
-- NXTUP — Explicit GRANTs para todas las tablas del public schema
-- Run in Supabase SQL Editor
--
-- Contexto: el 30 de octubre de 2026, Supabase elimina el comportamiento
-- legacy donde las tablas en `public` reciben grants automáticos a
-- `anon`, `authenticated` y `service_role` al crearse. Hasta entonces
-- NXTUP funciona sin tocar nada, pero:
--
--   1. Cualquier tabla NUEVA creada después del 30 de oct sin grants
--      explícitos quedaría "muerta" para el Data API.
--   2. Las migraciones existentes (001, 009, 015, 017, 019, 032) no
--      tienen GRANTs explícitos — funcionan solo por el default
--      legacy. Si alguien clona NXTUP para un proyecto nuevo de
--      Supabase (staging, demo, segundo cliente), esas migraciones
--      no expondrían las tablas hasta agregar grants manualmente.
--
-- Esta migración hace dos cosas:
--
--   A) Backfill: GRANTs explícitos para cada tabla pública existente,
--      siguiendo el patrón de acceso real de cada una (basado en las
--      RLS policies activas).
--
--   B) Documenta el patrón para futuras migraciones: cada `create
--      table` debe terminar con su bloque GRANT explícito.
--
-- Idempotente: GRANT no falla si el privilegio ya existe.
-- NO toca ALTER DEFAULT PRIVILEGES — esa decisión queda para otra
-- migración después de validar (y antes del 30 de octubre).
--
-- Referencia oficial:
--   https://github.com/orgs/supabase/discussions/45329
-- ============================================================

-- ── 1. shops ─────────────────────────────────────────────────
-- Public read (landing, kiosko, TV). Owner manages via RLS gate.
-- anon nunca escribe — solo el dueño autenticado.
grant select on table public.shops to anon;
grant select, insert, update, delete on table public.shops to authenticated;
grant all on table public.shops to service_role;

-- ── 2. barbers ───────────────────────────────────────────────
-- Public read (TV, kiosko, PWA del barbero). Updates abiertos
-- porque los barberos cambian su propio status sin estar
-- autenticados (PWA usa anon). RLS gate-ea inserts/deletes a owner.
grant select, update on table public.barbers to anon;
grant select, insert, update, delete on table public.barbers to authenticated;
grant all on table public.barbers to service_role;

-- ── 3. queue_entries ─────────────────────────────────────────
-- Check-in público (anon insert via /q/[shop_id] o /kiosk/[shop_id]).
-- Barberos actualizan called/in_progress/done sin auth (anon update).
-- Self-cancel: anon update con check status='cancelled'.
-- Owner full access via RLS.
grant select, insert, update on table public.queue_entries to anon;
grant select, insert, update, delete on table public.queue_entries to authenticated;
grant all on table public.queue_entries to service_role;

-- ── 4. activity_log ──────────────────────────────────────────
-- Audit table. Insert abierto a anon (migración 030 — state changes
-- desde dispositivos sin auth). Lectura solo del dueño (RLS).
-- En la práctica el route.ts usa createAdminClient para inserts
-- (más confiable), pero mantenemos el GRANT match con la policy.
grant insert on table public.activity_log to anon;
grant select, insert on table public.activity_log to authenticated;
grant all on table public.activity_log to service_role;

-- ── 5. shop_avatars ──────────────────────────────────────────
-- Catálogo de avatars compartido. Public read. Owner manage via RLS.
grant select on table public.shop_avatars to anon;
grant select, insert, update, delete on table public.shop_avatars to authenticated;
grant all on table public.shop_avatars to service_role;

-- ── 6. app_settings ──────────────────────────────────────────
-- Secrets table (device_api_token). NO RLS policies = nadie tiene
-- acceso. Las funciones SECURITY DEFINER bypassan RLS para leer.
-- Solo service_role tiene grant — para admin manual del dueño.
grant all on table public.app_settings to service_role;

-- ── 7. late_arrival_toll ─────────────────────────────────────
-- Public read (TV muestra el badge de peaje pendiente). Writes
-- solo via funciones SECURITY DEFINER (register/pay/clear), que
-- corren como postgres y no necesitan grants en el caller.
grant select on table public.late_arrival_toll to anon;
grant select on table public.late_arrival_toll to authenticated;
grant all on table public.late_arrival_toll to service_role;

-- ── 8. clients ───────────────────────────────────────────────
-- Tabla nueva (migración 032). Check-in del kiosko es anónimo:
-- inserta nuevos clientes y actualiza last_visit_at de returning.
-- Public read para que kiosko + dashboard + TV puedan consultar.
grant select, insert, update on table public.clients to anon;
grant select, insert, update, delete on table public.clients to authenticated;
grant all on table public.clients to service_role;

-- ── 9. services ──────────────────────────────────────────────
-- Tabla nueva (migración 032). Catálogo público — anon lee para
-- mostrarlo en el kiosko (cuando se reactive). Owner manages.
grant select on table public.services to anon;
grant select, insert, update, delete on table public.services to authenticated;
grant all on table public.services to service_role;

-- ── 10. Sequences (defensivo) ────────────────────────────────
-- NXTUP usa uuid default gen_random_uuid() en todas las PKs, así
-- que no tenemos sequences SERIAL/IDENTITY directamente. Pero por
-- si en el futuro agregamos una columna SERIAL, dejamos esto
-- comentado como recordatorio del patrón:
--
--   grant usage, select on sequence public.my_seq to anon;
--   grant usage, select on sequence public.my_seq to authenticated;
--   grant all on sequence public.my_seq to service_role;

-- ── Verificación ─────────────────────────────────────────────
-- Confirmar grants aplicados. Debería devolver una fila por
-- tabla × role con los privilegios listados arriba.
--
--   select table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privs
--   from information_schema.role_table_grants
--   where table_schema = 'public'
--     and grantee in ('anon', 'authenticated', 'service_role')
--   group by table_name, grantee
--   order by table_name, grantee;
