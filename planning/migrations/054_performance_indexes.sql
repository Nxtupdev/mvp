-- ============================================================
-- NXTUP — Migración 054
-- Índices de performance (preparación para escala)
--
-- Run in Supabase SQL Editor.
--
-- Contexto: tres consultas calientes no tenían índice de apoyo. A
-- bajo volumen no se nota, pero al crecer (más shops, más cola, más
-- historial de clientes) un seq scan se vuelve caro. Estos índices:
--   1. queue_entries 'called' por called_at → el cron de no-show en
--      cascada filtra por status='called' y called_at.
--   2. clients por (shop_id, first_visit_at) → stats de walk-ins
--      nuevos vs recurrentes.
--   3. queue_entries por (shop_id, client_phone, created_at) → el
--      rate-limit (3 check-ins/teléfono/día) y el historial por teléfono.
--
-- `if not exists` → idempotente, seguro de re-correr.
-- ============================================================

create index if not exists idx_queue_entries_called_at
  on public.queue_entries (called_at)
  where status = 'called';

create index if not exists idx_clients_shop_first_visit
  on public.clients (shop_id, first_visit_at);

create index if not exists idx_queue_entries_shop_phone_created
  on public.queue_entries (shop_id, client_phone, created_at);

-- ── Verificación ─────────────────────────────────────────────
--   select indexname from pg_indexes
--   where tablename in ('queue_entries','clients')
--     and indexname in (
--       'idx_queue_entries_called_at',
--       'idx_clients_shop_first_visit',
--       'idx_queue_entries_shop_phone_created'
--     );
--   → 3 filas
