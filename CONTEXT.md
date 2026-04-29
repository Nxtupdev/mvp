# nxtup — Routing

Last updated: 2026-04-27

Este archivo es solo routing. Identidad, naming, y hard rules viven en `CLAUDE.md`. Léelo primero.

## Workspace Flow

```
planning/ (specs, decisiones, business)
    ↓ informs
src/ (Next.js webapp) ←→ firmware/ (AtomS3R)
              ↓                    ↓
        ambos sincronizan vía Supabase Realtime
              ↑
       Cliente vía QR → /q/[shop_id]
       (otra entrada al mismo Supabase)
```

El planning siempre precede al build. Webapp y firmware son hermanos: ambos leen y escriben al mismo Supabase project, ambos siguen los specs de `/planning`. El cliente walk-in entra al sistema escaneando un QR en la entrada de la barbería — sin app, sin fricción.

## Task Routing

| Tu tarea | Va aquí | También necesitas |
|----------|---------|-------------------|
| Spec de TV display | `/planning/CONTEXT.md` | — |
| Spec de barber app | `/planning/CONTEXT.md` | — |
| Spec de owner dashboard | `/planning/CONTEXT.md` | — |
| Spec de client check-in (QR) | `/planning/CONTEXT.md` | `specs/client-checkin-spec.md` |
| Spec de firmware NXT TAP | `/planning/CONTEXT.md` | — |
| ADR (decisiones técnicas) | `/planning/CONTEXT.md` | — |
| Schema de Supabase | `/planning/CONTEXT.md` (spec) → `/src/CONTEXT.md` (impl) | — |
| Build de UI Next.js | `/src/CONTEXT.md` | spec del feature en `/planning` |
| Lógica de cola en webapp | `/src/CONTEXT.md` | spec correspondiente |
| Firmware del botón | `/firmware/CONTEXT.md` | spec del firmware en `/planning` |
| Notas de patentes / IP | `/planning/CONTEXT.md` | — |

## Workspace Purpose

| Workspace | Purpose |
|-----------|---------|
| `planning/` | Specs, ADRs, business plan, IP/legal, roadmap. Nada se construye sin spec aquí. |
| `src/` | Next.js webapp con 3 superficies: TV display (Fire TV), barber app (PWA), owner dashboard. |
| `firmware/` | Firmware del NXT TAP (AtomS3R) — lectura de botón, manejo de estado, sync con Supabase. |

Cada workspace tiene su propio `CONTEXT.md` con detalles completos. **Lee ese, no este archivo, cuando trabajes dentro de un workspace.**
