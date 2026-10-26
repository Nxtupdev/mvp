-- ============================================================
-- NXTUP 086 · Nadie espera con un barbero libre al lado
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES del deploy (el /api/health vigila el cron nuevo).
--
-- Caso real (NuevaYol, 26-oct, José con cita con Darwin):
--   12:41:15 Darwin toca Disponible → se le asigna José (bien).
--   12:41:29 Darwin toca "Fuera" → reassign_barber_clients_on_offline
--            devolvió a José a la fila con barber_id = null PERO con
--            appointment_barber_id = Darwin intacto. Quedó en tierra de
--            nadie: el reclamo "cliente pedido" busca barber_id = yo, y
--            el pool general salta appointment_barber_id ≠ null. Darwin
--            tocó Disponible cuatro veces y José nunca le pasó.
--   12:50:41 la cita vence (10 min) → José pasa al pool general… y
--            espera 17 min más con Darwin DISPONIBLE: nada reparte
--            clientes salvo un cambio de estado de barbero o un check-in.
--
-- Arreglo (decisión de Francisco: el sistema funciona sin depender de
-- que el barbero toque bien los botones):
--
-- 1. reassign_barber_clients_on_offline: el barbero que se va suelta a
--    TODOS sus clientes — llamados, en la silla y también los AMARRADOS
--    esperándolo (antes quedaban colgados para siempre apuntando a un
--    barbero offline). Pasan al primer barbero libre o al pool general,
--    y pierden la marca de cita: su barbero ya no está.
--
-- 2. match_waiting_clients() cada 10 s: junta cualquier cliente que
--    espera con cualquier barbero disponible, con las MISMAS reglas que
--    el kiosko y el botón Disponible (route.ts):
--      * FIFO de barberos por available_since; cliente por position.
--      * Primero el cliente amarrado al barbero (barber_id = él).
--      * Pool general: barber_id null, sin cita pendiente.
--      * Voz (Mamacita) solo cuando ya llegó (arrived_at).
--      * Sancionado (047) no recibe walk-ins salvo que no haya otro
--        barbero no sancionado disponible en ese momento.
--    Reclamo atómico con FOR UPDATE SKIP LOCKED en barbero y cliente:
--    convive con los reclamos del kiosko y del botón sin doble
--    asignación. Queda 'called' → el auto-BUSY de 2 min (063) sigue
--    igual. Log 'client_assigned' con via 'auto_match'.
--
-- Sin acciones nuevas en activity_log (client_assigned y
-- call_returned_to_waiting ya existen) → no se toca el CHECK.
-- Idempotente: create or replace + unschedule antes de schedule.
-- ============================================================

-- ── 1. Offline: soltar a todos los clientes del barbero ─────────────
create or replace function reassign_barber_clients_on_offline(
  p_barber_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  v_shop_id uuid;
  v_next_barber_id uuid;
  v_now timestamptz := now();
  v_reassigned int := 0;
  v_returned int := 0;
  v_released int := 0;
begin
  select shop_id into v_shop_id from barbers where id = p_barber_id;
  if v_shop_id is null then
    return jsonb_build_object('error', 'barber not found');
  end if;

  for rec in
    select id, client_name, position, status as prev_status
      from queue_entries
      where barber_id = p_barber_id
        and status in ('called', 'in_progress')
      order by coalesce(called_at, created_at) asc
  loop
    select b.id into v_next_barber_id
      from barbers b
      where b.shop_id = v_shop_id
        and b.status = 'available'
        and b.available_since is not null
        and b.id <> p_barber_id
        and coalesce(b.late_toll_remaining, 0) = 0
      order by b.available_since asc
      limit 1;

    if v_next_barber_id is not null then
      update queue_entries
        set barber_id = v_next_barber_id,
            status = 'called',
            called_at = v_now,
            -- La cita era con el barbero que se fue (086).
            appointment_barber_id = case
              when appointment_barber_id = p_barber_id then null
              else appointment_barber_id end
        where id = rec.id;

      update barbers
        set available_since = null
        where id = v_next_barber_id;

      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        v_shop_id,
        v_next_barber_id,
        'client_assigned',
        jsonb_build_object(
          'client_name', rec.client_name,
          'queue_position', rec.position,
          'entry_id', rec.id,
          'via', 'barber_offline_reassign',
          'previous_barber_id', p_barber_id,
          'previous_status', rec.prev_status
        )
      );
      v_reassigned := v_reassigned + 1;
    else
      -- Sin takers: al pool general SIN la marca de cita (086). Con la
      -- marca quedaba invisible para todos los reclamos.
      update queue_entries
        set status = 'waiting',
            barber_id = null,
            called_at = null,
            appointment_barber_id = case
              when appointment_barber_id = p_barber_id then null
              else appointment_barber_id end
        where id = rec.id;

      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        v_shop_id,
        null,
        'no_show_no_takers',
        jsonb_build_object(
          'client_name', rec.client_name,
          'queue_position', rec.position,
          'entry_id', rec.id,
          'previous_barber_id', p_barber_id,
          'previous_status', rec.prev_status,
          'via', 'barber_offline_no_takers'
        )
      );
      v_returned := v_returned + 1;
    end if;
  end loop;

  -- Amarrados esperándolo (cita o "cliente pedido"): al pool general en
  -- su misma posición; el matcher se los da al primer barbero libre.
  for rec in
    select id, client_name, position
      from queue_entries
      where barber_id = p_barber_id
        and status = 'waiting'
  loop
    update queue_entries
      set barber_id = null,
          appointment_barber_id = case
            when appointment_barber_id = p_barber_id then null
            else appointment_barber_id end
      where id = rec.id
        and status = 'waiting';

    if found then
      insert into activity_log (shop_id, barber_id, action, metadata)
      values (
        v_shop_id,
        null,
        'call_returned_to_waiting',
        jsonb_build_object(
          'client_name', rec.client_name,
          'queue_position', rec.position,
          'entry_id', rec.id,
          'previous_barber_id', p_barber_id,
          'via', 'barber_offline_release_tied'
        )
      );
      v_released := v_released + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'reassigned', v_reassigned,
    'returned_to_waiting', v_returned,
    'released_tied', v_released
  );
