-- ============================================================
-- NXTUP — Optional client phone v1
-- Run in Supabase SQL Editor
-- ============================================================
-- The new "tap to join" flow only requires a name. Phone is
-- nullable so we can drop it without breaking inserts. Existing
-- rows are unaffected.

alter table queue_entries
  alter column client_phone drop not null;
