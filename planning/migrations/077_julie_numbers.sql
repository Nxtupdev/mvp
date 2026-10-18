-- ============================================================
-- NXTUP 077 · Número de Julie: estado del onboarding por shop
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- El dueño elige en NXTUP cómo quiere el número que contesta Julie
-- (comprar uno nuevo eligiéndolo de una lista, o portar el suyo —
-- fase 2). La PROVISIÓN real (comprar/portar en Twilio-Softmedia +
-- conectar a VAPI) la hace Mamacita; NXTUP solo captura la decisión
-- y refleja el progreso. Esta tabla es ese espejo de estado.
--
-- Escriben: las rutas /api/julie/number/* (service role, tras hablar
-- con Mamacita) y /api/mamacita/number-status (actualizaciones async
-- firmadas de Mamacita, p. ej. el avance de un porte). El dueño LEE
-- la suya para la UI (/dashboard/julie).
-- ============================================================

create table if not exists julie_numbers (
  shop_id          uuid primary key references shops(id) on delete cascade,
  choice           text check (choice in ('buy', 'port')),
  requested_number text,            -- E.164 que el dueño eligió (buy)
  current_number   text,            -- número actual del dueño (port)
  number           text,            -- E.164 FINAL activo (status=completed)
  status           text not null default 'not_started'
    check (status in (
      'not_started', 'info_required', 'submitted',
      'porting_in_progress', 'completed', 'failed'
    )),
  fail_reason      text,            -- ej. 'number_taken'
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table julie_numbers enable row level security;

-- El dueño lee el estado del número de SU shop (para la UI).
drop policy if exists "owner reads own julie number" on julie_numbers;
create policy "owner reads own julie number" on julie_numbers
  for select using (
    shop_id in (select id from shops where owner_id = auth.uid())
  );

-- Sin policies de escritura: solo el server (service role) escribe.

comment on table julie_numbers is
  'Onboarding del número de Julie por shop (comprar/portar). NXTUP captura y refleja; Mamacita provisiona en Twilio-Softmedia + VAPI. Ver 077 y src/app/dashboard/julie.';

-- ── Verificación ────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_name = 'julie_numbers' order by ordinal_position;
