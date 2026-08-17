-- ============================================================
-- NXTUP 065 — Bucket de fotos de perfil de barberos
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
-- ⚠️ CORRER ANTES de desplegar el código (el endpoint de subida
--    escribe en este bucket).
--
-- Los barberos suben su foto real desde su panel (misma pantalla del
-- selector de íconos). La subida pasa por POST /api/barbers/[id]/photo
-- (gate de WiFi del shop + validación de tipo/tamaño) y escribe aquí
-- con el SERVICE ROLE — por eso este bucket NO tiene policies de
-- escritura pública: solo lectura (el TV/kiosko/dashboard renderizan
-- la foto sin auth). Path: {shop_id}/{barber_id}.jpg (upsert → una
-- foto por barbero, sin acumulación).
--
-- El dueño "quita" una foto reemplazándola por un ícono desde su
-- gestión de barberos (flujo existente) — el avatar vuelve a ser slug.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('barber-photos', 'barber-photos', true)
on conflict (id) do nothing;

-- Lectura pública (TV, kiosko, dashboard).
drop policy if exists "barber-photos public read" on storage.objects;
create policy "barber-photos public read" on storage.objects
  for select using (bucket_id = 'barber-photos');

-- SIN policies de insert/update/delete: escrituras solo vía service
-- role (el endpoint), que bypassa RLS. Nadie más escribe aquí.
