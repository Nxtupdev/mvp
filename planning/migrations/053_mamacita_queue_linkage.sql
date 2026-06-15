-- ============================================================
-- NXTUP — Migración 053
-- Vínculo de queue_entries con Mamacita (agente de voz)
--
-- Run in Supabase SQL Editor
--
-- Contexto: Mamacita (agente de voz IA, repo separado) toma llamadas
-- telefónicas y, cuando el cliente confirma que va, inserta una entrada
-- en la cola de NXTUP vía POST /api/mamacita/queue-entries. Para poder
-- (a) evitar duplicados si Mamacita reintenta y (b) devolver eventos a
-- Mamacita (webhook "ya casi te toca") referenciando SU id, guardamos
-- dos campos en queue_entries:
--
--   mamacita_entry_id — el UUID de la queue_entry en la DB de Mamacita.
--                       NULL para entradas creadas por kiosk/walk-in.
--                       UNIQUE → idempotencia: un reintento de Mamacita
--                       con el mismo id no crea una segunda fila.
--   check_in_code     — el código de 4 chars que Mamacita ya le dio al
--                       cliente por WhatsApp. Lo mostramos igual en el
--                       kiosk/TV para que el cliente lo reconozca.
--
-- Side effects: ninguno sobre filas existentes (ambas columnas nullable,
-- sin default). No toca RLS ni grants (queue_entries ya los tiene desde
-- migraciones previas). El UNIQUE parcial solo aplica a filas con
-- mamacita_entry_id no nulo, así que no afecta las walk-in existentes.
--
-- Idempotencia: `add column if not exists` + índice `if not exists`.
-- Correr dos veces es seguro.
-- ============================================================

alter table public.queue_entries
  add column if not exists mamacita_entry_id uuid,
  add column if not exists check_in_code text,
  add column if not exists arrived_at timestamptz;

-- arrived_at — marca de presencia física. Spec:
-- planning/integration/voice-presence-spec.md
--
--   * Walk-ins del kiosk: NO usan esta columna (siempre presentes). Se
--     quedan en NULL y el match los trata como elegibles vía el OR de
--     mamacita_entry_id IS NULL (ver state/route.ts y kiosk/checkin).
--   * Entradas de voz (Mamacita): nacen con arrived_at NULL = "reservó,
--     viene en camino". El match las IGNORA hasta que el kiosk las activa
--     (arrived_at = now) cuando el cliente llega y teclea su teléfono.
--
-- Backfill: ninguno necesario. Las filas existentes (todas walk-in)
-- quedan con arrived_at NULL y mamacita_entry_id NULL → el match las
-- sigue tomando igual que siempre (el OR de mamacita_entry_id IS NULL
-- las cubre). Solo las entradas de voz futuras dependen de arrived_at.

-- UNIQUE parcial: solo una queue_entry de NXTUP por entrada de Mamacita.
-- Parcial (where ... is not null) para no chocar con las miles de
-- entradas walk-in que tienen el campo en NULL.
create unique index if not exists idx_queue_entries_mamacita_entry_id
  on public.queue_entries (mamacita_entry_id)
  where mamacita_entry_id is not null;

comment on column public.queue_entries.mamacita_entry_id is
  'UUID de la queue_entry correspondiente en Mamacita (agente de voz). NULL para walk-ins. Usado para idempotencia y para referenciar la entrada en webhooks de vuelta a Mamacita.';
comment on column public.queue_entries.check_in_code is
  'Código de check-in de 4 chars que Mamacita le dio al cliente por WhatsApp. NULL para walk-ins (esos hacen check-in con teléfono en el kiosk).';
comment on column public.queue_entries.arrived_at is
  'Marca de presencia física. NULL = entrada de voz que aún no llega (no elegible para match). Set al hacer check-in en el kiosk. Walk-ins quedan NULL pero son elegibles vía mamacita_entry_id IS NULL. Ver planning/integration/voice-presence-spec.md';

-- ── Verificación ─────────────────────────────────────────────
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'queue_entries'
--     and column_name in ('mamacita_entry_id', 'check_in_code');
--   → 2 filas, ambas is_nullable = YES
--
--   select indexname from pg_indexes
--   where tablename = 'queue_entries'
--     and indexname = 'idx_queue_entries_mamacita_entry_id';
--   → 1 fila
