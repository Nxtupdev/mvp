-- ============================================================
-- NXTUP 069 — Teléfonos y datos sensibles fuera de la lectura pública
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ ORDEN INVERTIDO al usual: DEPLOY PRIMERO, migración DESPUÉS.
--    El código viejo tiene dos conteos con select('*') anónimo que
--    REVIENTAN con grants por columna; el código nuevo (select('id'))
--    ya debe estar sirviendo en prod antes de pegar esto.
--
-- Fuga (punto #1 del port desde dealer, su migración 070): la llave
-- anon leía TODAS las columnas de queue_entries y shops de todas las
-- tiendas — client_phone, check_in_code (el código que Mamacita manda
-- por WhatsApp), trusted_public_ip y columnas de Stripe incluidos.
-- Verificado en vivo: filtros por client_phone con la llave pública
-- devolvían filas.
--
-- Cierre en dos capas:
--   1. GRANTS POR COLUMNA para anon: queue_entries y shops pasan de
--      "select en toda la tabla" a una lista blanca con exactamente
--      las columnas que TV, kiosko, panel del barbero y /demo usan
--      (censo exhaustivo del código anon, oct-2026).
--   2. FILAS POR DUEÑO para authenticated: la policy "public read"
--      (using true) también se la daba a cualquier JWT — y la cuenta
--      demo tiene clave pública, así que cualquiera podía loguearse
--      y leer teléfonos de TODOS los shops con columnas completas.
--      Ahora un autenticado solo lee las filas de SUS shops.
--
-- Lo que NO cambia: service_role (rutas API, crons) bypasea todo;
-- INSERT/UPDATE de anon (self-cancel del kiosko) intactos; barbers
-- sigue público (nombre/avatar/estado — sin PII).
--
-- RIESGO RESIDUAL documentado: los eventos realtime postgres_changes
-- evalúan RLS por fila pero el payload puede incluir columnas
-- revocadas. El cierre de ese canal es el punto #3 del port
-- (broadcast con payload de lista blanca) — siguiente en la cola.
-- ============================================================

-- ── 1. queue_entries: lista blanca de columnas para anon ───────────
revoke select on table public.queue_entries from anon;

grant select (
  id,
  shop_id,
  position,
  client_name,
  status,
  barber_id,
  created_at,
  called_at,
  completed_at,
  arrived_at,
  eta_at,
  auto_busy,
  appointment_barber_id,
  mamacita_entry_id
) on table public.queue_entries to anon;

-- Fuera de la lista (lo que se cierra): client_phone, check_in_code,
-- client_id, referral_source y cualquier columna futura (las nuevas
-- nacen cerradas para anon hasta ampliar este grant a propósito).

-- ── 2. shops: lista blanca de columnas para anon ────────────────────
revoke select on table public.shops from anon;

grant select (
  id,
  name,
  is_open,
  max_queue_size,
  logo_url,
  first_break_minutes,
  next_break_minutes,
  keep_position_on_break,
  break_position_grace_minutes,
  break_mode,
  display_message,
  display_language,
  business_hours,
  timezone
) on table public.shops to anon;

-- Fuera de la lista: trusted_public_ip, owner_id, columnas de Stripe
-- (061), configuración de sanciones y cualquier columna futura.

-- ── 3. RLS: lectura de queue_entries por rol ───────────────────────
-- "public read" (using true) aplicaba a TODOS los roles. Se separa:
-- anon mantiene using(true) — sus columnas ya están limitadas por el
-- grant de arriba; authenticated queda limitado a filas de sus shops.
drop policy if exists "public read" on public.queue_entries;

create policy "anon read queue"
  on public.queue_entries
  for select
  to anon
  using (true);

create policy "owner read queue"
  on public.queue_entries
  for select
  to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );

-- ── 4. RLS: lectura de shops por rol ────────────────────────────────
-- Mismo tratamiento. La policy "owner full access" de la 001 (for all,
-- owner_id = auth.uid()) ya cubre la lectura del dueño con columnas
-- completas — solo hay que quitarle el using(true) al mundo autenticado.
drop policy if exists "public read" on public.shops;

create policy "anon read shops"
  on public.shops
  for select
  to anon
  using (true);

-- ── Verificación ────────────────────────────────────────────────────
-- Debe devolver: queue_entries 2 policies de select, shops 2 (anon +
-- owner full access for all).
select tablename, policyname, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('queue_entries', 'shops')
order by tablename, policyname;
