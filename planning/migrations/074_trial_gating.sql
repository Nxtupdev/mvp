-- ============================================================
-- NXTUP 074 · Puerta de cobro: trial_ends_at por shop
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- Orden: el código es fail-open si la columna no existe, así que no
-- rompe nada deployar antes — pero correrla esta semana deja las
-- fechas de los pilotos listas antes del lunes 12.
--
-- Decisión de Francisco (6-oct-2026): los cobros arrancan el LUNES
-- 12 DE OCTUBRE; hasta entonces el servicio sigue intacto. Los shops
-- nuevos reciben 14 días de prueba automáticos al crearse, sin
-- tarjeta. No hay interruptor global: la puerta vive en datos, por
-- shop, y los socios pueden extender una prueba con un UPDATE.
--
-- Regla de acceso (src/lib/billing-access.ts):
--   contract/comp → siempre activo (073)
--   Stripe trialing/active/past_due → activo (past_due: la gracia es
--     la ventana de reintentos de Stripe; si los agota pasa a
--     canceled/unpaid y ahí sí cierra)
--   si no: now() < shops.trial_ends_at → activo (en prueba)
--   si no → bloqueado: kiosko 402 + Julie lo oye como "cerrado". El
--     TV, el dashboard y los paneles siguen vivos para drenar el piso
--     — nunca dejamos clientes ya formados colgados por un cobro.
-- ============================================================

-- 1) Columna: los shops NUEVOS nacen con 14 días de prueba.
alter table public.shops
  add column if not exists trial_ends_at timestamptz
    not null default (now() + interval '14 days');

comment on column public.shops.trial_ends_at is
  'Fin del periodo de prueba. Sin suscripción activa y con esta fecha pasada, el shop no recibe clientes nuevos (kiosko/Julie cerrados). Default: 14 días desde la creación. Ver 074 + src/lib/billing-access.ts.';

-- 2) Shops EXISTENTES (pilotos): su "prueba" termina el lunes 12 de
--    octubre a las 4am ET, el día que arrancan los cobros. El guard
--    por created_at hace la migración re-corrible sin pisar los
--    trials de shops que se registren después de hoy.
update public.shops
  set trial_ends_at = timestamptz '2026-10-12 04:00:00-04'
  where created_at < timestamptz '2026-10-06 00:00:00-04';

-- 3) El shop DEMO queda en cortesía permanente ('comp', 073): las
--    demos a dueños nunca deben chocar con la puerta de cobro.
--    Se ubica por el email del dueño demo (mismo método que el seed),
--    sin UUIDs pegados a mano. De paso esto deja al demo inmune al
--    switch test→live de Stripe (su suscripción de prueba con la
--    tarjeta 4242 deja de importar: comp manda).
do $$
declare
  v_shop uuid;
begin
  select s.id into v_shop
  from public.shops s
  join auth.users u on u.id = s.owner_id
  where u.email = 'demo@getnxtup.com'
  order by s.created_at asc
  limit 1;

  if v_shop is null then
    raise notice 'Shop demo no encontrado - paso sin tocar subscriptions.';
  else
    insert into public.subscriptions (shop_id, billing_mode)
    values (v_shop, 'comp')
    on conflict (shop_id) do update
      set billing_mode = 'comp', updated_at = now();
  end if;
end $$;

-- ── Verificación ────────────────────────────────────────────────────
-- Todos los shops con su fecha (los existentes deben decir 2026-10-12
-- 08:00:00+00, que es 4am ET):
select name, created_at, trial_ends_at from public.shops order by created_at;

-- El demo debe salir billing_mode = 'comp':
select s.name, b.billing_mode, b.status
from public.subscriptions b
join public.shops s on s.id = b.shop_id;
