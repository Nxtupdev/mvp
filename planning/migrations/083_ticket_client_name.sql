-- ============================================================
-- NXTUP 083 · Nombre opcional del cliente en líneas registradas a mano
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ Correr ANTES de subir la pestaña "Mis clientes" del barbero.
--
-- Caso (25-oct, Francisco): barberos con CITAS atienden de corrido sin
-- pasar por la cola ni cambiar de estado, así que la hoja "¿Qué le
-- hiciste?" (que sale al cerrar un turno) nunca aparece y esos servicios
-- no entraban a las cuentas. La pestaña "Mis clientes" del barbero les
-- da "+ Registrar servicio": una línea de ticket SIN turno de la cola
-- (entry_id null), con el nombre del cliente opcional para que la lista
-- del día diga "Pedro · cita" y el dueño vea a quién fue en Cuentas.
--
-- Contabilidad: la línea manual es un ticket confirmado igual que los
-- demás (precio resuelto en el servidor), así que entra solo a Cuentas,
-- Reportes y Cierre. entry_id null = "manual" para la auditoría.
-- ============================================================

alter table tickets
  add column if not exists client_name text;

comment on column tickets.client_name is
  'Nombre del cliente (opcional) en líneas registradas a mano por el barbero (entry_id null). Ver 083.';

-- ── Verificación ────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_name = 'tickets' and column_name = 'client_name';
