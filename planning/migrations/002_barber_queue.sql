-- ============================================================
-- NXTUP — Barber Queue v1
-- Run in Supabase SQL Editor
-- ============================================================

-- Add 'break' to barbers status + available_since for FIFO ordering
alter table barbers
  drop constraint if exists barbers_status_check;

alter table barbers
  add constraint barbers_status_check
    check (status in ('available', 'busy', 'break', 'offline'));

alter table barbers
  add column if not exists available_since timestamptz;

-- Index for finding next available barber (FIFO)
create index if not exists barbers_available_fifo
  on barbers (shop_id, available_since)
  where status = 'available';
