# Firmware Setup Spec — first-boot pairing

Status: draft
Last updated: 2026-05-04

## Purpose

Definir cómo el device **se empareja con un shop y un barber** la primera vez que se enciende, sin necesidad de tools especiales — solo un phone.

## Audience / Surface

- **Quién**: el owner del shop (o un barbero técnicamente capaz) que recibe un device nuevo en la caja.
- **Surface**: el device físico + un phone con browser.

## Trigger conditions

El device entra en setup mode cuando **cualquiera de estos missing en NVS**:
- `wifi_ssid` + `wifi_password`
- `shop_id`
- `barber_id`

Si todo presente → boot directo en operational mode.

Setup mode también se puede forzar desde el menú in-app (`[···]` → Disconnect / Reset).

## Setup flow

### Step 1: AP mode

```
Device arranca
  → ledRing color azul
  → Display muestra:
      ┌─────────────────────────────┐
      │      NXTUP setup            │
      │                             │
      │   1. Conéctate a WiFi:      │
      │   "NXTUP-{4-digit}-Setup"   │
      │                             │
      │   2. Abre tu browser en     │
      │   192.168.4.1               │
      └─────────────────────────────┘
  → ESP32 starts WiFi AP:
    SSID: "NXTUP-{4-random-digits}-Setup"
    No password (open) — está en local LAN solamente
    IP: 192.168.4.1
  → Captive portal redirige cualquier URL → 192.168.4.1
```

### Step 2: Owner conecta su phone al AP

iOS / Android detectan automáticamente que es captive portal y abren la página principal.

### Step 3: Form en el phone

```
┌──────────────────────────────────┐
│   NXTUP Setup                     │
│                                   │
│   WiFi del shop                   │
│   [SSID dropdown / scan]          │
│   [password input]                │
│                                   │
│   Shop ID                         │
│   [paste UUID]                    │
│   ↑ copialo del dashboard         │
│                                   │
│   ¿Quién eres?                    │
│   ( ) Carlos                      │  ← lista llamada después de
│   ( ) Diego                       │     validar shop_id
│   ( ) Tony                        │
│                                   │
│   [PAIR DEVICE]                   │
└──────────────────────────────────┘
```

### Step 4: Validación

Al presionar "Pair Device":
1. ESP32 prueba conectar a WiFi → si falla, muestra error + retry
2. Una vez conectado, fetch a Supabase `GET /rest/v1/shops?id=eq.{shop_id}` para validar
3. Fetch barbers del shop para confirmar que el barber_id seleccionado pertenece
4. Guarda en NVS:
   ```
   wifi_ssid, wifi_password
   shop_id, shop_name
   barber_id, barber_name, barber_avatar
   first_break_minutes, next_break_minutes (cache)
   ```
5. Borra el AP, reinicia device
6. Boot operational con el barbero ya identificado

## Captive portal pages

Implementación: ESP32 corre un mini HTTP server (lib `WebServer.h` o `ESPAsyncWebServer`).

Routes:
- `GET /` — form HTML (también responde a `/generate_204`, `/connecttest.txt`, `/hotspot-detect.html` para que iOS/Android detecten el portal)
- `GET /scan` — devuelve JSON con SSIDs visibles (`WiFi.scanNetworks()`)
- `POST /probe-shop` — recibe shop_id, conecta WiFi, valida shop, devuelve list of barbers
- `POST /pair` — recibe todo, guarda NVS, reinicia

Todas las pages renderizadas inline desde el firmware (no hay almacenamiento HTML separado, son strings en C++ con minimal HTML). Diseño minimal monocromático para minimizar payload — el AP no es lugar para CSS animations.

## NVS schema

Namespace `nxtup`:

| Key | Type | Notes |
|-----|------|-------|
| `wifi_ssid` | string (max 32) | WiFi del shop |
| `wifi_password` | string (max 64) | encrypted-at-rest by NVS encryption |
| `shop_id` | string (UUID 36) | el UUID del shop en Supabase |
| `shop_name` | string (max 64) | cached para mostrar en about |
| `barber_id` | string (UUID 36) | el barbero asignado a este device |
| `barber_name` | string (max 64) | cached |
| `barber_avatar` | string (max 16) | avatar id (zap, crown, etc.) |
| `first_break_min` | uint8 | cached |
| `next_break_min` | uint8 | cached |
| `paired_at` | uint32 | epoch del pairing |
| `firmware_version` | string | versión del firmware actual |

## Re-pair

Desde menú `[···]` en operational mode:
- "Disconnect & re-pair" → borra NVS keys, reinicia, vuelve a step 1
- Hay confirmación double-tap antes de borrar (no se pierde por accidente)

## Acceptance

- [ ] AP visible en iOS y Android dentro de 5s del power-on
- [ ] Captive portal abre automáticamente en iOS y Android (no hay que escribir IP manual)
- [ ] Scan de WiFi devuelve mínimo 5 redes visibles típicas del shop
- [ ] Form completo a operational en <60s
- [ ] WiFi credentials persisten después de power cycle
- [ ] Re-pair from menu funciona y vuelve a setup mode
- [ ] Si shop_id es inválido → error claro en el form
- [ ] Si barber_id no pertenece al shop → error claro
- [ ] Multiple devices en el mismo shop pueden parearse al mismo tiempo (cada uno con su SSID único `NXTUP-XXXX-Setup`)

## Out of scope

- ❌ Bluetooth pairing — sin BLE en v1
- ❌ Provisioning via QR — el shop_id se copy-paste manual
- ❌ Multi-tenant cloud OTA registration — cada device es manualmente pareado
- ❌ Multi-language en setup — solo español

## References

- `firmware/CONTEXT.md` — overview firmware
- `planning/specs/firmware-network-spec.md` — uso del NVS post-setup
- `planning/specs/firmware-ui-spec.md` — UI in operational mode
