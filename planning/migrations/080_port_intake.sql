-- ============================================================
-- NXTUP 080 · Porte del número de Julie: enlace de intake + fecha de corte
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- Contrato final del porte (19-oct, decisión de Francisco = opción A
-- mejorada): NXTUP captura SOLO lo no sensible (número a portar,
-- operador, nombre del titular) y Mamacita devuelve un ENLACE SEGURO
-- de un solo uso (expira en 7 días) donde el dueño mete cuenta/PIN/
-- factura/LOA directo a la tabla purgable de Mamacita — lo sensible
-- jamás toca NXTUP. Ops somete el porte a mano en Twilio y avanza el
-- estado; NXTUP lo consulta con mamacita-port-status al cargar la
-- página.
--
--   * intake_url: el enlace seguro que la UI le muestra al dueño
--     mientras el estado sea info_required (= "collecting" del lado
--     Mamacita).
--   * foc_date: fecha de corte del porte (status "scheduled" de
--     Mamacita = porting_in_progress local, con fecha visible).
--
-- Mapeo de estados Mamacita → julie_numbers (sin tocar el check):
--   collecting → info_required · submitted → submitted ·
--   scheduled → porting_in_progress · completed → completed ·
--   rejected/cancelled → failed (fail_reason = reject_reason)
-- ============================================================

alter table julie_numbers
  add column if not exists intake_url text,
  add column if not exists foc_date date;

comment on column julie_numbers.intake_url is
  'Enlace seguro de Mamacita donde el dueño completa los datos sensibles del porte (un solo uso, expira 7 días). Solo choice=port. Ver 080.';
comment on column julie_numbers.foc_date is
  'Fecha de corte del porte (FOC) cuando Mamacita lo programa. Ver 080.';

-- ── Verificación ────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_name = 'julie_numbers'
  and column_name in ('intake_url', 'foc_date');
