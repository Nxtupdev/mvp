# TV Display Spec

Status: final
Last updated: 2026-04-28

## Purpose

Mostrar la cola activa en tiempo real en el TV de la barbería. Cualquier cliente que entra ve su nombre y posición sin preguntar. Elimina la ambigüedad de "quién sigue".

## Audience / Surface

- **Quién**: todos en la barbería (clientes esperando, barberos, owner).
- **Surface**: `/display/[shop_id]` en Fire TV / Fire Stick (Silk browser). Pantalla grande, nadie la toca.
- **Device target**: 1080p TV. Sin interacción — solo lectura.

## Behavior

1. Carga la lista de entradas activas (`waiting`, `called`, `in_progress`) ordenadas por posición.
2. Muestra cada entrada con: número de posición, nombre del cliente, barbero asignado (si hay), y status visual.
3. Muestra los barberos y su status actual (available / busy).
4. Actualiza en tiempo real vía Supabase Realtime — sin recarga de página.
5. Si la cola está vacía, muestra estado idle ("No hay clientes en espera").
6. Si el shop está cerrado (`is_open = false`), muestra pantalla de cerrado.

## Status Visual

| Status | Label |
|--------|-------|
| `waiting` | En espera |
| `called` | Llamado |
| `in_progress` | En silla |

## Acceptance

- [ ] Cola se actualiza en <2s cuando cambia un entry en Supabase.
- [ ] Nombres legibles desde 3 metros (font-size mínimo 2rem para nombres).
- [ ] Funciona en Silk browser sin errores de consola.
- [ ] Pantalla no requiere interacción ni recarga manual.
- [ ] Muestra correctamente cola vacía y shop cerrado.
- [ ] Barberos y sus status visibles en pantalla.

## Out of scope

- ❌ Interacción del cliente con el TV.
- ❌ Animaciones complejas / video.
- ❌ Autenticación en el display.
- ❌ Control remoto / navegación por teclado.
