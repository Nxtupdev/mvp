-- ============================================================
-- NXTUP 061 — Billing (Stripe): estado de suscripción por shop
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- 1 shop = 1 suscripción (owner↔shop es 1:1 en NXTUP). El dueño (auth
-- user) es el Customer de Stripe; el shop es el sujeto de la suscripción.
-- Solo el webhook (service role) escribe aquí; el dueño puede LEER la suya
-- para la UI de billing.
-- ============================================================

create table if not exists subscriptions (
  shop_id                uuid primary key references shops(id) on delete cascade,
  stripe_customer_id     text unique,
  stripe_subscription_id text unique,
  status                 text not null default 'none'
    check (status in (
      'none','trialing','active','past_due','canceled',
      'unpaid','incomplete','incomplete_expired','paused'
    )),
  plan                   text,           -- clave interna del plan (ej. 'pro')
  price_id               text,           -- Stripe Price id activo
  current_period_end     timestamptz,
  cancel_at_period_end   boolean not null default false,
  trial_end              timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_subscriptions_customer
  on subscriptions(stripe_customer_id) where stripe_customer_id is not null;

alter table subscriptions enable row level security;

-- El dueño lee la suscripción de SU shop (para la UI de billing).
drop policy if exists "owner reads own subscription" on subscriptions;
create policy "owner reads own subscription" on subscriptions
  for select using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

-- Sin policies de escritura: solo el webhook (service role) escribe, y el
-- service role bypassa RLS. Nadie más muta el estado de billing.

comment on table subscriptions is
  'Estado de suscripción Stripe por shop. Escrito SOLO por el webhook (service role). El dueño lee la suya vía RLS. Ver src/lib/billing.ts.';
