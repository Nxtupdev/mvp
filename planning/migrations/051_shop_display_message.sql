-- ============================================================
-- NXTUP — Migración 051
-- Mensaje del cintillo del TV (display_message)
--
-- Run in Supabase SQL Editor
--
-- Contexto: rediseño de la pantalla del TV (DisplayBoard). El cintillo
-- de abajo dejó de rotar los nombres de los clientes en cola (esos se
-- movieron a una columna fija "En cola") y ahora rota un mensaje que
-- el dueño escribe desde Configuración — promos, avisos, horarios
-- especiales ("2x1 mañana por el 4 de julio", "cerramos a las 6 hoy",
-- etc.).
--
-- Esta migración solo agrega la columna donde se guarda ese texto.
-- Nullable + default null: shops sin mensaje configurado simplemente
-- no muestran cintillo (las columnas usan todo el alto de la TV).
-- ============================================================

alter table public.shops
  add column if not exists display_message text;

-- ── Realtime en shops ────────────────────────────────────────
-- El DisplayBoard (TV) se suscribe a cambios de `shops` para refrescar
-- el cintillo del mensaje (y is_open/logo/nombre) en vivo sin recargar.
-- Pero shops nunca estuvo en la publicación de realtime (solo lo
-- estaban queue_entries/barbers/activity_log desde las migraciones
-- 001/009). Sin esto, la suscripción no recibe eventos y el TV solo
-- se actualiza al recargar. Idempotente: si ya está, no hace nada.
do $$
begin
  alter publication supabase_realtime add table public.shops;
exception when duplicate_object then
  null; -- shops ya estaba en la publicación, nada que hacer
end $$;

-- ── Verificación ─────────────────────────────────────────────
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'shops' and column_name = 'display_message';
--   → 1 fila: display_message · text · YES
--
--   select tablename from pg_publication_tables
--   where pubname = 'supabase_realtime' and tablename = 'shops';
--   → 1 fila: shops
