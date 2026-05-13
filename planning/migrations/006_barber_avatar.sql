-- ============================================================
-- NXTUP — Barber avatar v1
-- Run in Supabase SQL Editor
-- ============================================================

-- Avatar id is a short string slug picked from a fixed catalog
-- defined in src/components/avatars.tsx. Validation lives in app
-- layer — keeping the column free-form so adding new avatars
-- doesn't require a migration.
alter table barbers
  add column if not exists avatar text;
