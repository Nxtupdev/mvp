-- ============================================================
-- NXTUP — Seed inicial de servicios para Fade Factory
-- Run in Supabase SQL Editor
--
-- Contexto: la migración 032 creó la tabla `services` pero la dejó
-- vacía. El nuevo kiosko necesita servicios para que el cliente
-- pueda escoger en el check-in. Hasta que tengamos un settings UI
-- para que el dueño los gestione, este seed los inyecta a mano.
--
-- Servicios base elegidos por bench-test con barberías similares
-- en NC/RD. Duración en minutos (sin precio — cada barbero maneja
-- su propio precio, ver decisión en migración 032).
--
-- Idempotente: usa ON CONFLICT por (shop_id, name) para que
-- correrlo dos veces no duplique.
--
-- ⚠ Reemplazar el shop_id abajo por el de Fade Factory antes de
--   correr. Para encontrarlo:
--     select id, name from shops where name ilike '%fade%factory%';
-- ============================================================

-- Restricción única (shop_id, name) para que el ON CONFLICT funcione.
-- Si ya existe la creamos como no-op gracias al IF NOT EXISTS.
alter table services
  drop constraint if exists services_shop_id_name_unique;

alter table services
  add constraint services_shop_id_name_unique unique (shop_id, name);

-- ── Seed ─────────────────────────────────────────────────────
-- Pega aquí el UUID de Fade Factory:
--   select id from shops where name ilike '%fade%factory%';
do $$
declare
  v_shop_id uuid;
begin
  select id into v_shop_id
  from shops
  where name ilike '%fade%factory%'
  limit 1;

  if v_shop_id is null then
    raise exception 'No shop matching "Fade Factory" found. Update the WHERE clause and rerun.';
  end if;

  insert into services (shop_id, name, duration_minutes, sort_order)
  values
    (v_shop_id, 'Haircut',          30, 10),
    (v_shop_id, 'Beard Trim',       15, 20),
    (v_shop_id, 'Haircut + Beard',  45, 30),
    (v_shop_id, 'Kids Cut',         20, 40),
    (v_shop_id, 'Line Up',          10, 50),
    (v_shop_id, 'Hot Towel Shave',  30, 60)
  on conflict (shop_id, name) do update
    set duration_minutes = excluded.duration_minutes,
        sort_order = excluded.sort_order,
        active = true;

  raise notice 'Seeded 6 services for shop %', v_shop_id;
end$$;

-- ── Verificación ─────────────────────────────────────────────
-- Tras correrlo, deberías ver 6 filas:
--
--   select s.name, s.duration_minutes, s.sort_order, s.active
--   from services s
--   join shops sh on sh.id = s.shop_id
--   where sh.name ilike '%fade%factory%'
--   order by s.sort_order;