end;
$$;

grant execute on function reassign_barber_clients_on_offline(uuid)
  to anon, authenticated;

-- ── 2. Matcher: cliente esperando + barbero libre = se juntan ───────
create or replace function public.match_waiting_clients()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  v_now timestamptz := now();
  v_entry_id uuid;
  v_entry_name text;
  v_entry_pos integer;
  v_others integer;
  v_matched integer := 0;
begin
  for b in
    select br.id, br.shop_id, br.sanctioned_until
    from barbers br
    where br.status = 'available'
      and br.available_since is not null
      and exists (
        select 1 from queue_entries q
        where q.shop_id = br.shop_id and q.status = 'waiting'
      )
    order by br.shop_id, br.available_since asc
  loop
    -- Bloquear al barbero y re-chequear que siga libre (otro reclamo
    -- pudo ganarle entre la lista y aquí).
    perform 1 from barbers
      where id = b.id and status = 'available' and available_since is not null
      for update skip locked;
    if not found then continue; end if;

    -- a) Su cliente amarrado (cita / cliente pedido).
    select q.id, q.client_name, q.position
      into v_entry_id, v_entry_name, v_entry_pos
      from queue_entries q
      where q.shop_id = b.shop_id
        and q.status = 'waiting'
        and q.barber_id = b.id
        and (q.mamacita_entry_id is null or q.arrived_at is not null)
      order by q.position asc
      limit 1
      for update skip locked;

    -- b) Pool general (con la regla del sancionado de route.ts).
    if v_entry_id is null then
      if b.sanctioned_until is not null and b.sanctioned_until > v_now then
        select count(*) into v_others
          from barbers o
          where o.shop_id = b.shop_id
            and o.status = 'available'
            and o.available_since is not null
            and o.id <> b.id
            and (o.sanctioned_until is null or o.sanctioned_until <= v_now);
        if v_others > 0 then continue; end if;
      end if;

      select q.id, q.client_name, q.position
        into v_entry_id, v_entry_name, v_entry_pos
        from queue_entries q
        where q.shop_id = b.shop_id
          and q.status = 'waiting'
          and q.barber_id is null
          and q.appointment_barber_id is null
          and (q.mamacita_entry_id is null or q.arrived_at is not null)
        order by q.position asc
        limit 1
        for update skip locked;
    end if;

    if v_entry_id is not null then
      update queue_entries
        set status = 'called', barber_id = b.id, called_at = v_now
        where id = v_entry_id and status = 'waiting';

      if found then
        update barbers set available_since = null where id = b.id;

        insert into activity_log (shop_id, barber_id, action, metadata)
        values (
          b.shop_id,
          b.id,
          'client_assigned',
          jsonb_build_object(
            'client_name', v_entry_name,
            'queue_position', v_entry_pos,
            'entry_id', v_entry_id,
            'via', 'auto_match'
          )
        );
        v_matched := v_matched + 1;
      end if;
    end if;
  end loop;

  return json_build_object('matched', v_matched);
end;
$$;

-- Postgres da EXECUTE a PUBLIC por default en funciones nuevas.
revoke execute on function public.match_waiting_clients() from public, anon, authenticated;

-- ── Cron cada 10 s (mismo ritmo que el cascade) ─────────────────────
do $$ begin
  perform cron.unschedule('nxtup-match-waiting-clients');
exception when others then null;
end $$;

select cron.schedule(
  'nxtup-match-waiting-clients',
  '10 seconds',
  $$ select public.match_waiting_clients(); $$
);

-- ── Verificación: una fila con el job activo ────────────────────────
select jobname, schedule, active from cron.job
where jobname = 'nxtup-match-waiting-clients';
