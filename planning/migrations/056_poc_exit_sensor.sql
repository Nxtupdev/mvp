-- ============================================================
-- NXTUP — POC de detección de salida de barberos (sensor Wi-Fi)
-- Run in Supabase SQL Editor
--
-- DESCARTABLE. Prefijo poc_ a propósito: esto es SOLO el POC de medición.
-- El sensor corre en un Linux real (Pi/laptop, con root → arp-scan de
-- verdad) dentro del shop y reporta, por cada dispositivo pareado y cada
-- ciclo de ~30-60s, DOS señales crudas:
--   - seen_arp:  presencia ARP (la VERDAD — ve teléfonos dormidos).
--   - seen_icmp: respuesta a ping (el PROXY de lo que una onn barata sin
--                root podría hacer en producción).
--
-- El debounce NO se hornea en la captura: se guarda el log crudo y se
-- simula cualquier umbral (3/5/7 min) offline sobre el mismo dataset.
-- En PRODUCCIÓN el modelo será otro (eventos ya debounceados con el
-- umbral que estos datos elijan) y estas tablas se DESCARTAN.
--
-- NADA de auto-break ni cambios a la lógica de disponibilidad aquí.
-- ============================================================

-- ── Token de sensor por shop (auth del agente) ───────────────
-- Espeja el patrón de panel-tokens (migración 043): token por-shop en
-- tabla, validado server-side con service role.
create table if not exists poc_sensor_config (
  shop_id uuid primary key references shops(id) on delete cascade,
  token text not null unique,
  created_at timestamptz not null default now()
);

-- ── Dispositivos pareados (IP → barbero) ─────────────────────
create table if not exists poc_sensor_devices (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  barber_id uuid references barbers(id) on delete set null,
  label text not null,            -- ej. "iPhone de Luis"
  ip text not null,               -- IP local DHCP (estable por semanas)
  hostname text,                  -- mDNS opcional
  created_at timestamptz not null default now(),
  unique (shop_id, ip)
);

-- ── Log CRUDO: una fila por dispositivo por ciclo de escaneo ──
create table if not exists poc_scan_observations (
  id bigint generated always as identity primary key,
  device_id uuid not null references poc_sensor_devices(id) on delete cascade,
  scan_ts timestamptz not null,      -- cuándo escaneó el agente
  seen_arp boolean not null,
  seen_icmp boolean not null,
  created_at timestamptz not null default now()  -- cuándo lo recibió el server
);

create index if not exists idx_poc_obs_device_ts
  on poc_scan_observations(device_id, scan_ts);

-- ── Vista de resumen para medir divergencia ARP vs ICMP ──────
-- arp_not_icmp = el PUNTO CIEGO: ARP dice presente pero ICMP lo perdió.
-- Es el número que decide si producción puede ir en la onn (ICMP) o
-- necesita un sensor Linux por shop.
create or replace view poc_sensor_summary as
select
  d.id            as device_id,
  d.shop_id       as shop_id,
  d.label         as label,
  d.ip            as ip,
  count(o.*)                                                as total_scans,
  count(o.*) filter (where o.seen_arp)                     as arp_seen,
  count(o.*) filter (where o.seen_icmp)                    as icmp_seen,
  count(o.*) filter (where o.seen_arp and not o.seen_icmp) as arp_not_icmp,
  count(o.*) filter (where not o.seen_arp and o.seen_icmp) as icmp_not_arp,
  min(o.scan_ts)  as first_scan,
  max(o.scan_ts)  as last_scan
from poc_sensor_devices d
left join poc_scan_observations o on o.device_id = d.id
group by d.id, d.shop_id, d.label, d.ip;

-- ── RLS ──────────────────────────────────────────────────────
-- config + observations: solo server-side (service role, endpoints del
-- agente + página del dueño). Sin policies públicas = anon/authenticated
-- no accede directo. devices: el dueño gestiona los suyos (para el pareo
-- desde el dashboard), espejo de "owners manage services".
alter table poc_sensor_config enable row level security;
alter table poc_scan_observations enable row level security;
alter table poc_sensor_devices enable row level security;

drop policy if exists "owners manage poc devices" on poc_sensor_devices;
create policy "owners manage poc devices"
  on poc_sensor_devices for all
  using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );
