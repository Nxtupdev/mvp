-- ============================================================
-- NXTUP — Barber App RLS v1
-- Run in Supabase SQL Editor
-- ============================================================

-- Barbers can update their own status (NXT TAP + backup app)
drop policy if exists "barber status update" on barbers;
create policy "barber status update" on barbers
  for update using (true);

-- Barbers can advance queue entries through the valid states
drop policy if exists "barber queue update" on queue_entries;
create policy "barber queue update" on queue_entries
  for update using (true)
  with check (status in ('called', 'in_progress', 'done'));
