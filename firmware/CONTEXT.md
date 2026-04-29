# Firmware — NXT TAP

Last updated: 2026-04-27

## What This Folder Is

Firmware del **NXT TAP**, el botón físico de NXTUP. Este es el **diferenciador core del producto** — el hardware-driven UX que separa a NXTUP de Squire/Booksy.

**Hardware MVP**: M5Stack **AtomS3R** (ESP32-S3 + LCD 0.85" + WiFi).
**Toolchain**: Arduino IDE o **PlatformIO** (recomendado para CI y dependency management).
**Lenguaje**: C++ (Arduino framework) — alternativa MicroPython si el equipo lo prefiere.

## How Work Gets Here

1. Spec del firmware vive en `/planning/specs/firmware-<feature>-spec.md`.
2. Cualquier cambio de protocolo o schema con webapp se coordina vía ADR en `/planning/adr/`.
3. Build (.bin) se prueba en al menos 1 unidad real antes de flash a unidades de pilotos.

## UX del botón (canónico — implementar exacto)

| Gesto | Acción | Display |
|-------|--------|---------|
| **Tap corto** desde `ACTIVE` | → `BUSY` | Fondo amarillo + texto `BUSY` (+ nombre cliente opcional) |
| **Tap corto** desde `BUSY` o `BREAK` | → `ACTIVE` | Fondo verde + texto `ACTIVE` + posición en cola |
| **Long-press 1.5s** | → `BREAK` | Fondo rojo + texto `BREAK` + tiempo transcurrido |
| **Hold 5s** | → `OFFLINE` (fin de turno) | Pantalla apagada |

**Regla clave** (de business plan): *"If a barber finishes a cut and still sees [BUSY] — they'll instinctively press it."* El tap debe ser instantáneo y idempotente.

## Comunicación con backend

- **Network**: WiFi del shop (credentials guardadas en NVS / SPIFFS).
- **Protocol**: HTTPS POST a Supabase REST API (endpoint `barbers/state`). Sin servidor intermedio.
- **Auth**: API key del device (uno por NXT TAP, asignado durante setup).
- **Latency target**: <500ms desde tap hasta TV display actualizado.
- **Offline**: si pierde WiFi, queue local (FIFO) y reintenta. Después de N reintentos, muestra `OFFLINE` en display.

## Setup flow (primera vez)

1. Device arranca en modo AP (`NXTUP-XXXX`).
2. Owner se conecta desde phone, ingresa WiFi credentials + shop ID.
3. Device guarda en NVS, reinicia, conecta a shop WiFi.
4. Device pide API key a backend con shop ID + device ID, queda paired.

## Token Management

Cuando trabajes en este workspace, carga:
1. **Siempre**: este `CONTEXT.md`
2. **Siempre**: `CLAUDE.md` raíz
3. **A demanda**: spec de firmware en `/planning/specs/`
4. **A demanda**: ADRs de protocolo o schema
5. **A demanda**: archivos de firmware

**NO cargar**: `/src/*` desde aquí (el firmware solo necesita conocer el contrato REST, no la implementación de la webapp). Tampoco `/planning/business/` ni `/planning/ip/`.

## Quality Checklist

- [ ] Compila sin warnings en PlatformIO
- [ ] Tap corto: latencia <100ms desde release hasta cambio de display
- [ ] Tap corto: latencia <500ms desde release hasta TV display actualizado
- [ ] Long-press requiere 1.5s exactos (no se dispara accidentalmente)
- [ ] Reconecta a WiFi automáticamente después de pérdida temporal
- [ ] Setup en modo AP funciona en iOS y Android phone
- [ ] Display nunca queda en estado inconsistente con backend
- [ ] Power cycle no pierde shop ID ni API key (NVS persistente)

## What NOT to Do

- No agregar Bluetooth/BLE para sync con phone (rompe el diferenciador "no phone dependency").
- No agregar audio/buzzer sin spec (sound pollution en barbershop).
- No exponer API key en logs serial cuando el device esté en producción.
- No usar `delay()` bloqueante en el loop principal — el botón debe responder instantáneo.
- No commit con WiFi credentials hardcoded (use NVS o config file ignorado por git).
- No flashear unidades de pilotos sin test de regresión en device de desarrollo.
