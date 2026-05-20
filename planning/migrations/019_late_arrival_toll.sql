-- ============================================================
-- NXTUP — Late arrival toll v1
-- Run in Supabase SQL Editor (before 020)
--
-- Regla real de las barberías: cuando un barbero llega TARDE
-- (después de que el resto del equipo ya está trabajando), no
-- puede saltar a la FIFO y robarle turnos a los que llegaron
-- temprano. Para imponer fairness, el tarde paga un PEAJE:
--
--   * Cada barbero existente debe completar N cortes más
--     (configurable, default 2) antes de quedar por DEBAJO del
--     tarde en la FIFO.
--   * Mientras paga peaje, el tarde aparece en el TV (color
--     naranja + contador) pero el auto-call lo SALTA.
--   * Conforme cada existente paga sus 2 cortes, va cayendo por
--     debajo del tarde y éste sube naturalmente.
--
-- Escenario clásico:
--   8 AM: A, B, C, D, E abren la barbería, todos tocan ACTIVE
--   12:30 PM: José llega, toca ACTIVE
--   José recibe 5 filas de peaje (una por barbero existente),
--   cada una = 2 cortes restantes.
--   José bloqueado del auto-call hasta que las 5 lleguen a 0.
--
-- Configuración (por tienda):
--   * shops.late_arrival_threshold_time time
--     Hora local del día a partir de la cual los OFFLINE→ACTIVE
--     activan el peaje. NULL = feature apagada (default).
--   * shops.late_arrival_cuts_required smallint (1 o 2, default 2)
--     Cuántos cortes debe cada existente para "saldar" al tarde.
--   * shops.timezone text (default 'America/New_York')
--     Zona horaria IANA para comparar el threshold con "ahora".
--
-- Decisiones tomadas con el usuario:
--   * Trigger: OFFLINE → ACTIVE, ahora local ≥ threshold, y
--     hay otros barberos 'available' o 'busy' en la tienda.
--   * Break → ACTIVE: NO trigger (mismo turno, no es "llegada").
--   * Peaje persiste si el tarde va a break (vuelve debiendo).
--   * Peaje se borra completo si el tarde va offline.
--   * Si un existente va offline antes de pagar sus 2 cortes,
--     sus obligaciones a tardes se evaporan (tarde unblockea).
--   * Counter denormalizado barbers.late_toll_remaining para
--     que los queries de FIFO sean rápidos.
-- ============================================================

-- ── 1. Config a nivel de tienda ──────────────────────────────
alter table shops
  add column if not exists timezone text not null default 'America/New_York';

alter table shops
  add column if not exists late_arrival_threshold_time time;

alter table shops
  add column if not exists late_arrival_cuts_required smallint
    not null default 2
    check (late_arrival_cuts_required in (1, 2));

comment on column shops.late_arrival_threshold_time is
  'Hora local del día (en shops.timezone) a partir de la cual '
  'un OFFLINE→ACTIVE dispara el peaje de llegada tarde. NULL = '
  'feature desactivada.';

comment on column shops.late_arrival_cuts_required is
  'Cuántos cortes debe cada barbero existente para que el tarde '
  'lo supere en la FIFO. 1 o 2 (default 2).';

-- ── 2. Counter denormalizado en barbers ──────────────────────
alter table barbers
  add column if not exists late_toll_remaining smallint not null default 0;

comment on column barbers.late_toll_remaining is
  'Número de barberos existentes que aún le deben cortes a éste. '
  'Si >0 el barbero está pagando peaje (no recibe clientes). '
  'Denormalizado desde late_arrival_toll para queries rápidos.';

-- ── 3. Tabla junction tracking obligaciones individuales ─────
create table if not exists late_arrival_toll (
  late_barber_id     uuid not null references barbers(id) on delete cascade,
  existing_barber_id uuid not null references barbers(id) on delete cascade,
  shop_id            uuid not null references shops(id) on delete cascade,
  cuts_remaining     smallint not null default 2 check (cuts_remaining > 0),
  created_at         timestamptz not null default now(),
  primary key (late_barber_id, existing_barber_id)
);

create index if not exists idx_late_arrival_toll_existing
  on late_arrival_toll(existing_barber_id);
create index if not exists idx_late_arrival_toll_late
  on late_arrival_toll(late_barber_id);
create index if not exists idx_late_arrival_toll_shop
  on late_arrival_toll(shop_id);

-- RLS — lectura pública (data per-shop no sensible; TV display
-- la necesita). Writes solo vía funciones SECURITY DEFINER.
alter table late_arrival_toll enable row level security;

drop policy if exists "public read late_arrival_toll" on late_arrival_toll;
create policy "public read late_arrival_toll"
  on late_arrival_toll for select using (true);

