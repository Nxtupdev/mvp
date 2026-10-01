-- ============================================================
-- NXTUP 068 — Acceso de encargado (panel tokens permanentes + firma)
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES de desplegar el código (las rutas pasan un
--    parámetro nuevo a las RPCs y la UI inserta expires_at null).
--
-- Pedido de los socios (sept 2026): el dueño comparte el Centro de
-- Mando con una persona de confianza para que maneje la lista cuando
-- él no está. La infraestructura ya existe desde la 043 (tokens de
-- /panel/[shop_id]?t=..., revocables, con RLS para que el dueño
-- maneje los suyos). Esta migración agrega lo que faltaba:
--
--   1. Tokens PERMANENTES: expires_at pasa a nullable; null = no
--      vence (el acceso del encargado vive hasta que el dueño lo
--      revoque). Los tokens de staff siguen poniendo vencimiento.
--   2. Firma en el activity_log: las dos RPCs que loguean por dentro
--      (move_barber_fifo, clear_sanction) aceptan un p_actor_label
--      opcional; cuando la acción vino de un token de encargado, el
--      log queda con metadata.actor_label = etiqueta del acceso
--      ("Luis"). Resuelve disputas de "¿quién movió a este barbero?".
--
-- Los cuerpos de las RPCs son copia VERBATIM de la 037 y la 047 —
-- el único cambio es el parámetro nuevo y el merge del label al
-- metadata. Se hace drop + create porque agregar un parámetro con
-- default crea una SEGUNDA función (overload) en vez de reemplazar.
-- ============================================================

-- ── 1. expires_at nullable (null = permanente) ──────────────────────
alter table public.shop_control_tokens
  alter column expires_at drop not null;

comment on column public.shop_control_tokens.expires_at is
  'NULL = token permanente (acceso de encargado, vive hasta revoked_at). Con valor = token temporal (links de staff/demos, 043).';

-- ── 2. validate_panel_token: null-safe en el vencimiento ────────────
create or replace function public.validate_panel_token(p_token text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select shop_id
  from public.shop_control_tokens
  where token = p_token
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  limit 1;
$$;

grant execute on function public.validate_panel_token(text)
  to anon, authenticated;

-- ── 3. move_barber_fifo + p_actor_label (cuerpo verbatim de la 037) ─
drop function if exists move_barber_fifo(uuid, text);

create or replace function move_barber_fifo(
  p_barber_id uuid,
  p_direction text,  -- 'up' o 'down'
  p_actor_label text default null  -- 068: etiqueta del acceso de encargado
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id        uuid;
  v_status         text;
  v_toll           smallint;
  v_avail_since    timestamptz;
  v_neighbor_id    uuid;
  v_neighbor_avail timestamptz;
begin
  if p_direction not in ('up', 'down') then
    return jsonb_build_object('error', 'invalid direction');
  end if;

  -- Cargar el barbero target.
  select shop_id, status, late_toll_remaining, available_since
    into v_shop_id, v_status, v_toll, v_avail_since
    from barbers
    where id = p_barber_id;

  if v_shop_id is null then
    return jsonb_build_object('error', 'barber not found');
  end if;

  if v_status <> 'available' then
    return jsonb_build_object(
      'error', 'barber not in available state',
      'current_status', v_status
    );
  end if;

  if v_avail_since is null then
    return jsonb_build_object('error', 'barber has no FIFO position');
  end if;

  if v_toll > 0 then
    return jsonb_build_object(
      'error', 'barber is paying toll — clear it first',
      'toll_remaining', v_toll
    );
  end if;

  -- Encontrar el vecino en la dirección pedida.
  -- "up" = vecino con available_since MÁS VIEJO (el inmediato
  -- arriba) → swap pone a este barbero arriba.
  -- "down" = vecino con available_since MÁS NUEVO (el inmediato
  -- abajo) → swap pone a este barbero abajo.
  if p_direction = 'up' then
    select id, available_since
      into v_neighbor_id, v_neighbor_avail
      from barbers
      where shop_id = v_shop_id
        and status = 'available'
        and available_since is not null
        and available_since < v_avail_since
        and id <> p_barber_id
      order by available_since desc
      limit 1;
  else
    select id, available_since
      into v_neighbor_id, v_neighbor_avail
      from barbers
      where shop_id = v_shop_id
        and status = 'available'
        and available_since is not null
        and available_since > v_avail_since
        and id <> p_barber_id
      order by available_since asc
      limit 1;
  end if;

  if v_neighbor_id is null then
    return jsonb_build_object(
      'error', 'no neighbor in that direction',
      'direction', p_direction
    );
  end if;

  -- Swap atómico de los timestamps.
  update barbers set available_since = v_neighbor_avail where id = p_barber_id;
  update barbers set available_since = v_avail_since    where id = v_neighbor_id;

  -- Activity log para auditoría.
  insert into activity_log (shop_id, barber_id, action, metadata)
  values (
    v_shop_id,
    p_barber_id,
    'fifo_moved_by_owner',
    jsonb_build_object(
      'direction',         p_direction,
      'swapped_with',      v_neighbor_id,
      'old_available_since', v_avail_since,
      'new_available_since', v_neighbor_avail
    )
    || case when p_actor_label is not null
         then jsonb_build_object('actor_label', p_actor_label)
         else '{}'::jsonb
       end
  );

  return jsonb_build_object(
    'direction',         p_direction,
    'swapped_with',      v_neighbor_id,
    'new_available_since', v_neighbor_avail
  );
end;
$$;

grant execute on function move_barber_fifo(uuid, text, text) to anon, authenticated;

-- ── 4. clear_sanction + p_actor_label (cuerpo verbatim de la 047) ───
drop function if exists public.clear_sanction(uuid, uuid);

create or replace function public.clear_sanction(
  p_barber_id   uuid,
  p_cleared_by  uuid default null,
  p_actor_label text default null  -- 068: etiqueta del acceso de encargado
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
     jsonb_build_object('cleared_by', p_cleared_by, 'cleared_at', now())
     || case when p_actor_label is not null
          then jsonb_build_object('actor_label', p_actor_label)
          else '{}'::jsonb
        end);

  return true;
end;
$$;

grant execute on function public.clear_sanction(uuid, uuid, text) to anon, authenticated;

-- PostgREST cachea firmas de funciones — forzar recarga para que las
-- RPCs con el parámetro nuevo estén disponibles de inmediato.
notify pgrst, 'reload schema';
