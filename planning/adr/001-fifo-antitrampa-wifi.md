# ADR 001 — FIFO por `available_since` + gating por WiFi (anti-trampa)

**Contexto.** El problema #1 de la pizarra física es la trampa: barberos que
se mueven en la lista, "yo estaba primero", disputas sin evidencia. Si el
sistema digital se puede manipular igual, no vale nada.

**Decisión.**
1. El orden de barberos es un **FIFO por timestamp `available_since`**, que
   SOLO el servidor setea cuando el barbero transiciona a 'available'
   (clock-in o terminar un corte). No hay reordenamiento manual.
2. Toda mutación de estado del barbero exige venir del **WiFi de la tienda**
   (`shops.trusted_public_ip` vs IP real del request). No puedes ponerte
   disponible desde tu casa para "guardar puesto".
3. El orden es **público** (TV, dashboard, PWA) — la transparencia es el
   mecanismo de enforcement social.

**Consecuencias.** Las reglas de negocio (breaks con posición retenida,
sanciones, no-show) se construyen TODAS alrededor de `available_since` — por
eso tantas migraciones lo tocan. El costo: los edge cases de breaks son
complejos (ver migraciones 014→028→047). El POC del sensor de salida
(rama `feat/poc-exit-sensor`) ataca el hueco restante: salir de la tienda
sin marcar break.
