# NXT TAP — Render Reference (Producto Final)

Last updated: 2026-04-29

Esta es la **visión final** del producto físico de NXTUP. Sirve como norte cuando llegue el momento de fabricar. **No es la versión MVP** — el MVP corre en M5Stack AtomS3R con 1 botón cyclic. Ver `planning/specs/` para specs activos del MVP.

> Cuando recibas las imágenes originales del render, guárdalas en esta misma carpeta como `render-front.png`, `render-side.png`, `render-back.png`, `render-in-station.png`.

---

## Identidad del producto

- **Nombre comercial**: NXT TAP
- **Modelo**: NXT TAP-3 (3-button variant)
- **Tagline principal**: SIMPLE. FAST. FAIR.
- **Tagline secundario**: No Arguments. No Confusion. No Lost Turns.
- **Made in USA** (claim de marca)

---

## Form factor

| Dimensión | Valor |
|-----------|-------|
| Ancho | 71 mm (2.8 in) |
| Alto | 152 mm (6.0 in) |
| Profundidad | 23 mm (0.9 in) |
| Color | Negro mate |
| Branding | "NXTUP" en top, frente |

Layout: vertical, 3 botones circulares apilados (ACTIVE arriba, BUSY medio, BREAK abajo).

---

## Botones y estados

Cada botón es circular, con texto inline y **LED ring alrededor**. El LED del botón en el estado actual brilla con su color; los demás quedan oscuros.

| Botón | Color LED | Estado | Significado |
|-------|-----------|--------|-------------|
| ACTIVE | Verde | Disponible | Join the queue |
| BUSY | Rojo | Atendiendo cliente | Taking a client |
| BREAK | Amarillo | Pausa | Step away |

**Comportamiento visual**: solo el LED ring del estado activo brilla. Cambio de estado = tap directo en el botón correspondiente (no cycle, no long-press).

---

## Conectividad y poder

- **WiFi** (sin Bluetooth — alineado con diferenciador "no phone dependency")
- **Batería**: 7+ días de duración declarada
- **Input**: 5V 1A (USB-C carga)

---

## Mounting

3 opciones intercambiables (placa trasera modular):

1. **Screw mount** — fija con tornillos a la pared o estación
2. **Magnetic mount** — placa metálica + imán
3. **Velcro mount** — adhesivo reposicionable

---

## Pillars de marca (de los renders)

- **FAIR SYSTEM** — Automatic order every time
- **MORE PEACE** — Better environment for everyone
- **MORE FOCUS** — Serve clients, grow your business

---

## Key features (declarados en los renders)

- 3 Simple Buttons (Active / Busy / Break)
- LED Status Indicators (Easy to see)
- Wireless Connectivity (Wi-Fi)
- Long Battery Life (7+ Days)
- Easy Mounting (Screw, Magnet, Velcro)
- Built for Barbershops (Durable & Clean Design)

---

## In-Station Look (referencia)

Diseñado para vivir junto a clippers y herramientas en la estación del barbero. Estética: clean, minimal, profesional. Encaja con barbershops modernos sin verse fuera de lugar.

---

## Estado del proyecto

- **MVP firmware**: corre en M5Stack AtomS3R (1 botón + LCD), no es el hardware final.
- **Producto final**: pendiente de diseño industrial, PCB, fabricación.
- **Próximo paso**: consultoría inicial con Dragon Innovation (dragoninnovation.com) para orientación sobre vendors y costos reales.
