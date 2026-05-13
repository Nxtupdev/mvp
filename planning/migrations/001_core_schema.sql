-- ============================================================
-- NXTUP — Core Schema v1
-- Idempotent: safe to run multiple times
-- Run in Supabase SQL Editor
-- ============================================================

-- ── shops ────────────────────────────────────────────────────
create table if not exists shops (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  owner_id        uuid not null references auth.users on delete cascade,
  is_open         boolean not null default true,
  max_queue_size  integer not null default 20,
  created_at      timestamptz not null default now()
);

alter table shops enable row level security;

drop policy if exists "owner full access" on shops;
create policy "owner full access" on shops
  for all using (owner_id = auth.uid());

-- Public read: client check-in + TV display need shop name/status
drop policy if exists "public read" on shops;
create policy "public read" on shops
  for select using (true);

-- ── barbers ──────────────────────────────────────────────────
create table if not exists barbers (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references shops on delete cascade,
  name        text not null,
  status      text not null default 'offline'
                check (status in ('available', 'busy', 'offline')),
  created_at  timestamptz not null default now()
);

alter table barbers enable row level security;

drop policy if exists "public read" on barbers;
create policy "public read" on barbers
  for select using (true);

drop policy if exists "owner write" on barbers;
create policy "owner write" on barbers
  for all using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

-- ── queue_entries ────────────────────────────────────────────
create table if not exists queue_entries (
  id            uuid primary key default gen_random_uuid(),
  shop_id       uuid not null references shops on delete cascade,
  client_name   text not null,
  client_phone  text not null,
  position      integer not null,
  unique (shop_id, position),
  status        text not null default 'waiting'
                  check (status in ('waiting', 'called', 'in_progress', 'done', 'cancelled')),
  barber_id     uuid references barbers on delete set null,
  created_at    timestamptz not null default now(),
  called_at     timestamptz,
  completed_at  timestamptz
);

alter table queue_entries enable row level security;

drop policy if exists "public read" on queue_entries;
create policy "public read" on queue_entries
  for select using (true);

drop policy if exists "public insert" on queue_entries;
create policy "public insert" on queue_entries
  for insert with check (
    shop_id in (select id from shops where is_open = true)
  );

drop policy if exists "owner write" on queue_entries;
create policy "owner write" on queue_entries
  for update using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

drop policy if exists "owner delete" on queue_entries;
create policy "owner delete" on queue_entries
  for delete using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

-- Client self-cancel: anyone can set their entry to cancelled (UUID is unguessable)
drop policy if exists "self cancel" on queue_entries;
create policy "self cancel" on queue_entries
  for update using (true) with check (status = 'cancelled');

-- ── Indexes ──────────────────────────────────────────────────
create index if not exists queue_entries_shop_status on queue_entries (shop_id, status);
create index if not exists barbers_shop_id on barbers (shop_id);

-- ── Realtime ─────────────────────────────────────────────────
do $$ begin
  alter publication supabase_realtime add table queue_entries;
exception when others then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table barbers;
exception when others then null;
end $$;
