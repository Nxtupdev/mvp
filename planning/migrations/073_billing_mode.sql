-- ============================================================
-- NXTUP 073 · billing_mode: quién manda sobre el acceso del shop
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES del deploy del billing (la página lo selecciona).
--
-- Port del dealer (su migración 071): además del flujo normal por
-- Stripe, los socios necesitan dos excepciones del mundo real:
--   'contract' → shop facturado por fuera (acuerdo directo/grupo);
--                activo sin pasar por Stripe.
--   'comp'     → cortesía (el clásico favor de socio); activo gratis.
-- En ambos, el webhook de Stripe NO decide el acceso. El default
-- 'stripe' deja todo como el flujo normal de checkout.
--
-- Cambiar el modo de un shop es un UPDATE manual del staff (no hay
-- UI a propósito: es una decisión de socios, no un botón del dueño).
-- ============================================================

alter table public.subscriptions
  add column if not exists billing_mode text not null default 'stripe'
    check (billing_mode in ('stripe', 'contract', 'comp'));

comment on column public.subscriptions.billing_mode is
  'stripe = el webhook decide (flujo normal); contract/comp = activo sin Stripe (facturación por fuera o cortesía de socios). Ver 073.';

-- ── Verificación ────────────────────────────────────────────────────
select column_name, column_default
from information_schema.columns
where table_name = 'subscriptions' and column_name = 'billing_mode';
