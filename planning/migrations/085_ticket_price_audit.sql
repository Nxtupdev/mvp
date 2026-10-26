-- ============================================================
-- NXTUP 085 · Precio libre en los tickets + auditoría de correcciones
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- Correr ANTES de subir el código (el código es fail-open: sin estas
-- columnas guarda las líneas igual, solo sin las marcas "revisar" y
-- "corregido").
--
-- Caso (25-oct, Francisco + dueños): el precio no puede ser fijo — una
-- rayita, una gelatina, un tinte mueven el precio $5–10 arriba o abajo.
-- El barbero ahora parte del precio de lista y lo ajusta (±5 o
-- tecleado), y puede agregar una categoría propia ("Otro": tinte de
-- pelo…) que existe solo para los reportes. Con precio libre llegan
-- los errores de dedo (650 en vez de 65), así que:
--   * list_price   = precio de lista del servicio AL MOMENTO de la
--                    línea (snapshot; null en categorías propias). La
--                    línea cuyo monto se aleja mucho de él se marca
--                    "revisar" en Cuentas.
--   * corrected_at = cuándo la corrigió el dueño por última vez. La
--                    línea se marca "corregido"; el antes/después vive
--                    en activity_log ('ticket_corrected').
-- Las líneas viejas quedan con ambas en null: sin marcas, sin cambios.
-- Idempotente (add column if not exists).
-- ============================================================

alter table tickets
  add column if not exists list_price numeric(8,2);

alter table tickets
  add column if not exists corrected_at timestamptz;

comment on column tickets.list_price is
  'Precio de lista del servicio cuando se registró la línea (snapshot). Null en categorías propias del barbero. Ver 085.';
comment on column tickets.corrected_at is
  'Última corrección del dueño (monto/servicio). El antes/después está en activity_log ticket_corrected. Ver 085.';

-- ── Verificación: deben salir las dos columnas ──────────────────────
select column_name from information_schema.columns
where table_name = 'tickets' and column_name in ('list_price', 'corrected_at');
