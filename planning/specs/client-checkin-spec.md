# Client Check-in Spec

Status: final
Last updated: 2026-04-28

## Purpose

Permitir que clientes walk-in se registren a sí mismos en la cola de la barbería escaneando un QR en la entrada — sin instalar app, sin hablar con un barbero. Reduce fricción, refuerza el diferenciador anti-manipulación (el cliente está en la lista por su propia acción, con timestamp inviolable).

## Audience / Surface

- **Quién**: cliente walk-in del barbershop (no recurrente y recurrente).
- **Surface**: ruta pública `/q/[shop_id]` accedida desde el phone del cliente vía cámara → QR.
- **Device target**: iOS Safari + Chrome Android. Sin app store.

## Behavior

### Flujo nuevo cliente (primera vez)

1. Cliente entra a la barbería, ve sticker en puerta: *"Scan to check in"* + QR.
2. Escanea con cámara nativa → abre `nxtup.com/q/[shop_id]` en browser.
3. Pantalla muestra: nombre del shop, lista pública de barberos disponibles (verde) y ocupados (amarillo), tiempo estimado de espera.
4. Cliente ingresa: nombre + phone (10 segundos, 2 campos).
5. Opcional: selecciona barbero específico **o** "siguiente disponible".
6. Tap "Check in" → registro va a Supabase con timestamp del servidor.
7. Pantalla cambia a estado "en cola": posición, espera estimada, opción "instalar como app" (PWA).
8. Cliente recibe SMS opcional cuando es el siguiente (Fase B — fuera de scope MVP).

### Flujo cliente recurrente

1. Escanea QR → URL recordada en browser/cookie.
2. Pantalla saluda con nombre, 1-tap "Check in".
3. Resto idéntico.

### Edge cases

- Shop cerrado: pantalla muestra horario, no permite check-in.
- Cola llena (definido por owner en dashboard): muestra "Sin cupos hoy" con próximo horario disponible.
- Cliente intenta check-in desde fuera del shop (geo): permitido (no bloqueamos por GPS — confiamos en el barbero llamando al nombre).
- Spam / fake check-ins: rate-limit por IP + número de phone único.
- Phone inválido: error inline, sin cancelar el registro.

## Acceptance

- [ ] Cliente puede pasar de "ver QR" a "estoy en cola" en <30 segundos en primer uso.
- [ ] Cliente recurrente puede check-in en <5 segundos.
- [ ] Posición en cola actualiza en tiempo real (Realtime) sin recarga manual.
- [ ] Endpoint `POST /api/checkin` tiene rate-limit (max 3 check-ins por phone por shop por día).
- [ ] Página funciona en iOS Safari 16+ y Chrome Android sin errores de consola.
- [ ] Lighthouse score: Performance >90, Accessibility >95, PWA installable.
- [ ] Owner ve nombre + phone del cliente en dashboard al instante.
- [ ] Display TV muestra el cliente en cola al instante (Realtime).
- [ ] Si cliente cancela (botón "Salir de la cola"), se remueve y los demás avanzan.

## Out of scope (MVP)

- ❌ SMS notifications cuando es el siguiente — **Fase B** (post-MVP).
- ❌ Web push notifications — **Fase B**.
- ❌ Geofencing / BLE auto check-in — **Fase C** (después de validar demanda).
- ❌ Pagos / tips integrados — explícitamente **no es el dominio de NXTUP** (Squire/Booksy se enfocan ahí, nosotros no).
- ❌ Booking por adelantado — Fase futura, parte de la "expansión a OS de barbería" en la visión.
- ❌ Login de cliente con email/Apple/Google — el phone + cookie es suficiente para MVP.

## References

- Business plan original (NXTUP Business Plan, página 1, nota a mano: *"cuando el cliente llega que automáticamente se agregue al queue"*).
- ADR pendiente: `adr/YYYY-MM-DD-client-checkin-method.md` (justificación de QR sobre BLE/geofencing para MVP).
- Patent provisional: incluir claim de "customer self-registration via coded identifier" en lenguaje genérico que cubra QR, NFC y proximity-based methods.

## Roadmap de evolución (informativo, no scope MVP)

| Fase | Método | Cuándo |
|------|--------|--------|
| **A** (MVP) | QR escaneable | Lanzamiento |
| **B** | PWA installable + web push | Mes 3-6 |
| **C** | BLE iBeacon + app native | Mes 6-12 (solo si demanda lo justifica) |
