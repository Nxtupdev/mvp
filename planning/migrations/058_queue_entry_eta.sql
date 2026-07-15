-- ============================================================
-- NXTUP 058 — ETA de llegada en la queue_entry (para el TV)
-- Run in Supabase SQL Editor
--
-- Mamacita ya manda `eta_at` en POST /api/mamacita/queue-entries
-- (hora estimada de llegada que Julie le pregunta al cliente por voz).
-- Hasta ahora era "informational only" y se descartaba. Esta columna
-- la persiste para mostrarla junto al nombre en el TV/cola, así el
-- barbero decide si espera a la reserva de voz.
--
-- Solo aplica a entradas de voz (mamacita_entry_id no nulo). Los
-- walk-ins presenciales nacen con eta_at NULL (ya están en la tienda).
-- ============================================================

alter table public.queue_entries
  add column if not exists eta_at timestamptz;

comment on column public.queue_entries.eta_at is
  'Hora estimada de llegada (ISO/UTC) que el cliente le dio a Julie por voz. Solo se llena en entradas de Mamacita (mamacita_entry_id no nulo). Se muestra en el TV junto al badge "En camino". NULL en walk-ins.';
