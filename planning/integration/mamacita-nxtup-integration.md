# Mamacita ↔ NXTUP — Plan de integración

**Fuente única de verdad.** Cualquier conversación de Claude (Code o web) que trabaje en cualquiera de los dos proyectos debe leer este documento primero.

**Última actualización:** 2026-05-22
**Status:** planning fase

---

## Contexto de los dos proyectos

### NXTUP (`C:\Users\frami\Proyectos\nxtup`)

- **Qué es:** sistema de queue management para barberías. Walk-ins, FIFO de barberos, anti-cheat por IP, breaks con reglas, peaje de llegada tarde, hardware NXT TAP (ESP32-S3 + pantalla táctil).
- **Stack:** Next.js 16 (Vercel) + Supabase (DB + Realtime + RLS) + ESP32 firmware (PlatformIO).
- **Repo:** https://github.com/Nxtupdev/mvp
- **Estado:** producción. Shops activos: Fade Factory (`f6b50767-0538-47ba-86a8-b0c0170b2d38`), Prueba Barber (`0454a06d-d741-4537-abc1-8728b92a87e2`).
- **Equipo:** 4 socios (Frank es uno).

### Mamacita (`C:\Users\frami\Proyectos\mamacita`)

- **Qué es:** agente de voz IA que toma reservaciones por llamada telefónica. Cliente llama → VAPI contesta → recolecta info → crea cita en Supabase → manda WhatsApp.
- **Stack:** Vite + React + TypeScript + shadcn/ui + Supabase + Edge Functions + VAPI + Stripe.
- **Repo:** https://github.com/frpenalo/tu-cita-pro
- **Estado:** producción, sin clientes pagando aún.
- **Equipo:** Frank solo (construido antes de NXTUP).
- **Modelo actual:** single-barber (un número de teléfono = un barbero independiente).

---

## El deal entre los dos

Mamacita se integra a NXTUP como **add-on marketplace**:

- Cada uno mantiene su Supabase, su repo, su deploy independiente
- Comunicación vía webhooks + API REST
- Shop en NXTUP puede activar Mamacita con un click → se provisiona cuenta en Mamacita ligada al shop_id
- Mamacita stays como producto separable y licenciable

### Estructura de licenciamiento propuesta

- **Pricing al shop:** NXTUP Basic $27/mes, NXTUP Pro (con voz) $80/mes (= $53 premium por voz)
- **Split del premium $53:** 40% licencia a Frank, 60% pool de NXTUP (split entre 4 socios)
- **Minimum guarantee escalonado:** $500/mes mes 1-6, $1K mes 7-12, $2K mes 13+
- **Revenue share decreciente:** 40% para 1-200 shops, 30% para 201-500, 20% para 501+
- **Exclusividad NXTUP solo en rubro barberías** (Frank puede vender Mamacita a spas, peluquerías, dentistas, etc.)
- **Buyout option:** $150K mes 24, $200K mes 36, $250K mes 48
- **Trabajo de adaptación** (Mamacita single-barber → multi-barber): $6K one-time como contractor

---

## Roadmap de integración (4 sprints + 1 preparatorio)

### Sprint preparatorio — Adaptar Mamacita al modelo multi-barbero

**Por qué:** Mamacita actualmente asume "1 teléfono = 1 barbero". NXTUP necesita "1 teléfono = 1 shop con múltiples barberos".

Archivos a modificar en Mamacita:
- `supabase/functions/vapi-assistant-request/index.ts` — agregar prompt "¿con qué barbero quieres?"
- `supabase/functions/vapi-create-appointment/index.ts` — aceptar `barber_id` opcional
- `supabase/functions/vapi-buy-number/index.ts` — passar de "por barbero" a "por shop"
- Migración SQL para hacer `barber_id` nullable en tabla `appointments`
- Edge function de slots → calcular disponibilidad union de todos los barberos del shop

Tiempo estimado: 2-3 semanas.

### Sprint 1 — Fundación (linking de cuentas)

En NXTUP:
- Migración: agregar a `shops` las columnas `mamacita_shop_id`, `mamacita_activated_at`, `mamacita_phone_number`, `mamacita_webhook_secret`
- Endpoints `POST /api/addons/mamacita/activate` y `/deactivate`

En Mamacita:
- Endpoints `POST /api/shops/provision` y `/deprovision`
- Magic link generation para acceder al dashboard

### Sprint 2 — Flujo de citas

- Mamacita's `vapi-create-appointment` dispara webhook a NXTUP
- NXTUP endpoint `POST /api/appointments/sync` recibe y guarda
- Migración: tabla `appointments` en NXTUP
- Endpoint `GET /api/shops/[id]/availability` para que Mamacita consulte

### Sprint 3 — UX del marketplace

