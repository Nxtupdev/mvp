-- ============================================================
-- NXTUP 059 — Función reset_demo_shop() (para el botón "Resetear demo")
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- Reseed idempotente de la barbería demo (misma data que
-- planning/demo/seed_demo_shop.sql, ahora como función reusable). El
-- botón del dashboard la invoca vía /api/demo/reset. SOLO toca el shop
-- del dueño demo (demo@getnxtup.com) — nunca un shop real.
--
-- security definer → corre como owner (bypassa RLS: lee auth.users,
-- inserta clients, etc.). Grant SOLO a service_role → solo el servidor
-- (admin client) puede invocarla; el endpoint además exige que el
-- usuario logueado sea el dueño demo.
-- ============================================================

create or replace function reset_demo_shop()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner uuid;
  v_shop  uuid;
  b_carlos uuid; b_miguel uuid; b_andres uuid; b_jose uuid;
  c_juan uuid; c_pedro uuid; c_diego uuid;
  c_luis uuid; c_marcos uuid; c_samuel uuid; c_kevin uuid; c_roberto uuid;
begin
  select id into v_owner from auth.users where email = 'demo@getnxtup.com' limit 1;
  if v_owner is null then
    raise exception 'Falta el usuario demo@getnxtup.com en Auth.';
  end if;

  -- Shop demo con id ESTABLE (no cambia entre resets → URLs fijas)
  select id into v_shop from shops where owner_id = v_owner order by created_at asc limit 1;
  if v_shop is null then
    insert into shops (name, owner_id, is_open, max_queue_size,
                       display_message, display_language, timezone, trusted_public_ip)
    values ('NXTUP Demo', v_owner, true, 20,
            'Bienvenido a NXTUP · turnos en vivo, sin trampa · demo',
            'es', 'America/New_York', null)
    returning id into v_shop;
  else
    update shops set
      name = 'NXTUP Demo', is_open = true, max_queue_size = 20,
      display_message = 'Bienvenido a NXTUP · turnos en vivo, sin trampa · demo',
      display_language = 'es', timezone = 'America/New_York', trusted_public_ip = null
    where id = v_shop;
  end if;

  delete from queue_entries where shop_id = v_shop;
  delete from clients       where shop_id = v_shop;
  delete from services      where shop_id = v_shop;
  delete from barbers       where shop_id = v_shop;

  insert into services (shop_id, name, duration_minutes, sort_order, price, active) values
    (v_shop, 'Corte',           30, 10, 25.00, true),
    (v_shop, 'Barba',           15, 20, 15.00, true),
    (v_shop, 'Corte + Barba',   45, 30, 35.00, true),
    (v_shop, 'Corte Niño',      20, 40, 18.00, true),
    (v_shop, 'Delineado',       10, 50, 12.00, true),
    (v_shop, 'Afeitado Toalla', 30, 60, 30.00, true);

  insert into barbers (shop_id, name, status, available_since)
    values (v_shop, 'Carlos', 'available', now() - interval '9 min') returning id into b_carlos;
  insert into barbers (shop_id, name, status, available_since)
    values (v_shop, 'José',   'available', now() - interval '4 min') returning id into b_jose;
  insert into barbers (shop_id, name, status)
    values (v_shop, 'Miguel', 'busy') returning id into b_miguel;
  insert into barbers (shop_id, name, status, break_started_at, break_minutes_at_start)
    values (v_shop, 'Andrés', 'break', now() - interval '3 min', 10) returning id into b_andres;

  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000001','Juan',   'google',   now()-interval '40 days', now()-interval '5 days',  4,'es') returning id into c_juan;
  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000002','Pedro',  'friend',   now()-interval '12 days', now()-interval '2 days',  3,'es') returning id into c_pedro;
  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000003','Diego',  'walk-by',  now()-interval '6 days',  now()-interval '6 days',  2,'es') returning id into c_diego;
  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000004','Luis',   'friend',   now()-interval '18 min',  now()-interval '18 min',  1,'es') returning id into c_luis;
  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000005','Marcos', 'walk-by',  now()-interval '9 min',   now()-interval '9 min',   1,'en') returning id into c_marcos;
  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000006','Samuel', 'google',   now()-interval '5 min',   now()-interval '5 min',   1,'es') returning id into c_samuel;
  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000007','Kevin',  'instagram',now()-interval '50 min',  now()-interval '50 min',  1,'es') returning id into c_kevin;
  insert into clients (shop_id, phone_number, first_name, referral_source, first_visit_at, last_visit_at, total_visits, preferred_language)
    values (v_shop,'9190000008','Roberto','tiktok',   now()-interval '70 min',  now()-interval '70 min',  1,'es') returning id into c_roberto;

  insert into queue_entries (shop_id, client_id, client_name, client_phone, barber_id, position, status, created_at, called_at, completed_at, arrived_at) values
    (v_shop, c_juan,   'Juan',   '9190000001', b_carlos, 1, 'done', now()-interval '3 hours',        now()-interval '2 hours 52 min', now()-interval '2 hours 25 min', now()-interval '3 hours'),
    (v_shop, c_pedro,  'Pedro',  '9190000002', b_miguel, 2, 'done', now()-interval '2 hours 20 min', now()-interval '2 hours 10 min', now()-interval '1 hour 48 min',  now()-interval '2 hours 20 min'),
    (v_shop, c_diego,  'Diego',  '9190000003', b_carlos, 3, 'done', now()-interval '95 min',         now()-interval '86 min',         now()-interval '64 min',         now()-interval '95 min'),
    (v_shop, c_roberto,'Roberto','9190000008', b_jose,   4, 'done', now()-interval '70 min',         now()-interval '61 min',         now()-interval '40 min',         now()-interval '70 min'),
    (v_shop, c_kevin,  'Kevin',  '9190000007', b_miguel, 5, 'done', now()-interval '50 min',         now()-interval '43 min',         now()-interval '22 min',         now()-interval '50 min');

  insert into queue_entries (shop_id, client_id, client_name, client_phone, barber_id, position, status, created_at, called_at, arrived_at)
    values (v_shop, c_luis, 'Luis', '9190000004', b_miguel, 6, 'in_progress', now()-interval '18 min', now()-interval '12 min', now()-interval '18 min');
  insert into queue_entries (shop_id, client_id, client_name, client_phone, position, status, created_at, arrived_at) values
    (v_shop, c_marcos, 'Marcos', '9190000005', 7, 'waiting', now()-interval '9 min', now()-interval '9 min'),
    (v_shop, c_samuel, 'Samuel', '9190000006', 8, 'waiting', now()-interval '5 min', now()-interval '5 min');
  insert into queue_entries (shop_id, client_name, client_phone, position, status, created_at, mamacita_entry_id, check_in_code, eta_at)
    values (v_shop, 'Ricardo', '9190000009', 9, 'waiting', now()-interval '6 min', gen_random_uuid(), 'A7K2', now()+interval '12 min');

  return v_shop;
end;
$$;

grant execute on function reset_demo_shop() to service_role;
