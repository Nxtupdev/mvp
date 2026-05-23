-- ============================================================
-- NXTUP — Peaje solo en la primera vez que entra al día
-- Run in Supabase SQL Editor
--
-- Bug en producción: el peaje de llegada tarde estaba aplicando
-- en casos donde el barbero NO era una llegada real, sino una
-- vuelta:
--
--   1. Barbero A toca ACTIVE a las 9am (primer active del día)
--   2. A las 12:00 toca BREAK
--   3. A las 12:36 el cron 028 lo manda offline (pasó break+grace)
--   4. A las 12:40 vuelve, toca ACTIVE
--   5. State route ve fromStatus='offline' → register_late_arrival
--      → como ya pasó del threshold (ej. 12pm) → aplica peaje
--   6. Bug: A YA estaba en la barbería desde las 9am, no es
--      llegada — es vuelta del break
--
-- La regla real (clarificada con el dueño):
--
--   "Peaje aplica cuando un barbero llega POR PRIMERA VEZ al
--    shop después del threshold horario. Si ya tocó active hoy,
--    cualquier vuelta posterior NO paga peaje."
--
-- Fix: agregar al inicio de register_late_arrival un check del
-- activity_log para ver si este barbero ya tuvo un state_change
-- a 'available' hoy (en la timezone del shop). Si sí → return 0
-- sin crear peaje.
--
-- Esto captura todos los casos:
--   * Vuelta de break con cron 028 → exento ✓
--   * Vuelta de offline manual a mitad del día → exento ✓
--   * Vuelta de idle 3h timeout → exento ✓
--   * Primer active del día después de nightly reset → cae al
--     check de threshold normal (peaje si después de threshold)
--   * Primer active del día antes del threshold → no peaje
--
-- Sin cambios de schema. Sin cambios en otros crons. Sin tocar
-- el state route TS ni el device RPC.
-- ============================================================

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
  v_already_active_today boolean;
begin
  -- Cargar config de la tienda
  select s.id, s.timezone, s.late_arrival_threshold_time,
         s.late_arrival_cuts_required
    into v_shop_id, v_tz, v_threshold, v_required
    from barbers b
    join shops s on s.id = b.shop_id
    where b.id = p_barber_id;

  if v_shop_id is null then return 0; end if;
  if v_threshold is null then return 0; end if;

  -- ── NUEVO en 031: chequeo "primer active del día" ────────
  -- Si este barbero ya tuvo un state_change a 'available' HOY
  -- (en timezone del shop), no es una llegada — es una vuelta.
  -- Vueltas (de break, idle timeout, offline manual a mitad
  -- de día, etc.) NO pagan peaje.
  --
  -- Importante: este check corre ANTES de que el state route
  -- inserte el activity_log de la transición actual, así que
  -- solo cuenta state_changes PREVIOS de hoy.
  select exists (
    select 1 from activity_log
    where barber_id = p_barber_id
      and action = 'state_change'
      and to_status = 'available'
      and (created_at at time zone v_tz)::date
          = (v_now at time zone v_tz)::date
  ) into v_already_active_today;

  if v_already_active_today then
    return 0;
  end if;

  -- Hora local actual vs threshold
  v_local_time := (v_now at time zone v_tz)::time;
  if v_local_time < v_threshold then return 0; end if;

  v_required := coalesce(v_required, 2);

  -- Crear filas de peaje, una por barbero existente (active o busy)
  insert into late_arrival_toll
    (late_barber_id, existing_barber_id, shop_id, cuts_remaining)
  select p_barber_id, b.id, v_shop_id, v_required
    from barbers b
    where b.shop_id = v_shop_id
      and b.id <> p_barber_id
      and b.status in ('available', 'busy')
  on conflict do nothing;

  get diagnostics v_inserted = row_count;

  perform recompute_late_toll(p_barber_id);

  return v_inserted;
end;
$$;

grant execute on function register_late_arrival(uuid) to anon, authenticated;
