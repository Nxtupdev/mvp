-- ============================================================
-- NXTUP — Clients table + Services table (foundation para CRM y nuevo check-in)
-- Run in Supabase SQL Editor
--
-- Contexto: rediseño del check-in del kiosko + base para CRM
-- competitivo. Después de estudiar FlowOS, identificamos que
-- NXTUP necesita persistir cliente entre visitas (para detección
-- de returning customers, attribution marketing, métricas, y
-- futuro SMS campaigns) y catálogo de servicios por shop.
--
-- Decisiones de diseño:
--
--   1. Teléfono REQUIRED en clients — es la PK natural del
--      cliente (un cliente = un teléfono en un shop). Sin él
--      no hay detección de returning ni CRM.
--
--   2. Idioma preferido guardado por cliente — la próxima visita
--      el sistema sabe ES o EN sin volver a preguntar.
--
--   3. Referral source capturado SOLO en primera visita. Lista
--      cerrada de fuentes (walk-by, google, instagram, tiktok,
--      friend, other) para mantener analytics limpios.
--
--   4. NO memoria de servicio/barbero preferido del cliente —
--      decisión explícita del dueño: la negociación de servicio
--      y barbero queda entre cliente y barbero en persona.
--
--   5. Services SIN precio en esta migración — cada barbero
--      maneja su propio precio. Se agregará después como
--      tabla separada barber_service_pricing si se decide.
--
--   6. client_id y service_id en queue_entries son NULLABLE
--      para soportar entries legacy y fast-track.
-- ============================================================

-- ── 1. Tabla clients ─────────────────────────────────────────
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  phone_number text not null,
  first_name text not null,
  last_name text,

  -- Preferencias del cliente (persisten entre visitas)
  preferred_language text default 'es'
    check (preferred_language in ('es', 'en')),

  -- Marketing attribution (solo primera visita)
  referral_source text
    check (referral_source in (
      'walk-by', 'google', 'instagram', 'tiktok',
      'friend', 'other'
    ) or referral_source is null),

  -- Visit metrics
  first_visit_at timestamptz not null default now(),
  last_visit_at timestamptz,
  total_visits int not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Un teléfono único por shop. El mismo número puede existir
  -- en múltiples shops (un cliente puede ir a varias barberías
  -- usando NXTUP).
  unique (shop_id, phone_number)
);

create index if not exists idx_clients_phone
  on clients(shop_id, phone_number);

create index if not exists idx_clients_last_visit
  on clients(shop_id, last_visit_at desc);

comment on table clients is
  'Clientes persistentes de cada shop. Identificados por phone_number único per-shop. Capturados al primer check-in via QR/kiosko, reusados en visitas subsecuentes.';

comment on column clients.referral_source is
  'Atribución de marketing capturada SOLO en primera visita. Lista cerrada para analytics limpios.';

comment on column clients.preferred_language is
  'Idioma preferido. Se setea en primera visita y se reusa en subsecuentes para skip del language selector.';

-- ── 2. Tabla services ────────────────────────────────────────
create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  name text not null,
  duration_minutes int not null default 30 check (duration_minutes > 0),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_services_active
  on services(shop_id, sort_order)
  where active = true;

comment on table services is
  'Catálogo de servicios por shop. Sin precio — cada barbero maneja precio individualmente. La duración alimenta el cálculo de wait time estimado.';

-- ── 3. queue_entries gana FKs a clients y services ───────────
alter table queue_entries
  add column if not exists client_id uuid references clients(id) on delete set null,
  add column if not exists service_id uuid references services(id) on delete set null;

create index if not exists idx_queue_entries_client
  on queue_entries(client_id)
  where client_id is not null;

comment on column queue_entries.client_id is
  'Vínculo al cliente persistente. Nullable para soportar entries legacy o fast-track sin captura de teléfono.';

comment on column queue_entries.service_id is
  'Servicio elegido al hacer check-in. Nullable para legacy. La duración del servicio alimenta el ETA del cliente y de los siguientes en cola.';

-- ── 4. Helper para tracking de visitas ───────────────────────
-- Se llama desde el endpoint del check-in cada vez que se crea
-- un queue_entry vinculado a un client_id.
create or replace function track_client_visit(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update clients
  set total_visits = total_visits + 1,
      last_visit_at = now(),
      updated_at = now()
  where id = p_client_id;
end;
$$;

grant execute on function track_client_visit(uuid) to anon, authenticated;

-- ── 5. RLS policies ──────────────────────────────────────────

-- clients: lectura pública para que TV display, kiosko, dashboard
-- puedan leer. Writes abiertos porque el flow de check-in es
-- anónimo (el cliente no tiene cuenta).
alter table clients enable row level security;

drop policy if exists "public read clients" on clients;
create policy "public read clients"
  on clients for select
  using (true);

drop policy if exists "anyone can write clients" on clients;
create policy "anyone can write clients"
  on clients for insert
  with check (true);

drop policy if exists "anyone can update clients" on clients;
create policy "anyone can update clients"
  on clients for update
  using (true);

-- services: lectura pública. Solo dueños pueden gestionar.
alter table services enable row level security;

drop policy if exists "public read services" on services;
create policy "public read services"
  on services for select
  using (true);

drop policy if exists "owners manage services" on services;
create policy "owners manage services"
  on services for all
  using (
    shop_id in (
      select id from shops where owner_id = auth.uid()
    )
  );
