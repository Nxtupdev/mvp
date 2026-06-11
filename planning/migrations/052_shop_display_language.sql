-- ============================================================
-- NXTUP — Migración 052
-- Idioma del TV (display_language)
--
-- Run in Supabase SQL Editor
--
-- Contexto: el TV (DisplayBoard) es una pantalla pública sin
-- interacción — nadie va a tocar un toggle de idioma ahí. Antes el
-- idioma salía de la cookie del dispositivo (`nxtup_locale`), lo que
-- es frágil para un Fire TV / tablet montada en la pared. Ahora el
-- dueño elige el idioma del TV desde Configuración y se guarda por
-- shop.
--
-- Valores: 'es' | 'en'. Default 'es' (mercado principal). Los shops
-- existentes arrancan en español.
--
-- NOTA: shops ya está en la publicación de realtime (migración 051),
-- así que el cambio de idioma se refleja en el TV en vivo sin recargar.
-- ============================================================

alter table public.shops
  add column if not exists display_language text not null default 'es';

-- Constraint suave: solo aceptamos los dos locales soportados. Si en
-- el futuro agregamos más idiomas, se amplía aquí.
do $$
begin
  alter table public.shops
    add constraint shops_display_language_check
    check (display_language in ('es', 'en'));
exception when duplicate_object then
  null; -- el constraint ya existe, nada que hacer
end $$;

-- ── Verificación ─────────────────────────────────────────────
--   select column_name, data_type, column_default
--   from information_schema.columns
--   where table_name = 'shops' and column_name = 'display_language';
--   → 1 fila: display_language · text · 'es'::text
