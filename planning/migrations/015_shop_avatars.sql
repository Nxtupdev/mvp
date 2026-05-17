-- ============================================================
-- NXTUP — Shop-specific avatars v1
-- Run in Supabase SQL Editor
--
-- The built-in stroke avatars (crown, scissors, etc.) are generic and
-- live in code. But each shop has its own visual identity — Fade
-- Factory came with 12 custom icons designed for THEIR shop (gothic P,
-- the joker face, the Aztec skull, etc.). Hard-coding those into the
-- shared pool would (a) pollute every other shop's picker with
-- irrelevant choices and (b) carry trademark risk for shop-specific
-- branding.
--
-- Instead: every shop can have its own collection of avatars, stored
-- as URLs. The barber.avatar text field already accepts arbitrary
-- strings — built-in ids ('crown', 'fist') OR URLs ('/avatars/...')
-- resolved by the Avatar component at render time.
--
-- For now we ship Fade Factory's set pre-populated; the upload UI
-- for other shops to add their own ships in a follow-up.
-- ============================================================

-- ── Table ────────────────────────────────────────────────────
create table if not exists shop_avatars (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references shops(id) on delete cascade,
  label text not null,
  image_url text not null,
  -- Lets the owner control the order they appear in the picker
  -- (e.g. put their shop logo first, then their barbers' favourites).
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_shop_avatars_shop on shop_avatars(shop_id, sort_order);

comment on table shop_avatars is
  'Per-shop custom avatar catalogue. The barber.avatar field stores '
  'either a built-in id (''crown'', etc.) or one of these image_urls '
  'directly. The Avatar component branches on the format at render time.';

-- ── RLS ──────────────────────────────────────────────────────
-- Public read because barbers are matched by URL (no auth) and the
-- barber dashboard renders avatars without a logged-in session. The
-- image URLs themselves are public assets anyway.
alter table shop_avatars enable row level security;

drop policy if exists "shop_avatars are publicly readable" on shop_avatars;
create policy "shop_avatars are publicly readable" on shop_avatars
  for select using (true);

-- Write access only for the shop owner. Mirrors the pattern used by
-- the other shop-scoped tables (queue_entries, barbers, etc.).
drop policy if exists "shop owner manages shop_avatars" on shop_avatars;
create policy "shop owner manages shop_avatars" on shop_avatars
  for all using (
    exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from shops s where s.id = shop_id and s.owner_id = auth.uid())
  );

-- ── Seed: Fade Factory's 12 custom icons ─────────────────────
-- The PNG files live in /public/avatars/fade-factory/ in the Next.js
-- repo, so Next serves them directly at /avatars/fade-factory/*.png.
-- Inserted with `on conflict do nothing` semantics so re-running the
-- migration is safe — we identify duplicates by the (shop_id, label)
-- pair via a partial unique index added below.
create unique index if not exists uq_shop_avatars_shop_label
  on shop_avatars(shop_id, label);

insert into shop_avatars (shop_id, label, image_url, sort_order) values
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'P',         '/avatars/fade-factory/p-gothic.png',     1),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Camión',    '/avatars/fade-factory/truck.png',        2),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Gorra A',   '/avatars/fade-factory/cap-a.png',        3),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Cal.38',    '/avatars/fade-factory/bullet.png',       4),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Maestro',   '/avatars/fade-factory/kick-maestro.png', 5),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Anteojos',  '/avatars/fade-factory/glasses.png',      6),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Puño',      '/avatars/fade-factory/fist.png',         7),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Joker',     '/avatars/fade-factory/joker.png',        8),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Fútbol',    '/avatars/fade-factory/soccer.png',       9),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Llama',     '/avatars/fade-factory/flame.png',       10),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'Azteca',    '/avatars/fade-factory/aztec.png',       11),
  ('f6b50767-0538-47ba-86a8-b0c0170b2d38', 'FF',        '/avatars/fade-factory/fade-factory.png', 12)
on conflict (shop_id, label) do update
  set image_url = excluded.image_url,
      sort_order = excluded.sort_order;
