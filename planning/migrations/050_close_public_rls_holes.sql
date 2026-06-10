-- ============================================================
-- NXTUP — Migración 050
-- Cerrar las RLS policies públicas que exponían data al REST API
--
-- Run in Supabase SQL Editor — DESPUÉS de deployar el código que
-- mueve kiosk/lookup-client y kiosk/checkin al admin client.
--
-- ⚠️ ORDEN DE APLICACIÓN (crítico para no romper el kiosko en vivo):
--   1. PRIMERO: deploy del código (lookup-client + checkin → admin
--      client). Sin esto, cerrar las policies rompe el check-in
--      anónimo porque el kiosko depende de la lectura/escritura
--      pública de `clients`.
--   2. DESPUÉS: correr esta migración.
-- En ese orden NUNCA hay una ventana donde el kiosko falle. El admin
-- client bypassa RLS, así que cuando esta migración cierra las puertas
-- el kiosko ya no las necesita.
--
-- ── Contexto ────────────────────────────────────────────────
-- Auditoría de seguridad encontró que varias tablas tenían policies
-- con `using(true)` / `with check(true)` + grants a `anon`. Como RLS
-- estaba habilitado, los grants amplios por sí solos no exponían nada
-- — pero esas policies `true` SÍ: cualquiera con la anon key (que va
-- pública en el JS del cliente, por diseño de Supabase) podía pegarle
-- directo al REST API y:
--   * Leer TODOS los teléfonos/nombres de clientes de TODAS las
--     barberías (PII) — la brecha crítica.
--   * Modificar estados de barberos, cancelar/reasignar entries de
--     cola, e inyectar eventos falsos en el activity_log.
-- Todo eso saltándose la lógica de autorización y WiFi-gating de los
-- endpoints Next.js (el atacante no usa los endpoints, le habla
-- directo a Postgres vía el Data API).
--
-- Lo que NO se toca (acceso público legítimo):
--   * `barbers` public read, `queue_entries` public read, `services`
--     public read — esa info ya se muestra en la TV pública y el
--     kiosko; no es secreta.
--   * `queue_entries` public insert (acotado a shops abiertos) — es
--     el check-in anónimo. Se revisará en una fase 2 ahora que el
--     checkin usa admin client, pero por ahora se deja para no
--     arriesgar el flujo en vivo.
--   * Todas las policies `owner ...` que verifican ownership real.
--   * `shops`, `shop_control_tokens`, `barber_sanctions` — ya estaban
--     correctamente protegidas (owner-only).
-- ============================================================

-- ── 1. clients: cerrar lectura/escritura pública ─────────────
-- La PII vivía aquí. El ÚNICO acceso a `clients` ahora es:
--   * Endpoints server-side (lookup-client, checkin) vía admin client.
--   * El dueño leyendo SUS clientes desde el dashboard de stats
--     (cookie autenticada) — para eso la policy owner-read de abajo.
drop policy if exists "public read clients"      on public.clients;
drop policy if exists "anyone can write clients"  on public.clients;
drop policy if exists "anyone can update clients" on public.clients;

-- El dashboard de stats del dueño lee `clients` con su cookie
-- autenticada (rol authenticated). Necesita poder ver SOLO los
-- clientes de SUS shops. El admin client de los endpoints bypassa
-- RLS, así que el kiosko no depende de esta policy.
create policy "owner read clients"
  on public.clients
  for select
  using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

-- ── 2. barbers: quitar el UPDATE público ─────────────────────
-- `barber status update` (using true) permitía a cualquiera cambiar
-- el estado de cualquier barbero. No la usa ningún código legítimo:
--   * El dashboard del dueño muta barberos vía la policy `owner write`
--     (verifica ownership) — esa se queda.
--   * Los cambios de estado van por /api/barbers/[id]/state, que usa
--     admin client.
drop policy if exists "barber status update" on public.barbers;

-- ── 3. queue_entries: quitar los UPDATE públicos ─────────────
-- `self cancel` y `barber queue update` (ambas using true) permitían
-- a cualquiera cancelar/reasignar/completar entries de cualquier shop.
-- Toda mutación legítima de cola va por endpoints (state, claim,
-- checkin) que usan admin client.
drop policy if exists "self cancel"         on public.queue_entries;
drop policy if exists "barber queue update" on public.queue_entries;

-- ── 4. activity_log: quitar el INSERT público ────────────────
-- `allow writes to activity_log` (insert with check true) permitía
-- inyectar eventos falsos en la bitácora de auditoría. El código
-- SIEMPRE inserta el log con admin client, así que esta policy es
-- innecesaria. La policy `owner full access` (lectura del dueño) se
-- queda.
drop policy if exists "allow writes to activity_log" on public.activity_log;


-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración, este query NO debe devolver ninguna
-- fila con `true` en clients/barbers(update)/queue_entries(update)/
-- activity_log(insert):
--
--   select tablename, policyname, cmd, qual, with_check
--   from pg_policies
--   where schemaname = 'public'
--     and tablename in ('clients','barbers','queue_entries','activity_log')
--     and (qual = 'true' or with_check = 'true')
--   order by tablename;
--
-- Esperado: solo deben quedar con `true` las lecturas públicas
-- legítimas (barbers/queue_entries/services public read) y el
-- public insert de queue_entries. `clients` no debe aparecer.
--
-- Smoke test del kiosko (DESPUÉS de deploy + migración):
--   1. Abrir el kiosko de un shop y hacer un check-in completo.
--   2. Debe funcionar igual que antes (lookup + registro + cola).
--   3. El dashboard de stats del dueño debe seguir mostrando los
--      clientes (recurrentes/nuevos).
