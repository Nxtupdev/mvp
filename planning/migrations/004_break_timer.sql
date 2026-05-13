-- ============================================================
-- NXTUP — Break Timer v1
-- Run in Supabase SQL Editor
-- ============================================================

alter table shops
  add column if not exists break_duration_minutes integer not null default 15;

alter table barbers
  add column if not exists break_started_at timestamptz;
