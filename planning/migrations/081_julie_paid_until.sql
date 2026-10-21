-- ============================================================
-- NXTUP 081 · Julie: memoria de pago por ciclo (nunca cobrar dos veces)
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- Incidente Fade Factory (20-oct): activó Julie en la mañana (prorrateo
-- cobrado), el item se quitó a mitad del día, y al reactivar en la
-- noche se le cobró el prorrateo COMPLETO otra vez — el sistema no
-- recordaba que el ciclo ya estaba pagado.
--
-- julie_paid_until = fin del periodo cubierto por el último cobro de
-- Julie (se fija al cobrar una activación y lo refresca el webhook en
-- cada renovación con el item presente). Regla nueva en la ruta de
-- activación: si julie_paid_until > now(), el item se re-agrega SIN
-- prorrateo (proration 'none') — reactivar dentro del ciclo pagado es
-- GRATIS, cobrar de nuevo es imposible.
-- ============================================================

alter table public.subscriptions
  add column if not exists julie_paid_until timestamptz;

comment on column public.subscriptions.julie_paid_until is
  'Fin del periodo de Julie ya PAGADO. Reactivar antes de esta fecha no cobra (proration none). Escrito por la ruta de activación y el webhook. Ver 081.';

-- Backfill de los shops con Julie activa hoy: su ciclo vigente está
-- pagado hasta el current_period_end que ya espeja la tabla.
update public.subscriptions
set julie_paid_until = current_period_end
where julie_active = true and current_period_end is not null;

-- ── Verificación ────────────────────────────────────────────────────
select shop_id, julie_active, julie_paid_until
from public.subscriptions
where julie_active = true;
