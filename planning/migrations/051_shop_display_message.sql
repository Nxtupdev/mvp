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

-- ── Verificación ─────────────────────────────────────────────
--   select column_name, data_type, is_nullable
--   from information_schema.columns
--   where table_name = 'shops' and column_name = 'display_message';
--   → 1 fila: display_message · text · YES
