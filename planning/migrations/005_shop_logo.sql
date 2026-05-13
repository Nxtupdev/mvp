-- ============================================================
-- NXTUP — Shop logo storage v1
-- Run in Supabase SQL Editor
-- ============================================================

-- Add logo_url column
alter table shops
  add column if not exists logo_url text;

-- Create the public bucket for shop logos (idempotent)
insert into storage.buckets (id, name, public)
values ('shop-logos', 'shop-logos', true)
on conflict (id) do nothing;

-- Public read: TV display, check-in, etc. need to render logos without auth
drop policy if exists "shop-logos public read" on storage.objects;
create policy "shop-logos public read" on storage.objects
  for select using (bucket_id = 'shop-logos');

-- Owner-only upload: file goes into a folder named after the shop_id
-- the owner controls. Path format: {shop_id}/logo.{ext}
drop policy if exists "shop-logos owner upload" on storage.objects;
create policy "shop-logos owner upload" on storage.objects
  for insert with check (
    bucket_id = 'shop-logos'
    and auth.uid() is not null
    and (storage.foldername(name))[1] in (
      select id::text from shops where owner_id = auth.uid()
    )
  );

-- Owner-only update / delete on their own shop's files
drop policy if exists "shop-logos owner update" on storage.objects;
create policy "shop-logos owner update" on storage.objects
  for update using (
    bucket_id = 'shop-logos'
    and (storage.foldername(name))[1] in (
      select id::text from shops where owner_id = auth.uid()
    )
  );

drop policy if exists "shop-logos owner delete" on storage.objects;
create policy "shop-logos owner delete" on storage.objects
  for delete using (
    bucket_id = 'shop-logos'
    and (storage.foldername(name))[1] in (
      select id::text from shops where owner_id = auth.uid()
    )
  );
