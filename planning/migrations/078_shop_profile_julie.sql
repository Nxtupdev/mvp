-- ============================================================
-- NXTUP 078 · Perfil del shop para Julie: dirección + WhatsApp del dueño
-- Correr en el SQL Editor del proyecto NXTUP (wxrlhpjiyqnjuujjcozm)
--
-- Decisión de Francisco (17-oct): NXTUP es el dueño del cliente; a
-- Mamacita no se le duplica el alta — el shop NACE en su base cuando el
-- evento shop_profile_updated llega con el perfil completo (al activar
-- Julie) y se sincroniza en cada guardado de Configuración/Servicios.
--
--   * address: Julie la dice por teléfono y va en el WhatsApp al cliente.
--   * owner_whatsapp: E.164 del dueño — ahí le llegan los avisos de
--     Julie ("nuevo cliente en la lista"). Sin esto el dueño no recibe
--     nada, por eso la UI lo marca como recomendado al activar Julie.
--
-- Se capturan en /dashboard/settings (el onboarding sigue mínimo a
-- propósito: nombre + logo). Campo vacío = ausente en el evento =
-- "sin cambio" del lado Mamacita.
-- ============================================================

alter table shops
  add column if not exists address text,
  add column if not exists owner_whatsapp text;

comment on column shops.address is
  'Dirección del shop. Julie la cita por voz y va en los WhatsApp al cliente. Sync a Mamacita vía shop_profile_updated (078).';
comment on column shops.owner_whatsapp is
  'WhatsApp del dueño (E.164) para los avisos de Julie. Sync a Mamacita vía shop_profile_updated (078).';

-- ── Verificación ────────────────────────────────────────────────────
select column_name from information_schema.columns
where table_name = 'shops' and column_name in ('address', 'owner_whatsapp');
