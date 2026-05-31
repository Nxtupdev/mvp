-- ============================================================
-- NXTUP — Tokens del Centro de Mando (acceso temporal sin dashboard)
-- Run in Supabase SQL Editor
--
-- Caso de uso: el dueño de NXTUP quiere darle acceso temporal al
-- centro de mando de UN shop específico (típico: demos a shops
-- nuevos, o "barberías de prueba") SIN otorgarle acceso al resto
-- del dashboard (settings, stats, billing, otros shops).
--
-- Mecánica:
--   * El dueño autenticado genera un token vinculado a un shop_id
--     con una duración (24h/7d/30d).
--   * El URL `/panel/[shop_id]?t=<token>` renderiza solo el
--     ControlPanel del shop sin nav del dashboard.
--   * Las APIs de barbers/state, /toll/clear y /fifo/move aceptan
--     el header `x-panel-token` como auth equivalente al owner,
--     scope-limited al shop_id del token (un token de shop A no
--     puede mover barberos del shop B).
--   * Revocación: set `revoked_at = now()` (el dueño la dispara
--     desde la UI de settings).
--
-- Cero impacto en endpoints existentes que NO reciben el header:
-- siguen comportándose exactamente igual que antes.
-- ============================================================

create table if not exists public.shop_control_tokens (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  token       text not null unique,
  label       text,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index if not exists idx_shop_control_tokens_token
  on public.shop_control_tokens(token);

create index if not exists idx_shop_control_tokens_shop
  on public.shop_control_tokens(shop_id);

-- ── Validación: devuelve el shop_id si el token es válido ──────
-- Usada por los endpoints de barbers para autorizar requests con
-- header `x-panel-token`. Devuelve NULL si:
--   * El token no existe
--   * Está revocado (revoked_at no null)
--   * Está expirado (expires_at < now())
--
-- SECURITY DEFINER para que el endpoint anónimo (sin cookie de
-- usuario) pueda llamarla. La función NO toca tablas sensibles
-- de los shops directamente — solo lee/devuelve el shop_id ya
-- ligado al token. La autorización final (¿el barbero pertenece
-- al shop del token?) la hace el endpoint que la consume.
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
    and expires_at > now()
  limit 1;
$$;

grant execute on function public.validate_panel_token(text)
  to anon, authenticated;

-- ── RLS: solo el dueño del shop ve/maneja sus tokens ──────────
alter table public.shop_control_tokens enable row level security;

-- Drop any prior policy with the same name so re-running this
-- migration is idempotent.
drop policy if exists "Owners manage their shop control tokens"
  on public.shop_control_tokens;

create policy "Owners manage their shop control tokens"
  on public.shop_control_tokens
  for all
  to authenticated
  using (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  )
  with check (
    shop_id in (
      select id from public.shops where owner_id = auth.uid()
    )
  );

-- ── Verificación ─────────────────────────────────────────────
-- Tras correr esta migración:
--
--   select 'table created'
--   where exists (
--     select 1 from pg_tables
--     where schemaname = 'public' and tablename = 'shop_control_tokens'
--   );
--
--   select 'function created'
--   where exists (
--     select 1 from pg_proc where proname = 'validate_panel_token'
--   );
--
-- Ambos deben devolver 1 fila.