-- ── 4. Helper: recompute counter for one barber ──────────────
-- Se llama desde los otros helpers después de cambiar la tabla.
-- Mantenerlo separado simplifica el bookkeeping y permite usarlo
-- como "rebuild" si el counter alguna vez se desincroniza.
create or replace function recompute_late_toll(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count smallint;
begin
  select count(distinct existing_barber_id)::smallint
    into v_count
    from late_arrival_toll
    where late_barber_id = p_barber_id;
  update barbers set late_toll_remaining = coalesce(v_count, 0)
    where id = p_barber_id;
  return coalesce(v_count, 0);
end;
$$;

-- ── 5. register_late_arrival: llamado en OFFLINE → AVAILABLE ─
-- Evalúa si este barbero cualifica como tarde AHORA y crea las
-- filas de peaje si aplica. Idempotente: ON CONFLICT DO NOTHING
-- evita duplicados si el barbero ya tenía filas (no debería en
-- la práctica porque clear se llama al ir offline).
--
-- Retorna # de filas creadas (0 = no aplicó el peaje).
create or replace function register_late_arrival(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id      uuid;
  v_tz           text;
  v_threshold    time;
  v_required     smallint;
  v_now          timestamptz := now();
  v_local_time   time;
  v_inserted     smallint := 0;
begin
  -- Cargar config de la tienda en una sola query
  select s.id, s.timezone, s.late_arrival_threshold_time,
         s.late_arrival_cuts_required
    into v_shop_id, v_tz, v_threshold, v_required
    from barbers b
    join shops s on s.id = b.shop_id
    where b.id = p_barber_id;

  -- Sin shop = no aplica
  if v_shop_id is null then return 0; end if;
  -- Feature apagada
  if v_threshold is null then return 0; end if;

  -- Comparar hora local actual con el threshold
  v_local_time := (v_now at time zone v_tz)::time;
  if v_local_time < v_threshold then return 0; end if;

  v_required := coalesce(v_required, 2);

  -- Crear una fila por cada barbero existente (active o busy)
  -- que no sea este mismo. ON CONFLICT por si quedó alguna fila
  -- huérfana de una sesión anterior.
  insert into late_arrival_toll
    (late_barber_id, existing_barber_id, shop_id, cuts_remaining)
  select p_barber_id, b.id, v_shop_id, v_required
    from barbers b
    where b.shop_id = v_shop_id
      and b.id <> p_barber_id
      and b.status in ('available', 'busy')
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  -- Actualizar el counter denormalizado de este barbero
  perform recompute_late_toll(p_barber_id);

  return v_inserted;
end;
$$;

-- ── 6. pay_late_arrival_toll: llamado al completar un corte ──
-- "Completar un corte" = transición busy→available con al menos
-- 1 queue_entry transicionando de in_progress→done. El caller
-- (state route o device RPC) decide cuándo invocarla.
--
-- Decrementa cuts_remaining en TODAS las filas donde este es el
-- existing_barber. Borra las que lleguen a 0 (cuts_remaining tiene
-- CHECK > 0). Refresca el counter de los barberos tarde afectados.
--
-- Retorna # de barberos tarde cuyo conteo se movió.
create or replace function pay_late_arrival_toll(p_existing_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_late_ids uuid[];
begin
  -- Step 1: decrementar y capturar quiénes fueron afectados.
  -- Hacemos la actualización en un CTE para poder atrapar los
  -- late_barber_id en el mismo round-trip.
  with decremented as (
    update late_arrival_toll
      set cuts_remaining = cuts_remaining - 1
      where existing_barber_id = p_existing_barber_id
        and cuts_remaining > 0
      returning late_barber_id, cuts_remaining
  )
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from decremented;

  -- Step 2: borrar filas que llegaron a 0. El CHECK constraint
  -- (cuts_remaining > 0) las haría inválidas en el próximo
  -- decremento, pero también semánticamente "0 cortes restantes"
  -- = obligación pagada y se va.
  delete from late_arrival_toll
    where existing_barber_id = p_existing_barber_id
      and cuts_remaining = 0;

  -- Step 3: refrescar counter denormalizado para los afectados.
  -- Lo hacemos en un solo UPDATE en vez de loop por performance.
  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = (
        select count(distinct existing_barber_id)::smallint
        from late_arrival_toll
        where late_barber_id = barbers.id
      )
      where id = any(v_affected_late_ids);
  end if;

  return coalesce(array_length(v_affected_late_ids, 1), 0);
end;
$$;

-- ── 7. clear_late_arrival_toll: llamado al ir OFFLINE ────────
-- Borra TODAS las filas que involucran a este barbero:
--   * Filas donde es late_barber: se rinde, pierde su espera.
--   * Filas donde es existing_barber: su obligación se evapora;
--     los tardes que esperaban por él quedan parcialmente libres.
--
-- También usado por la cascada del 018 al auto-offlinear un
-- barbero que no respondió en 90s.
create or replace function clear_late_arrival_toll(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_affected_late_ids uuid[];
  v_deleted          smallint;
begin
  -- Capturar los late_barbers que tenían a este como existing
  -- antes de borrar (para refrescar sus counters después).
  select array_agg(distinct late_barber_id) into v_affected_late_ids
    from late_arrival_toll
    where existing_barber_id = p_barber_id;

  delete from late_arrival_toll
    where late_barber_id = p_barber_id
       or existing_barber_id = p_barber_id;
  get diagnostics v_deleted = row_count;

  -- Este barbero ya no es tarde (si lo era)
  update barbers set late_toll_remaining = 0 where id = p_barber_id;

  -- Refrescar a los tardes que dependían de este
  if v_affected_late_ids is not null then
    update barbers
      set late_toll_remaining = (
        select count(distinct existing_barber_id)::smallint
        from late_arrival_toll
        where late_barber_id = barbers.id
      )
      where id = any(v_affected_late_ids);
  end if;

  return v_deleted;
end;
$$;

-- Permisos: anon/authenticated pueden ejecutar — pero el contenido
-- queda bajo control de las funciones (SECURITY DEFINER, sin RLS).
grant execute on function recompute_late_toll(uuid)        to anon, authenticated;
grant execute on function register_late_arrival(uuid)      to anon, authenticated;
grant execute on function pay_late_arrival_toll(uuid)      to anon, authenticated;
grant execute on function clear_late_arrival_toll(uuid)    to anon, authenticated;
