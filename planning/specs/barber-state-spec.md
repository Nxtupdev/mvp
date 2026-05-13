# Barber State Machine Spec

Status: final
Last updated: 2026-04-29

## Purpose

Controlar el estado de cada barbero (available / busy / break / offline) mediante el botón físico NXT TAP o la app de backup. El estado del barbero determina quién atiende al siguiente cliente.

## Audience / Surface

- **Primario**: NXT TAP (botón físico, firmware ESP32-S3) — llama `PATCH /api/barbers/[id]/state`
- **Backup**: `/barber/[shop_id]/[barber_id]` — phone/iPad del barbero en el shop

## Estados

| Estado | Significado |
|--------|-------------|
| `offline` | No está en el shop (turno no iniciado o terminado) |
| `available` | Listo para el siguiente cliente. Entra al FIFO de barberos. |
| `busy` | Con cliente en silla |
| `break` | En descanso temporal |

## Gestos NXT TAP → Transiciones

| Gesto | Desde | Hacia |
|-------|-------|-------|
| Tap corto | `available` | `busy` |
| Tap corto | `busy` o `break` | `available` |
| Long-press 1.5s | cualquiera | `break` |
| Hold 5s | cualquiera | `offline` |

## Lógica de transición (backend)

### → `available`
1. Completar cliente actual: `queue_entries` donde `barber_id = id AND status = 'in_progress'` → `done`.
2. Registrar `available_since = now()`.
3. Buscar siguiente cliente en espera:
   - Primero: el que pidió específicamente este barbero (`barber_id = id AND status = 'waiting'`), menor posición.
   - Si no: el primero con `barber_id IS NULL AND status = 'waiting'`, menor posición.
4. Si hay cliente: asignarlo a este barbero, `status → 'called'`, `called_at = now()`.
5. Responder con `{ barber, next_client }`.

### → `busy`
1. Limpiar `available_since`.
2. El cliente en `called` asignado a este barbero → `in_progress`.
3. Responder con `{ barber, current_client }`.

### → `break` / `offline`
1. Limpiar `available_since`.
2. Actualizar status.
3. Responder con `{ barber }`.

## Acceptance

- [ ] Tap → `available` completa al cliente previo y llama al siguiente en <500ms.
- [ ] TV display se actualiza en <2s después de cada transición.
- [ ] FIFO de barberos respetado: el barbero con `available_since` más antiguo atiende primero.
- [ ] Si no hay clientes en espera, barbero queda `available` sin error.
- [ ] Transiciones inválidas (ej. `offline → busy`) son ignoradas con 400.

## Out of scope

- ❌ Autenticación de barberos para MVP — la app es in-shop only.
- ❌ Skip de cliente (si el cliente no aparece) — Fase B.
- ❌ Historial de turnos por barbero — Fase B.
