-- ============================================================
-- NXTUP — Anti-cheat: trusted public IP per shop v1
-- Run in Supabase SQL Editor
--
-- A barber can cheat the FIFO by going ACTIVE from their phone at home
-- before they actually arrive. We block that by registering the shop's
-- public IP and only allowing → available transitions from a request
-- whose source IP matches.
--
--   * The owner registers the IP once from inside the shop (Settings).
--   * Any future tap on ACTIVE coming from a different IP is rejected.
--   * The physical NXT TAP device bypasses this (it carries a device
--     token + is bolted to the shop, so its presence proves location).
--   * If trusted_public_ip is NULL, the check is disabled (back-compat
--     for shops that haven't configured it yet).
-- ============================================================

alter table shops
  add column if not exists trusted_public_ip text;

-- Index isn't needed — we always look up shops by id, the IP is
-- compared in app code after the row is loaded.