- Página "Add-ons" / "Marketplace" en NXTUP dashboard
- Card de Mamacita con botón "Activar"
- Modal de activación
- Sidebar item "Voz IA" una vez activado
- (Stripe billing automatizado opcional, manual al inicio)

### Sprint 4 — Citas en operación diaria

- Cron de promoción cada minuto: appointments → queue_entries cuando se acerca la hora
- Skip detection consciente de citas (NO penalizar barberos arriba si el corte vino de una cita)
- UI: TV display "Próximas citas hoy", Centro de Mando "Agenda del día"
- NXT TAP firmware: mostrar próxima cita del barbero

---

## Estado actual (avanzar este checklist al hacer cambios)

- [ ] Deal con socios cerrado y firmado
- [ ] Sprint preparatorio iniciado
- [ ] Sprint preparatorio terminado
- [ ] Sprint 1 — Fundación
- [ ] Sprint 2 — Flujo de citas
- [ ] Sprint 3 — UX del marketplace
- [ ] Sprint 4 — Operación diaria
- [ ] Producción habilitada para primer shop piloto

---

## Decisiones tomadas (no re-discutir)

- Opción de arquitectura: **B (Marketplace add-on)** — dos sistemas separados, vinculados via webhook + API. NO Opción A (white-label invisible), NO Opción 5 (embedded).
- Modelo de billing: manual al inicio, Stripe automatizado cuando haya 10+ shops con add-on.
- VAPI sigue siendo el provider de voz (no se cambia por otra alternativa por ahora).
- NXT TAP physical device sigue en roadmap pero NO bloquea la integración Mamacita-NXTUP (son tracks paralelos).

---

## Decisiones pendientes

- Sensor PIR en NXT TAP (planning aparte: `planning/hardware-design/nxt-tap-pir-integration.svg`)
- Patentes — provisional + trademarks por ahora, utility patent post-tracción
- Integración Mamacita ↔ NXT TAP firmware (¿el dispositivo muestra próxima cita? Definir en Sprint 4)

---

## Estado de implementación — lado NXTUP (2026-06-11)

Construido en este repo para que Mamacita consuma la API de NXTUP:

- **Migración `053_mamacita_queue_linkage.sql`** — agrega `mamacita_entry_id` + `check_in_code` a `queue_entries`. Pendiente de correr en Supabase SQL Editor.
- **`lib/mamacita.ts`** — auth Bearer + HMAC + helper `notifyMamacita()` para webhooks de vuelta.
- **`GET /api/mamacita/availability?shop_id=`** — barberos libres/ocupados + tamaño de cola + ETA. Auth Bearer.
- **`POST /api/mamacita/queue-entries`** — inserta el cliente de voz en la cola (waiting, sin match inmediato). Auth Bearer + HMAC, idempotente por `mamacita_entry_id`.
- **Presencia (Opción A, implementada):** `queue_entries.arrived_at` distingue "reservó por voz, viene en camino" (NULL) de "presente" (set). El match en `state/route.ts` ignora entradas de voz no llegadas; el kiosk check-in por teléfono ACTIVA la entrada de voz existente en vez de duplicar. Spec: `planning/integration/voice-presence-spec.md`.
- Typecheck + lint limpios. **Pendiente:** correr migración `053`, setear env vars (`MAMACITA_SHARED_SECRET`, `MAMACITA_WEBHOOK_URL`), deploy a Vercel, **PRUEBA MANUAL del flujo de presencia** (criterios en el spec), y enganchar el webhook `turn_approaching` en el flujo de promoción.

### ✅ Presencia del cliente de voz — RESUELTO (Opción A)

Decisión de Francisco (2026-06-11): el cliente que reservó por voz hace check-in en el kiosk al llegar; eso activa su entrada existente. Implementado con `arrived_at` (ver bullet arriba + spec). **Implementado, PENDIENTE DE PRUEBA MANUAL** — toca el core de cola (`state/route.ts`, `kiosk/checkin/route.ts`), no shippear a producción sin verificar los criterios del spec.

---

## Cómo usar este documento

**Si eres Claude en Claude Code (sesión terminal):**
- Léelo antes de cualquier trabajo de integración
- Actualízalo cuando se tome una decisión nueva
- Hace commit y push del cambio a `nxtup` repo

**Si eres Claude en Claude.ai web (Project Mamacita o Project NXTUP):**
- Tener este archivo como Project Knowledge uploaded
- Re-uploadear cuando se actualice
- O fetchearlo de la última versión en GitHub (cuando se haga público el repo, o vía gist)

**Si eres Frank (el humano):**
- Leerlo de vez en cuando para mantener el norte
- Decir a Claude "actualiza el integration doc" cuando algo cambie
