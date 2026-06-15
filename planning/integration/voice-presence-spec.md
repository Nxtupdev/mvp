# Spec — Presencia del cliente de voz (Mamacita) en la cola

**Status:** draft — implementado, PENDIENTE DE PRUEBA MANUAL
**Fecha:** 2026-06-11
**Decisión base:** Francisco eligió "check-in en el kiosk activa la entrada de voz" (Opción A).

## Problema

Un cliente que reserva por teléfono (Mamacita) NO está físicamente en la
barbería cuando entra a la cola — viene en camino. El flujo walk-in de
NXTUP asume presencia: cuando un barbero pasa a `available`, toma al
siguiente `waiting` y lo pone `called`. Si la entrada de voz es la
siguiente, el barbero llamaría a un cliente que aún no llega, y el cascade
de no-show lo sacaría. Hay que distinguir "reservó por teléfono, viene en
camino" de "está presente, listo para la silla".

## Solución (WHAT, no HOW)

1. **Marca de llegada.** `queue_entries.arrived_at` (timestamptz, nullable).
   - `null` = reservó pero no ha llegado (solo entradas de voz nacen así).
   - `not null` = presente. Walk-ins del kiosk nacen presentes.

2. **El match respeta la presencia.** Cuando un barbero queda `available`
   y el sistema busca al siguiente cliente para `called`, debe IGNORAR
   entradas que vienen de voz y aún no llegaron, es decir tratar como
   elegible solo: `mamacita_entry_id IS NULL OR arrived_at IS NOT NULL`.

3. **El check-in del kiosk activa la entrada existente.** Cuando un cliente
   llega y teclea su teléfono en el kiosk, si ya tiene una entrada de voz
   pendiente (`mamacita_entry_id` no nulo, `arrived_at` nulo, `status`
   waiting) para ese shop, el kiosk la ACTIVA (`arrived_at = now`) y
   conserva su posición original — NO crea una segunda entrada. A partir de
   ahí entra al flujo normal (match inmediato si hay barbero libre).

## Acceptance criteria

- [ ] Una entrada de voz en `waiting` con `arrived_at` null NUNCA es puesta
      en `called` por la transición de barbero a `available`.
- [ ] El mismo cliente, al hacer check-in en el kiosk con su teléfono, ve
      su entrada activada (no una nueva) y conserva su posición.
- [ ] Tras activarse, si hay un barbero libre, recibe match inmediato igual
      que un walk-in.
- [ ] Walk-ins normales del kiosk no cambian su comportamiento en absoluto.

## Out of scope (por ahora)

- Webhook `turn_approaching` de vuelta a Mamacita (se engancha cuando la
  entrada activada pasa a `called`).
- Expiración de reservas de voz que nunca llegan (lo maneja el lado
  Mamacita con su `queue_timeout_minutes`; NXTUP podría limpiar con el
  nightly reset).

## Cómo probar (manual, antes de confiar en producción)

1. Insertar a mano una `queue_entry` con `mamacita_entry_id` set y
   `arrived_at` null en un shop de prueba.
2. Poner un barbero `available`. Verificar que NO toma esa entrada.
3. Hacer check-in en el kiosk con el teléfono de esa entrada. Verificar que
   se activa (no duplica) y conserva posición.
4. Repetir con un walk-in normal y confirmar que nada cambió.
