-- ============================================================
-- NXTUP 076 · Add-on Julie (voz): flag de estado por shop
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES del deploy del add-on (el webhook y la página lo leen).
--
-- Julie se cobra como ITEM adicional dentro de la MISMA suscripción
-- Stripe del shop (factura única $150 = Queue $50 + Julie $100). La
-- fuente de verdad es Stripe (los items de la suscripción); esta
-- columna es el espejo local que escribe SOLO el webhook, para la UI
-- del dueño y el reporte mensual de liquidación con Softmedia.
--
-- Reglas del add-on (acordadas 17-oct):
--   * Activar = prorrateo inmediato COBRADO al momento (sin días gratis).
--   * Enciende solo tras aceptar el pago; desactivar = sin crédito.
--   * Requiere la suscripción del Queue ACTIVA (un item no vive sin su
--     suscripción madre) — un shop en prueba por fecha no puede activarla.
-- ============================================================

alter table public.subscriptions
  add column if not exists julie_active boolean not null default false;

comment on column public.subscriptions.julie_active is
  'Add-on Julie (voz) activo: espejo de la presencia del item STRIPE_PRICE_JULIE en la suscripción. Escrito SOLO por el webhook; al cambiar se emite julie_enabled a Mamacita. Ver 076 y src/app/api/billing/julie/route.ts.';

-- ── Verificación ────────────────────────────────────────────────────
select column_name, column_default
from information_schema.columns
where table_name = 'subscriptions' and column_name = 'julie_active';
