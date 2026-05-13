# Firmware UI Spec — NXT TAP touch screens

Status: draft
Last updated: 2026-05-04

## Purpose

Definir las pantallas que el barbero ve en el device físico (Waveshare ESP32-S3-Touch-LCD-4.3, 800×480) y cómo responden al touch. Es el **digital twin** del NXT TAP físico — la cara que cambia de color según el estado.

## Audience / Surface

- **Quién**: barbero en su estación, mirando el device 24/7 durante su turno.
- **Surface**: Waveshare ESP32-S3-Touch-LCD-4.3 montado en la estación (cerca de las clippers, no en la pared).
- **Renderizador**: LVGL 9 sobre Arduino framework.

## Layout general — landscape 800×480

```
┌────────────────────────────────────────────────────┐
│ [avatar 56px] Carlos                  [···] menu   │  ← 56px header
├────────────────────────────────────────────────────┤
│                                                     │
│                                                     │
│                  [STATE CONTENT]                    │  ← 368px hero zone
│                  centered, huge                     │   (the whole zone is tappable)
│                                                     │
│                                                     │
├────────────────────────────────────────────────────┤
│  [BREAK]                              [END SHIFT]  │  ← 56px bottom bar
└────────────────────────────────────────────────────┘
```

- **Header (56px alto):** avatar del barbero + nombre + menú (settings)
- **Hero zone (368px):** pantalla principal, color según estado, contenido cambia. **Esta zona ES el botón** — tap anywhere = avanza estado.
- **Bottom bar (56px):** secondary buttons (BREAK / END SHIFT) — solo aparecen cuando aplican

## Estados y contenido

### `OFFLINE` — barbero no clock-in todavía

```
Header: [—] No barbero · [···]
Hero:   NXTUP logo grande + "TAP TO START SHIFT"
Footer: (vacío)
Color:  Negro (nxtup-bg)
Tap:    → ACTIVE (status: 'available', available_since=now())
```

### `ACTIVE` (sin cliente llamado) — esperando turno

```
Header: [avatar] Carlos · [···]
Hero:   "ACTIVE" pequeño arriba
        "#1" gigante centrado (text-9xl, position en FIFO)
        "Eres el siguiente" o "Posición 1 de 2"
Footer: [BREAK]  [END SHIFT]
Color:  Verde profundo (nxtup-active darkened)
Tap:    → BUSY (status: 'busy', advance current called → in_progress)
```

### `ACTIVE` (con cliente llamado) — cliente está en camino

```
Header: [avatar] Carlos · [···]
Hero:   "TU CLIENTE" pequeño verde arriba
        "MARCUS" gigante centrado (client_name)
        "Posición 4 · acércalo a tu silla"
Footer: [BREAK]  [END SHIFT]
Color:  Verde brillante (pulse subtle)
Tap:    → BUSY (start cut, queue_entry status='called' → 'in_progress')
```

### `BUSY` — cortando

```
Header: [avatar] Carlos · [···]
Hero:   "BUSY" pequeño arriba
        "MARCUS" gigante (client_name)
        "Tap when finished"
Footer: [BREAK]  [END SHIFT]
Color:  Rojo profundo (nxtup-busy darkened)
Tap:    → ACTIVE (finish cut, queue_entry status='in_progress' → 'done',
                  barber status='busy' → 'available' + nuevo available_since)
```

### `BREAK` — descanso

```
Header: [avatar] Carlos · [···]
Hero:   "BREAK" pequeño arriba
        "54:23" gigante tabular (countdown)
        "Break #1 · 60 min" (o #2 · 30 min)
Footer: [BACK TO QUEUE]   (solo este, ocupa todo el ancho)
Color:  Amarillo profundo (nxtup-break darkened)
Tap:    → ACTIVE (back to queue, even if timer not done)
Auto:   Cuando countdown llega a 0:00 → auto ACTIVE
```

### `MENU` — overlay desde header `[···]`

Modal flotante con:
- Settings → re-ejecutar setup flow
- Restart → soft reboot
- Disconnect WiFi → vuelve a AP mode
- About → versión firmware + shop ID + barber ID
- Cerrar

## Interacciones

| Acción | Resultado |
|--------|-----------|
| Tap en hero zone | Avanza estado natural (offline→active, active→busy, busy→active, break→active) |
| Tap en BREAK button | → BREAK |
| Tap en END SHIFT | → OFFLINE (con confirmación opcional) |
| Tap en avatar/nombre del header | (futuro) — ver historial del día |
| Tap en `[···]` | Abre menú overlay |
| Long-press hero (1.5s) | (futuro) — undo último cambio |

## Animaciones

- Cambio de estado: fade entre colores (200ms cubic-bezier)
- Tap feedback: pulse blanco breve (100ms)
- Counter en BREAK: actualización suave cada segundo (no flicker)
- LIVE dot pulsing en header cuando WiFi conectado, rojo cuando desconectado

## Tipografía

- Heading hero (the BIG state word): bold, 96-128px (LVGL: `lv_font_montserrat_*` o custom)
- Body: 24-32px
- Labels small caps: 14-16px tracking widest
- Tabular nums para counter y position

## Acceptance

- [ ] Cada estado renderiza en <50ms desde transición
- [ ] Touch responde en <50ms desde tap (pre-debounce)
- [ ] Fonts crisp a 800×480 (no aliasing visible)
- [ ] Colores match exactamente los tokens NXTUP del web
- [ ] Display nunca freeze incluso si network lag
- [ ] LVGL refresh corre en task FreeRTOS dedicado, no bloquea polling

## Out of scope (para esta v1)

- ❌ Animations complejas (3D transitions, parallax)
- ❌ Custom fonts (uso fonts default de LVGL)
- ❌ Multi-idioma — solo español
- ❌ Theming personalizable por shop — colores fijos NXTUP
- ❌ Sound effects — sin audio
- ❌ Settings page completa — solo el menú básico

## References

- `firmware/CONTEXT.md` — overview del firmware
- `planning/specs/barber-state-spec.md` — máquina de estados (backend)
- `planning/specs/firmware-network-spec.md` — protocolo Supabase (a escribir)
- `planning/specs/firmware-setup-spec.md` — setup AP mode (a escribir)
