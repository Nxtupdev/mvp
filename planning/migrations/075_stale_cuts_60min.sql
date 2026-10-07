-- ============================================================
-- NXTUP 075 · Barrendero de cortes colgados: umbral 90 → 60 min
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- Sin deploy: el cron (nxtup-auto-complete-stale-cuts, cada 5 min)
-- sigue llamando a la misma función; solo cambia el umbral adentro.
--
-- Decisión de Francisco (6-oct-2026): "60 minutos es más real".
-- Primer día del cron en 90 (hoy): barrió 5 cortes en 3 barberías a
-- los 92-94 min. Con 60, cortes reales de 70-85 min (hubo 4 hoy) se
-- cierran solos antes de tiempo — costo aceptado: el cierre es solo
-- contable (auto_completed=true, el barbero no se toca) y las stats
-- de esos casos quedarán en ~60-65 min.
-- ============================================================

create or replace function public.auto_complete_stale_cuts()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_now timestamptz := now();
  v_closed integer := 0;
begin
  for rec in
    select e.id as entry_id, e.shop_id as shop_id, e.barber_id as barber_id,
           e.client_name as client_name, e.called_at as called_at,
           e.auto_busy as was_auto_busy
    from queue_entries e
    where e.status = 'in_progress'
      and coalesce(e.called_at, e.created_at) < v_now - interval '60 minutes'
  loop
    update queue_entries
    set status = 'done',
        completed_at = v_now,
        auto_completed = true
    where id = rec.entry_id
      and status = 'in_progress';

    if found then
      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        rec.shop_id,
        rec.barber_id,
        'auto_completed',
        jsonb_build_object(
          'entry_id', rec.entry_id,
          'client_name', rec.client_name,
          'called_at', rec.called_at,
          'was_auto_busy', rec.was_auto_busy,
          'threshold_minutes', 60
        )
      );
      v_closed := v_closed + 1;
    end if;
  end loop;

  return json_build_object('stale_cuts_closed', v_closed);
end;
$$;

-- create or replace conserva los grants, pero re-aplicamos la regla
-- de la casa por si acaso: nadie ejecuta esto salvo el cron (postgres).
revoke execute on function public.auto_complete_stale_cuts() from public, anon, authenticated;

comment on column public.queue_entries.auto_completed is
  'true = lo cerró el barrendero de 60 min (072, umbral bajado en 075), no una transición del barbero; completed_at es estimado, no real.';

-- ── Verificación ────────────────────────────────────────────────────
-- Debe mostrar "interval ''60 minutes''" en el cuerpo:
select prosrc ~ '60 minutes' as umbral_en_60
from pg_proc where proname = 'auto_complete_stale_cuts';
