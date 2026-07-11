-- ============================================================
-- NXTUP — precio a nivel shop en `services`
-- Run in Supabase SQL Editor
--
-- Contexto: el dueño administra servicios + precios desde su panel de
-- NXTUP (/dashboard/services). Al guardar, NXTUP le avisa a Mamacita
-- (evento shop_profile_updated) para que Julie (voz) cite los precios
-- cuando un cliente pregunta por teléfono.
--
-- La migración 032 creó `services` SIN precio (se difirió, con nota de
-- "quizás por barbero"). Decisión de la spec Mamacita↔NXTUP: precio a
-- NIVEL SHOP — una columna simple. Nullable: un servicio sin precio
-- simplemente no se cita por voz (Julie lo omite).
-- ============================================================

alter table services
  add column if not exists price numeric(10, 2)
  check (price is null or price >= 0);

comment on column services.price is
  'Precio del servicio en USD, a nivel shop (no por barbero). Lo edita el dueño en /dashboard/services. Nullable: sin precio = no se cita por voz. Alimenta el evento shop_profile_updated hacia Mamacita/Julie.';
