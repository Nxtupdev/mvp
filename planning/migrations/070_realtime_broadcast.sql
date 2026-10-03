-- ============================================================
-- NXTUP 070 — Tiempo real por BROADCAST: un canal por tienda
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES del deploy (el código nuevo escucha el canal
--    shop:<id>; sin la policy de abajo nadie puede unirse).
--
-- Port del punto #3 del dealer (sus migraciones 073 + 078, fundidas
-- aquí en la forma final: la señal nace con lista BLANCA, sin pasar
-- por el error intermedio de emitir la fila entera).
--
-- Por qué: hasta hoy el TV, el kiosko, el panel del barbero y el
-- dashboard se suscribían a `postgres_changes` filtrando por shop_id.
-- Supabase evalúa ese filtro y las policies POR CAMBIO × POR
-- SUSCRIPTOR — no escala en hora pico — y el payload lleva la fila
-- COMPLETA (client_phone incluido) a cualquier suscriptor anónimo:
-- el canal residual que la 069 dejó documentado.
--
-- Con broadcast la base emite UN mensaje por cambio al canal de esa
-- tienda (`shop:<id>`) y Realtime lo reparte plano; la autorización
-- se comprueba UNA vez al unirse (policy sobre realtime.messages).
-- Qué viaja: tabla, operación y SOLO {id, shop_id, barber_id, status}
-- (los que existan en esa tabla). El mensaje es la señal, no la
-- fuente: cada pantalla refetchea con su propio acceso. Escuchar el
-- canal de otra tienda solo revela que "algo cambió".
--
-- El trigger nunca rompe una escritura: si realtime.send falla, se
-- traga el error (el TV pierde una señal; el check-in no se cae).
--
-- TRANSICIÓN: los PWAs con build viejo siguen suscritos a
-- postgres_changes y siguen funcionando — la publicación no se toca
-- aquí. La migración de limpieza (quitar las tablas de
-- supabase_realtime, cierre definitivo del canal con PII) va días
-- después, cuando los teléfonos hayan recogido el build nuevo.
-- ============================================================

begin;
set local lock_timeout = '5s';

create or replace function public.nxtup_broadcast_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row    jsonb;
  v_shop   text;
  v_record jsonb;
begin
  v_row := to_jsonb(coalesce(new, old));
  -- `shops` lleva su propio id; el resto, shop_id.
  v_shop := coalesce(v_row->>'shop_id', case when tg_table_name = 'shops' then v_row->>'id' end);
  if v_shop is null then
    return null;
  end if;

  -- Lista BLANCA. Solo las claves que la tabla tiene; un barber_id
  -- nulo (walk-in sin asignar) sí viaja como null, no desaparece.
  -- Un campo nuevo NO sale por el canal salvo que se agregue aquí.
  v_record := '{}'::jsonb
    || case when v_row ? 'id'        then jsonb_build_object('id',        v_row->'id')        else '{}'::jsonb end
    || case when v_row ? 'shop_id'   then jsonb_build_object('shop_id',   v_row->'shop_id')   else '{}'::jsonb end
    || case when v_row ? 'barber_id' then jsonb_build_object('barber_id', v_row->'barber_id') else '{}'::jsonb end
    || case when v_row ? 'status'    then jsonb_build_object('status',    v_row->'status')    else '{}'::jsonb end;

  begin
    perform realtime.send(
      jsonb_build_object(
        'table', tg_table_name,
        'op', tg_op,
        'record', v_record
      ),
      'change',
      'shop:' || v_shop,
      true
    );
  exception when others then
    -- Una falla de Realtime no puede tumbar un check-in.
    null;
  end;
  return null;
end;
$$;

revoke execute on function public.nxtup_broadcast_change() from public, anon, authenticated;

drop trigger if exists nxtup_broadcast_barbers on public.barbers;
create trigger nxtup_broadcast_barbers
  after insert or update or delete on public.barbers
  for each row execute function public.nxtup_broadcast_change();

drop trigger if exists nxtup_broadcast_queue_entries on public.queue_entries;
create trigger nxtup_broadcast_queue_entries
  after insert or update or delete on public.queue_entries
  for each row execute function public.nxtup_broadcast_change();

drop trigger if exists nxtup_broadcast_activity_log on public.activity_log;
create trigger nxtup_broadcast_activity_log
  after insert on public.activity_log
  for each row execute function public.nxtup_broadcast_change();

drop trigger if exists nxtup_broadcast_shops on public.shops;
create trigger nxtup_broadcast_shops
  after update on public.shops
  for each row execute function public.nxtup_broadcast_change();

commit;

-- ── Quién puede ESCUCHAR: canales privados `shop:<id>` ────────
-- Sin esta policy nadie se puede unir (los canales privados exigen
-- RLS sobre realtime.messages). Solo lectura; nadie publica desde el
-- cliente (sin policy de insert). El TV y el kiosko no tienen sesión,
-- así que anon debe poder escuchar — por eso la señal no lleva PII.
begin;
drop policy if exists "shop channels are listenable" on realtime.messages;
create policy "shop channels are listenable" on realtime.messages
  for select to anon, authenticated
  using (realtime.topic() like 'shop:%' and realtime.messages.extension = 'broadcast');
commit;

-- ── Verificación ──────────────────────────────────────────────
-- Debe devolver 4 filas (barbers, queue_entries, activity_log, shops).
select tgname from pg_trigger where tgname like 'nxtup_broadcast%' order by tgname;
