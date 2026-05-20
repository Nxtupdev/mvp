-- ============================================================
-- NXTUP — Auto-offline al expirar break + grace
-- Run in Supabase SQL Editor
--
-- Caso real: barbero toca break (30 min), se le acaban los 30,
-- entra el período de gracia, se acaba el grace, y el timer en
-- la app sigue subiendo (-5:00, -10:00, -15:00…) sin parar.
-- El barbero claramente no volvió.
--
-- Esta regla es DISTINTA del idle-timeout de la migración 021:
--
--   021 (idle 3h): "barbero no ha tocado ningún botón en 3 horas".
--   028 (este):    "barbero tocó break y se pasó del tiempo
--                   asignado + gracia".
--
-- Ambas conviven. En la práctica, 028 dispara primero (a los
-- ~35 min para un break normal de 30+5) y 021 es backstop por si
-- 028 alguna vez falla.
--
-- Cron: cada 1 minuto. Más agresivo que el de 021 (que era cada
-- 5 min) porque acá la latencia importa más — el barbero está
-- mirando el timer en negativo en su pantalla.
-- ============================================================

create or replace function auto_offline_expired_breaks()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_count integer := 0;
begin
  -- Buscar barberos en break cuyo (break_started_at + break_minutes
  -- + grace) ya pasó. break_minutes_at_start es el snapshot que se
  -- toma cuando el barbero toca break (de la 009/014). Si esta col
  -- es null por algún caso legacy, calculamos del shop.
  for rec in
    select b.id,
           b.shop_id,
           b.name,
           b.break_started_at,
           (
             coalesce(
               b.break_minutes_at_start,
               case when coalesce(b.breaks_taken_today, 0) <= 1
                 then s.first_break_minutes
                 else s.next_break_minutes
               end
             ) +
             coalesce(s.break_position_grace_minutes, 5)
           ) as total_allowed_minutes
      from barbers b
      join shops s on s.id = b.shop_id
      where b.status = 'break'
        and b.break_started_at is not null
        and b.break_started_at + make_interval(mins =>
          coalesce(
            b.break_minutes_at_start,
            case when coalesce(b.breaks_taken_today, 0) <= 1
              then s.first_break_minutes
              else s.next_break_minutes
            end
          ) +
          coalesce(s.break_position_grace_minutes, 5)
        ) < v_now
  loop
    -- Reset estándar a offline (mismo set de fields que el
    -- offline manual y los otros auto-offline).
    update barbers
      set status = 'offline',
          available_since = null,
          break_started_at = null,
          break_held_since = null,
          break_minutes_at_start = null,
          breaks_taken_today = 0,
          break_invalidating_barber_ids = '{}',
          break_invalidated = false
      where id = rec.id;

    -- Limpiar peaje (mismo principio que en cualquier offline).
    perform clear_late_arrival_toll(rec.id);

    insert into activity_log (
      shop_id, barber_id, action, from_status, to_status, metadata
    )
    values (
      rec.shop_id,
      rec.id,
      'idle_timeout_offline',
      'break',
      'offline',
      jsonb_build_object(
        'reason', 'break_expired',
        'break_started_at', rec.break_started_at,
        'total_allowed_minutes', rec.total_allowed_minutes,
        'minutes_over', round(
          (extract(epoch from (v_now - rec.break_started_at)) / 60
            - rec.total_allowed_minutes)::numeric,
          1
        )
      )
    );

    v_count := v_count + 1;
  end loop;

  return json_build_object(
    'offlined', v_count,
    'ran_at',  v_now
  );
end;
$$;

-- ── Schedule cada 1 minuto ───────────────────────────────────
do $$
begin
  perform cron.unschedule('nxtup-break-expired-offline');
exception when others then
  null;
end $$;

select cron.schedule(
  'nxtup-break-expired-offline',
  '* * * * *',  -- cada 1 minuto
  $$ select public.auto_offline_expired_breaks(); $$
);

grant execute on function auto_offline_expired_breaks() to anon, authenticated;
