-- ============================================================
-- NXTUP 079 · Número de Julie: opción "Mantén tu número (desvío)"
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- Tercera vía además de comprar-y-anunciar y portar: el dueño compra
-- un número nuevo para Julie (igual que buy) pero sus clientes siguen
-- marcando su número público de siempre — el dueño configura un
-- DESVÍO en su carrier hacia el número de Julie. Mamacita devuelve
-- instrucciones bilingües de configuración y expone un endpoint de
-- verificación (llamada de prueba) que confirma el desvío y si el
-- carrier pasa el caller ID del cliente.
--
--   * choice gana el valor 'forward'.
--   * instructions: jsonb con los pasos que devolvió Mamacita
--     ({ forward_to, recommended, es:{title,steps,note}, en:{...} })
--     para re-mostrarlos al dueño hasta que verifique.
--   * forward_verified: la llamada de prueba fue confirmada por
--     mamacita-number-verify.
-- ============================================================

alter table julie_numbers drop constraint if exists julie_numbers_choice_check;
alter table julie_numbers
  add constraint julie_numbers_choice_check
  check (choice in ('buy', 'port', 'forward'));

alter table julie_numbers
  add column if not exists forward_verified boolean not null default false,
  add column if not exists instructions jsonb;

comment on column julie_numbers.instructions is
  'Pasos de configuración del desvío devueltos por Mamacita (bilingüe). Solo choice=forward. Ver 079.';
comment on column julie_numbers.forward_verified is
  'El desvío fue confirmado por mamacita-number-verify (llamada de prueba recibida). Ver 079.';

-- ── Verificación ────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_name = 'julie_numbers'
  and column_name in ('forward_verified', 'instructions');
