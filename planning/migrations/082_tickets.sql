-- ============================================================
-- NXTUP 082 · Tickets por porcentaje (cuentas dueño ⇄ barberos)
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ NO correr hasta que Francisco suba la rama feat/tickets.
--
-- Reemplaza los "Guest Checks" de papel: una línea por servicio
-- terminado (precio heredado del botón, jamás tecleado), reparto por
-- porcentaje por barbero (deslizador, pasos de 5), cierre como ACCIÓN
-- (liquida lo no liquidado y congela el comprobante). Spec completa:
-- planning/specs/tickets-porcentaje-spec.md
-- ============================================================

-- Opt-in por barbería + % default (parte del BARBERO).
alter table shops
  add column if not exists tickets_enabled boolean not null default false,
  add column if not exists barber_split_percent integer not null default 60
    check (barber_split_percent between 0 and 100);

comment on column shops.tickets_enabled is
  'Cuentas por porcentaje encendidas: habilita la pregunta de cierre en el panel del barbero, Cuentas del dueño y Mi cuenta del barbero. Ver 082.';
comment on column shops.barber_split_percent is
  'Porcentaje DEFAULT del barbero en el reparto (la casa recibe 100-x). Override individual en barbers.split_percent.';

-- Override individual (null = usa el default del shop).
alter table barbers
  add column if not exists split_percent integer
    check (split_percent between 0 and 100);

-- ── Líneas de ticket ─────────────────────────────────────────────────
create table if not exists tickets (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops(id) on delete cascade,
  barber_id     uuid not null references barbers(id) on delete cascade,
  entry_id      uuid references queue_entries(id) on delete set null,
  service_id    uuid references services(id) on delete set null,
  -- Snapshots: si el dueño renombra el servicio o cambia el precio
  -- mañana, las cuentas de ayer no se reescriben.
  service_name  text,
  amount        numeric(8,2) not null default 0,
  status        text not null default 'confirmed'
    check (status in ('pending', 'confirmed')),
  settlement_id uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_tickets_shop_created
  on tickets(shop_id, created_at desc);
create index if not exists idx_tickets_barber_created
  on tickets(barber_id, created_at desc);
create index if not exists idx_tickets_unsettled
  on tickets(shop_id) where settlement_id is null;

-- ── Cierres (comprobantes congelados) ────────────────────────────────
create table if not exists settlements (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops(id) on delete cascade,
  range_start timestamptz not null,
  range_end   timestamptz not null,
  -- [{ barber_id, name, percent, total, barber_part, house_part, count }]
  totals      jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists idx_settlements_shop
  on settlements(shop_id, created_at desc);

alter table tickets enable row level security;
alter table settlements enable row level security;

-- El dueño LEE las cuentas de su shop (páginas del dashboard).
drop policy if exists "owner reads own tickets" on tickets;
create policy "owner reads own tickets" on tickets
  for select using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

drop policy if exists "owner reads own settlements" on settlements;
create policy "owner reads own settlements" on settlements
  for select using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

-- Sin policies de escritura: solo las rutas del server (service role)
-- escriben — los precios se resuelven server-side de la tabla services,
-- nunca del cliente.

-- ── CHECK de activity_log: ampliar EN LA MISMA migración (lección de
--    la 063/064 · lista cerrada; última versión en la 072) ────────────
alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'state_change',
    'client_assigned',
    'position_kept',
    'position_lost',
    'shop_settings_changed',
    'no_show',
    'no_show_no_takers',
    'idle_timeout_offline',
    'toll_cleared_by_owner',
    'fifo_moved_by_owner',
    'sanction_applied',
    'sanction_cleared',
    'break_restored_by_owner',
    'auto_busy',
    'call_returned_to_waiting',
    'appointment_confirmed',
    'appointment_rejected',
    'appointment_expired',
    'voice_no_show',
    'auto_completed',
    -- Nuevas de esta migración (correcciones y cierres de tickets):
    'ticket_corrected',
    'ticket_deleted',
    'tickets_settled'
  ));

comment on table tickets is
  'Línea de cuenta por servicio terminado (el papelito, digital). Precio = snapshot resuelto server-side. Ver 082 y spec tickets-porcentaje.';
comment on table settlements is
  'Comprobantes de cierre: totales congelados por barbero al tocar Cerrar cuentas. Ver 082.';

-- ── Verificación ────────────────────────────────────────────────────
select table_name from information_schema.tables
where table_name in ('tickets', 'settlements');
