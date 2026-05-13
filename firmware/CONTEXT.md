# Firmware — NXT TAP

Last updated: 2026-05-04

## What This Folder Is

Firmware del **NXT TAP**, la pantalla touch que el barbero monta en su estación. El hardware-driven UX que diferencia a NXTUP de Squire/Booksy.

**Hardware actual (development + MVP):**
- **Waveshare ESP32-S3-Touch-LCD-4.3** — pantalla 4.3" 800×480 RGB LCD con touch capacitivo GT911, ESP32-S3-WROOM-1-N16R8 (16MB flash, 8MB PSRAM), USB-C
- Cap touch + display = **toda la cara del device es el botón**, no se necesitan buttons físicos ni LED ring externo

**Toolchain:** PlatformIO + Arduino framework + **LVGL 9** para gráficos.
**Lenguaje:** C++.

## Cambio respecto a la spec original

La spec original asumía **3 botones físicos discretos** (Active / Busy / Break) tipo magnet. Con la pantalla 4.3" touch, el approach cambia:

- ✅ **Toda la pantalla cambia de color/contenido** según el estado (verde / rojo / amarillo / negro)
- ✅ **Tap anywhere** = avanza al siguiente estado natural (active ↔ busy)
- ✅ **Botones secundarios pequeños en esquina** para BREAK y END SHIFT
- ✅ **Mucha más información visible** — nombre del cliente, posición #N, countdown del break, todo en pantalla

El render del NXT TAP-3 con 3 botones queda como **referencia visual del producto final empaquetado** (Fase 2 — diseño industrial custom). Para development y los primeros pilotos: Waveshare 4.3" hace el trabajo y lleva más rápido al mercado.

## UX del display (canónico — implementar exacto)

| Estado | Pantalla | Tap anywhere | Botón corner |
|--------|----------|--------------|--------------|
| `ACTIVE` (idle) | Verde · "ACTIVE" + #posición + nombre del barbero | → BUSY | BREAK / END |
| `ACTIVE` (called) | Verde · "TU CLIENTE" + nombre del cliente + posición | → BUSY (start cut) | BREAK / END |
| `BUSY` | Rojo · "BUSY" + nombre del cliente actual | → ACTIVE (finish cut) | BREAK / END |
| `BREAK` | Amarillo · "BREAK" + countdown grande (60min/30min) | → ACTIVE (back to queue) | END |
| `OFFLINE` | Negro · NXTUP logo + "Tap to start shift" | → ACTIVE | — |

**Regla clave:** el tap es instantáneo. El `delay()` bloqueante está prohibido en el loop principal.

## Comunicación con backend

- **Network**: WiFi del shop (credentials guardadas en NVS persistente).
- **Protocol**: HTTPS REST a Supabase. Sin servidor intermedio.
  - `PATCH /api/barbers/[barber_id]/state` cuando cambia el estado
  - `GET /rest/v1/barbers?id=eq.{barber_id}&select=...` polling cada 3s para recibir updates (cliente asignado, etc.)
  - `GET /rest/v1/queue_entries?barber_id=eq.{barber_id}&status=eq.called` para nombre del cliente llamado
- **Auth**: Supabase anon key + RLS policies (las mismas que usa la webapp).
- **Latency target**: <500ms desde tap hasta TV display actualizado.
- **Offline**: si pierde WiFi, queue local de transitions y reintenta. Display muestra `OFFLINE • RECONECTANDO` con icono.

## Setup flow (primera vez que enciende el device)

1. Device arranca en modo AP (`NXTUP-XXXX-Setup`, sin password).
2. Owner se conecta desde su phone → captive portal con form.
3. Form pide:
   - WiFi SSID + password del shop
   - Shop ID (UUID, copy-paste desde el dashboard)
   - Selección del barbero (lista llamada del shop después de validar shop_id)
4. Device guarda en NVS, reinicia, conecta a shop WiFi.
5. Boot subsequente: salta directo al estado del barbero.

## Token Management

Cuando trabajes en este workspace, carga:
1. **Siempre**: este `CONTEXT.md`
2. **Siempre**: `CLAUDE.md` raíz
3. **A demanda**: spec de firmware en `/planning/specs/firmware-*-spec.md`
4. **A demanda**: ADRs de protocolo o schema
5. **A demanda**: archivos de firmware

**NO cargar**: `/src/*` desde aquí. El firmware solo necesita el contrato REST, no la implementación de la webapp.

## Quality Checklist

- [ ] Compila sin warnings en PlatformIO
- [ ] Boot to ready: <3s desde power-on
- [ ] Tap → display reacciona en <100ms
- [ ] Tap → estado en Supabase actualizado en <500ms
- [ ] Polling no bloquea touch (running on FreeRTOS task separado)
- [ ] Reconecta a WiFi automáticamente
- [ ] Captive portal funciona en iOS y Android
- [ ] Power cycle no pierde shop ID, barber ID, ni WiFi credentials
- [ ] Display nunca queda en estado inconsistente con backend (last-write-wins desde server)

## What NOT to Do

- No agregar Bluetooth/BLE (rompe diferenciador "no phone dependency").
- No agregar audio/buzzer sin spec (sound pollution en barbershop).
- No exponer credentials en logs serial en producción.
- No usar `delay()` bloqueante en el loop principal.
- No commit con credentials hardcoded.
- No flashear pilotos sin test de regresión en device de desarrollo.
- No usar polling más rápido que cada 2s (rate limit Supabase + battery).
