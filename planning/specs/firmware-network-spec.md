# Firmware Network Spec — Supabase REST client

Status: draft
Last updated: 2026-05-04

## Purpose

Definir cómo el firmware se comunica con Supabase para sincronizar estado del barbero y recibir clientes asignados, sin bloquear el touch.

## Audience / Surface

- **Quién consume este spec**: el ESP32 firmware (`firmware/nxtap/`).
- **Quién provee el contrato**: el backend Supabase (los endpoints REST + RLS policies que ya usa la webapp).

## Architecture

Dos tasks FreeRTOS corriendo en paralelo:

```
Core 1: UI task
  - LVGL refresh @ 30fps
  - Touch event handling
  - Render según último state recibido

Core 0: Network task
  - WiFi connection + reconnection
  - Polling loop @ 3s
  - Outbound state changes (HTTPS PATCH)
  - Queue local de transitions si offline
```

Comunicación entre tasks: dos queues FreeRTOS (`xQueueCreate`):
- `tx_queue` — UI envía transitions de estado al network task
- `rx_queue` — network task envía updates del server al UI task

Esto garantiza que el touch nunca espere por network.

## Endpoints usados

### 1. PATCH state (outbound — el barbero cambió de estado)

```
PATCH https://{shop_url}/api/barbers/{barber_id}/state
Headers:
  Content-Type: application/json
Body:
  { "status": "available" | "busy" | "break" | "offline" }

Response 200:
  {
    "barber": { id, name, status, available_since, break_started_at, ... },
    "next_client": null | { id, client_name, position },
    "current_client": null | { ... }
  }
```

Esta es la API ya construida en `src/app/api/barbers/[barber_id]/state/route.ts`. El firmware usa la URL pública de la app (Vercel deployment), no Supabase directo, porque la lógica de FIFO y matching vive en el backend.

### 2. GET barber + clients (inbound — polling)

Cada 3 segundos, el firmware hace 2 GETs paralelos a Supabase REST directo:

```
GET https://{supabase_url}/rest/v1/barbers
    ?id=eq.{barber_id}
    &select=id,name,status,available_since,break_started_at,breaks_taken_today
Headers:
  apikey: {SUPABASE_ANON_KEY}
  Authorization: Bearer {SUPABASE_ANON_KEY}

GET https://{supabase_url}/rest/v1/queue_entries
    ?barber_id=eq.{barber_id}
    &status=in.(called,in_progress)
    &select=id,client_name,position,status
    &limit=1
Headers: (same)
```

El firmware mergea ambos results y compara con su last-known state. Si hay diferencia → publica al UI task vía `rx_queue`.

### 3. GET shop config (al boot, una vez)

```
GET https://{supabase_url}/rest/v1/shops
    ?id=eq.{shop_id}
    &select=name,first_break_minutes,next_break_minutes
```

Para conocer la duración de break correcta y mostrar el nombre del shop en menu/about.

## Connection lifecycle

```
boot
  → leer NVS: WiFi creds, shop_id, barber_id
  → if missing → arrancar AP mode (firmware-setup-spec.md)
  → conectar WiFi (timeout 30s)
  → if fail → mostrar error + retry
  → arrancar UI task (default state: OFFLINE)
  → arrancar network task
    → fetch shop config (cached para offline)
    → enter polling loop
```

## Polling cadence

- **Default**: 3000ms entre polls.
- **After local change**: 1000ms el siguiente poll para confirmar rápido (luego vuelve a 3000ms).
- **WiFi reconnect**: poll inmediato al reconectar.

## Offline behavior

Si pierde WiFi:
- UI muestra ícono "RECONECTANDO" en header (small, no intrusive).
- Cambios de estado del barbero se guardan en `tx_queue` local (max 10 items).
- Cuando reconecta, drena la queue en orden FIFO.
- Si la queue está llena cuando hay un nuevo tap → drop el más viejo, log warning.

**Importante**: el server es source of truth. Si el firmware pierde sync, al reconectar **acepta el estado del server** y descarta sus transitions locales. Esto previene que un tap fantasma afecte la fila después de un blackout.

Excepción: si el último estado local es BREAK con countdown corriendo, mantiene su timer local. El countdown lo lleva el firmware, no el server.

## Auth model

- Supabase **anon key** público (mismo que la webapp).
- RLS policies controlan permisos:
  - `barbers` table: anyone authenticated puede update status (RLS migration 003)
  - `queue_entries`: anyone authenticated puede update barber-side
  - `shops`: public read

**Por qué no JWT específico del device**: para v1, el shop ID + barber ID son suficientes para identificar el device. La RLS pública actual permite el flow. Para v2, agregaremos device tokens (genera un JWT con shop_id + barber_id en el payload + secret del shop).

**Riesgo conocido (a mitigar en v2)**: cualquiera con el anon key puede cambiar el status de cualquier barbero si conoce su id. La mitigación parcial es que los IDs son UUIDs no enumerables. Suficiente para piloto, no para producción.

## TLS

- Todas las requests son HTTPS.
- Usar `WiFiClientSecure` con root CA bundle de Mozilla (incluido en ESP32 Arduino core).
- No usar `setInsecure()` excepto en development.

## Acceptance

- [ ] Tap → server actualizado en <500ms (under 50ms WiFi RTT)
- [ ] Polling no bloquea LVGL refresh (cada task en su core)
- [ ] WiFi disconnect → UI muestra ícono dentro de 5s
- [ ] WiFi reconnect → polling resume automático
- [ ] Polling detecta cliente "called" en <3s desde el assignment
- [ ] Power cycle no pierde shop_id, barber_id, ni WiFi creds
- [ ] No memory leaks después de 24h corriendo
- [ ] No requests con anon key en logs serial cuando build flag = release

## Out of scope

- ❌ Realtime via WebSocket (Supabase Realtime) — overkill para v1, polling alcanza.
- ❌ Push notifications via FCM — no aplica al device.
- ❌ Telemetry / analytics — sin telemetry en v1.
- ❌ OTA updates — manual flash via USB-C en v1.

## References

- `src/app/api/barbers/[barber_id]/state/route.ts` — el endpoint que el firmware llama
- `planning/specs/barber-state-spec.md` — máquina de estados que el server enforce
- `planning/migrations/003_barber_rls.sql` — RLS policies
- `planning/specs/firmware-ui-spec.md` — UI consume estos datos
- `planning/specs/firmware-setup-spec.md` — cómo se obtienen credentials (a escribir)
