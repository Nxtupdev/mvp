-- ============================================================
-- NXTUP — Sistema de sanción por tiempo (reemplaza el peaje de cortes)
-- Run in Supabase SQL Editor
--
-- Decisión arquitectónica: simplificar el sistema de penalidad por
-- llegada tarde. El sistema viejo (peaje de cortes con junction
-- table, counter denormalizado, bumps de FIFO, etc.) acumuló 8
-- migraciones de edge cases. Reemplazamos por una mecánica
-- conceptualmente simple:
--
--   * Detección automática (sin cambios): el barbero entra al shop
--     por primera vez del día DESPUÉS del threshold → se le aplica
--     sanción automáticamente.
--   * La sanción es un timestamp `sanctioned_until` en la tabla
--     barbers. Si > now() → está sancionado. Si null o pasado → no.
--   * Mientras está sancionado: no recibe walk-ins auto-asignados,
--     no recibe cascades, no recibe "tomar yo", está al fondo de
--     la lista visual. SÍ puede atender clientes que lo piden por
--     nombre.
--   * Termina automáticamente cuando expira el timestamp. Cero
--     necesidad de cron, cero recalcular counters.
--   * El dueño puede levantarla antes con un botón.
--
-- Esta migración ESTABLECE la infraestructura nueva SIN tocar
-- la vieja (coexisten temporalmente). El cutover del código TS
-- ocurre en commits separados para minimizar riesgo. Una migración
-- futura (049+) dropea el sistema viejo cuando confirmemos que
-- el nuevo funciona en producción.
-- ============================================================


-- ── 1. Schema additions ──────────────────────────────────────

-- Setting per shop: cuántas horas dura la sanción cuando aplica.
-- Reemplaza late_arrival_cuts_required. Default 3 horas — un
-- compromiso razonable entre "consecuencia real" y "no perder el
-- día entero del barbero".
alter table public.shops
  add column if not exists late_arrival_sanction_hours numeric(4,2) not null default 3;

comment on column public.shops.late_arrival_sanction_hours is
  'Duración de la sanción (en horas, con decimales) que se aplica '
  'cuando un barbero llega tarde. Reemplaza late_arrival_cuts_required. '
  'numeric(4,2) permite valores como 1.5 o 0.5 si en el futuro se '
  'agregan presets en minutos.';

-- Estado de sanción por barbero. Denormalizado para queries rápidos
-- de auto-asignación. NULL o pasado = no sancionado. Futuro = sí.
alter table public.barbers
  add column if not exists sanctioned_until timestamptz;

comment on column public.barbers.sanctioned_until is
  'Hasta cuándo este barbero está sancionado por llegada tarde. '
  'NULL o <= now() = no sancionado (entra a rotación normal). '
  '> now() = sancionado (se salta en auto-asignación, queda al fondo '
  'de la lista visual). Self-expiring — cero cron, cero recompute.';

create index if not exists idx_barbers_sanctioned_until
  on public.barbers(sanctioned_until)
  where sanctioned_until is not null;


-- ── 2. Tabla de historial de sanciones (audit) ───────────────

create table if not exists public.barber_sanctions (
  id          uuid primary key default gen_random_uuid(),
  barber_id   uuid not null references public.barbers(id) on delete cascade,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  applied_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  cleared_at  timestamptz,                  -- si el dueño la levantó antes
  hours       numeric(4,2) not null,        -- snapshot del valor al aplicar
  applied_by  uuid,                         -- auth.users(id), null si automático
  reason      text                          -- opcional, libre
);

comment on table public.barber_sanctions is
  'Historial de sanciones por llegada tarde aplicadas a barberos. '
  'Cada fila es un evento. La tabla NO se consulta para saber si '
  'un barbero está sancionado ahora — esa pregunta la responde '
  'barbers.sanctioned_until denormalizado. Esta tabla es solo '
  'para audit / reporting / disputas.';

create index if not exists idx_barber_sanctions_shop_applied
  on public.barber_sanctions(shop_id, applied_at desc);

create index if not exists idx_barber_sanctions_barber_applied
  on public.barber_sanctions(barber_id, applied_at desc);

alter table public.barber_sanctions enable row level security;

-- Solo el dueño del shop ve/modifica los sanctions de su shop.
drop policy if exists "Owner sees their shop sanctions" on public.barber_sanctions;
create policy "Owner sees their shop sanctions"
  on public.barber_sanctions
  for all
  to authenticated
  using (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  )
  with check (
    shop_id in (select id from public.shops where owner_id = auth.uid())
  );


