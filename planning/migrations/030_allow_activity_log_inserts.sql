-- ============================================================
-- NXTUP — Permitir INSERT a activity_log sin autenticación
-- Run in Supabase SQL Editor
--
-- Bug encontrado en producción (Fade Factory):
--
--   Los barberos en la PWA no tienen sesión de Supabase auth —
--   acceden por URL pública sin login. Cuando hacían un cambio
--   de estado, la política RLS "owner full access" rechazaba el
--   INSERT en activity_log porque auth.uid() era null y por
--   tanto shops.owner_id <> auth.uid().
--
--   Resultado: SOLO los logs originados por el dueño (con sesión
--   autenticada) y por los crons (SECURITY DEFINER) llegaban a
--   activity_log. Los logs originados por barberos via PWA se
--   perdían silenciosamente. En un día normal una barbería con
--   8 barberos generaba ~200-400 eventos esperados pero solo
--   guardaba ~7-10.
--
-- Fix: agregar una política específica que permite INSERT a
-- cualquiera. Es seguro porque:
--   * El endpoint /api/barbers/[id]/state valida el barber_id
--     y shop_id antes del insert
--   * La política original "owner full access" sigue rigiendo
--     SELECT/UPDATE/DELETE — los dueños siguen siendo los únicos
--     que pueden LEER su propio log
--   * El peor escenario: alguien con la anon key podría
--     spammear filas falsas. Mitigación futura: trigger que
--     valide el shop_id contra los barbers existentes o limitar
--     a service_role.
-- ============================================================

create policy "allow writes to activity_log"
on activity_log for insert
with check (true);
