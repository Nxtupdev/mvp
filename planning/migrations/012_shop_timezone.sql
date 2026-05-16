-- ============================================================
-- NXTUP — Per-shop timezone v1
-- Run in Supabase SQL Editor
--
-- Stats / activity log / daily resets all need to compute 'today'
-- in the shop's local time, not Vercel's UTC. Storing an IANA
-- timezone string per shop lets us handle DR (UTC-4 fixed) and
-- US East (UTC-5 / UTC-4 with DST) correctly.
--
-- IANA references:
--   America/New_York        — US East, observes DST
--   America/Santo_Domingo   — DR, UTC-4 year-round
--   America/Mexico_City     — CDMX, observes DST
--   America/Bogota          — Colombia, UTC-5 fixed
--   America/Lima            — Peru, UTC-5 fixed
--   America/Caracas         — Venezuela, UTC-4 fixed
--
-- Default is America/New_York since that's where the first test
-- shops live. Each owner can change theirs in Settings.
-- ============================================================

alter table shops
  add column if not exists timezone text not null default 'America/New_York';