-- ── 3. Función: aplicar sanción ──────────────────────────────
-- Llamada desde register_late_arrival cuando la detección dispara.
-- Calcula expires_at usando el setting actual del shop, actualiza
-- el denormalizado de barbers, inserta historial, loguea activity.
--
-- Idempotencia: si el barbero YA tiene sanción activa (sanctioned_until
-- > now()), NO la reemplaza (respeta el "cambio de setting no afecta
-- sanciones activas" — decisión del equipo).
--
-- SECURITY DEFINER para que el state route (que usa el cliente
-- cookie del barbero o device token) pueda invocarla sin permisos
-- directos sobre barber_sanctions.

create or replace function public.apply_sanction(
  p_barber_id  uuid,
  p_applied_by uuid default null,
  p_reason     text default null
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id           uuid;
  v_hours             numeric(4,2);
  v_now               timestamptz := now();
  v_expires_at        timestamptz;
  v_existing_until    timestamptz;
begin
  -- 1. Cargar config del shop + estado actual del barbero
  select b.shop_id, b.sanctioned_until, s.late_arrival_sanction_hours
    into v_shop_id, v_existing_until, v_hours
    from public.barbers b
    join public.shops s on s.id = b.shop_id
    where b.id = p_barber_id;

  if v_shop_id is null then return null; end if;

  -- 2. Si ya tiene sanción activa, NO la reemplaza. Devuelve la
  --    existente. Mantiene la sanción inalterable durante su vida.
  if v_existing_until is not null and v_existing_until > v_now then
    return v_existing_until;
  end if;

  -- 3. Calcular expires_at desde now() + hours del shop
  v_expires_at := v_now + (v_hours || ' hours')::interval;

  -- 4. Actualizar denormalizado
  update public.barbers
    set sanctioned_until = v_expires_at
    where id = p_barber_id;

  -- 5. Insertar fila de historial (audit)
  insert into public.barber_sanctions
    (barber_id, shop_id, applied_at, expires_at, hours, applied_by, reason)
  values
    (p_barber_id, v_shop_id, v_now, v_expires_at, v_hours, p_applied_by, p_reason);

  -- 6. Logear en activity_log
  insert into public.activity_log
    (shop_id, barber_id, action, from_status, to_status, metadata)
  values
    (v_shop_id, p_barber_id, 'sanction_applied', null, null,
     jsonb_build_object(
       'hours', v_hours,
       'expires_at', v_expires_at,
       'applied_by', p_applied_by,
       'reason', p_reason
     ));

  return v_expires_at;
end;
$$;

grant execute on function public.apply_sanction(uuid, uuid, text) to anon, authenticated;


-- ── 4. Función: levantar sanción (override del dueño) ────────
-- Marca la sanción activa como cleared_at = now() y limpia el
-- denormalizado. Si no hay sanción activa, no-op.

create or replace function public.clear_sanction(
  p_barber_id   uuid,
  p_cleared_by  uuid default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id        uuid;
  v_was_active     boolean := false;
begin
  -- Lock + leer estado actual
  select b.shop_id, (b.sanctioned_until is not null and b.sanctioned_until > now())
    into v_shop_id, v_was_active
    from public.barbers b
    where b.id = p_barber_id;

  if not v_was_active then
    return false;
  end if;

  -- Marcar la sanción activa más reciente como cleared
  update public.barber_sanctions
    set cleared_at = now()
    where barber_id = p_barber_id
      and cleared_at is null
      and expires_at > now();

  -- Limpiar el denormalizado
  update public.barbers
    set sanctioned_until = null
    where id = p_barber_id;

  -- Logear
  insert into public.activity_log
    (shop_id, barber_id, action, from_status, to_status, metadata)
  values
    (v_shop_id, p_barber_id, 'sanction_cleared', null, null,
     jsonb_build_object('cleared_by', p_cleared_by, 'cleared_at', now()));

  return true;
end;
$$;

grant execute on function public.clear_sanction(uuid, uuid) to anon, authenticated;


-- ── 5. Rewrite de register_late_arrival ──────────────────────
-- Cambio crítico: en vez de insertar filas en late_arrival_toll
-- con cuts_remaining, simplemente llama apply_sanction. Los gates
-- de detección (threshold, ya activo, ya tuvo state_change) se
-- mantienen EXACTAMENTE iguales para no romper el comportamiento
-- de detección que el dueño valida.

create or replace function public.register_late_arrival(p_barber_id uuid)
returns smallint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id      uuid;
  v_tz           text;
  v_threshold    time;
  v_now          timestamptz := now();
  v_local_time   time;
  v_local_date   date;
  v_already_present_before_threshold boolean;
  v_already_active_today              boolean;
  v_expires_at   timestamptz;
begin
  -- Cargar config de la tienda
  select s.id, s.timezone, s.late_arrival_threshold_time
    into v_shop_id, v_tz, v_threshold
    from public.barbers b
    join public.shops s on s.id = b.shop_id
    where b.id = p_barber_id;

  -- Gate 0: feature apagada o sin config
  if v_shop_id is null then return 0; end if;
  if v_threshold is null then return 0; end if;

  -- Calcular hora local actual y fecha local
  v_local_time := (v_now at time zone v_tz)::time;
  v_local_date := (v_now at time zone v_tz)::date;

  -- Gate 1: hora local < threshold → no aplica (todavía no es tarde)
  if v_local_time < v_threshold then return 0; end if;

  -- Gate 2: si ya hubo CUALQUIER state_change a available/busy/break
  --         HOY ANTES del threshold → estaba presente antes que la
  --         regla aplicara → exento (gate ampliado de 036).
  select exists (
    select 1
    from public.activity_log al
    where al.barber_id = p_barber_id
      and al.action = 'state_change'
      and al.to_status in ('available', 'busy', 'break')
      and (al.created_at at time zone v_tz)::date = v_local_date
      and (al.created_at at time zone v_tz)::time < v_threshold
  ) into v_already_present_before_threshold;

  if v_already_present_before_threshold then return 0; end if;

  -- Gate 3: si ya hubo state_change a 'available' HOY → vuelta de
  --         break/offline a mitad del día, no es llegada nueva.
  --         Regla original del 031.
  select exists (
    select 1
    from public.activity_log al
    where al.barber_id = p_barber_id
      and al.action = 'state_change'
      and al.to_status = 'available'
      and (al.created_at at time zone v_tz)::date = v_local_date
  ) into v_already_active_today;

  if v_already_active_today then return 0; end if;

  -- ✓ Pasó todos los gates → aplicar sanción
  v_expires_at := public.apply_sanction(
    p_barber_id,
    null,   -- applied_by null = automático
    'late_arrival_auto'
  );

  return case when v_expires_at is not null then 1 else 0 end;
end;
$$;

grant execute on function public.register_late_arrival(uuid) to anon, authenticated;


-- ── 6. Update nightly_state_reset para limpiar sanctioned_until ─
-- Al cierre del día, las sanciones se limpian (igual que el counter
-- viejo). Las que quedaron activas se marcan como cleared_at con
-- reason='nightly_reset' para auditoría.

create or replace function public.nightly_state_reset()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  cancelled_count    integer;
  reset_count        integer;
  toll_rows_deleted  integer;
  toll_barbers_reset integer;
  sanctions_cleared  integer;
begin
  -- 1. Cancelar queue entries que nunca llegaron a 'done'.
  update public.queue_entries
  set status = 'cancelled'
  where status in ('waiting', 'called', 'in_progress');
  get diagnostics cancelled_count = row_count;

  -- 2. Resetear barberos a offline limpio.
  update public.barbers
  set status = 'offline',
      available_since = null,
      break_started_at = null,
      break_held_since = null,
      break_minutes_at_start = null,
      breaks_taken_today = 0
  where status <> 'offline'
     or available_since is not null
     or break_started_at is not null
     or break_held_since is not null
     or break_minutes_at_start is not null
     or breaks_taken_today <> 0;
  get diagnostics reset_count = row_count;

  -- 3. Sistema viejo (peaje de cortes) — limpiar para que no quede
  --    cruzado durante el período de coexistencia con el nuevo.
  delete from public.late_arrival_toll;
  get diagnostics toll_rows_deleted = row_count;

  update public.barbers
  set late_toll_remaining = 0
  where coalesce(late_toll_remaining, 0) > 0;
  get diagnostics toll_barbers_reset = row_count;

  -- 4. Sistema NUEVO (sanción por tiempo) — marcar activas como
  --    cleared y limpiar el denormalizado. Reason = nightly_reset
  --    para distinguir de overrides del dueño.
  update public.barber_sanctions
  set cleared_at = now()
  where cleared_at is null
    and expires_at > now();
  get diagnostics sanctions_cleared = row_count;

  update public.barbers
  set sanctioned_until = null
  where sanctioned_until is not null;

  return json_build_object(
    'cancelled_entries',   cancelled_count,
    'reset_barbers',       reset_count,
    'toll_rows_deleted',   toll_rows_deleted,
    'toll_barbers_reset',  toll_barbers_reset,
    'sanctions_cleared',   sanctions_cleared,
    'run_at',              now()
  );
end;
$$;

grant execute on function public.nightly_state_reset() to anon, authenticated;


-- ── 7. Activity log: permitir nuevas acciones ────────────────
-- Las nuevas acciones sanction_applied y sanction_cleared necesitan
-- ser permitidas por el CHECK constraint. Idempotente.

alter table public.activity_log
  drop constraint if exists activity_log_action_check;

alter table public.activity_log
  add constraint activity_log_action_check
  check (action in (
    'state_change',
    'client_assigned',
    'position_kept',
    'position_lost',
    'shop_settings_changed',
    'no_show',
    'no_show_no_takers',
    'idle_timeout_offline',
    'sanction_applied',
    'sanction_cleared'
  ));


-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración:
--
-- 1) Schema nuevo presente:
--    select column_name, data_type
--    from information_schema.columns
--    where table_name = 'barbers' and column_name = 'sanctioned_until';
--    → 1 fila: sanctioned_until · timestamptz
--
--    select column_name, data_type
--    from information_schema.columns
--    where table_name = 'shops' and column_name = 'late_arrival_sanction_hours';
--    → 1 fila: late_arrival_sanction_hours · numeric
--
-- 2) Tabla nueva:
--    select count(*) from public.barber_sanctions;
--    → 0 inicialmente.
--
-- 3) Funciones nuevas:
--    select proname from pg_proc
--    where proname in ('apply_sanction', 'clear_sanction');
--    → 2 filas.
--
-- 4) Verificar default del shop (3 horas):
--    select late_arrival_sanction_hours from shops limit 5;
--    → todos deben tener 3.
