# NXTUP

Sistema digital de turnos para barberías — reemplaza la pizarra/lista de papel.
Cada cliente sabe su turno, cada barbero sabe el suyo, nadie hace trampa.
En producción en **https://www.getnxtup.com** con barberías piloto reales.

> Entry point para humanos. Si eres una instancia de IA, empieza por
> `CLAUDE.md` + `CONTEXT.md` (routing por workspace).

## Qué hace

- **Cola FIFO real** de barberos (orden por `available_since`, anti-manipulación).
- **Check-in del cliente** por QR/kiosko con teléfono → detección de cliente
  recurrente, atribución de marketing, match automático a barbero libre.
- **TV display** público en la tienda (`/display/[shop_id]`) vía Supabase Realtime.
- **PWA del barbero** (Disponible / Ocupado / Break) con gating por WiFi de la
  tienda (`trusted_public_ip`) — no puedes ponerte disponible desde tu casa.
- **Dashboard del dueño**: cola en vivo, barberos, stats, configuración, i18n ES/EN.
- **Reglas de negocio en el servidor**: breaks con posición retenida, sanciones
  por llegada tarde, no-show en cascada, reset nocturno (pg_cron).
- **Integración Mamacita/Julie (voz)**: reservas por llamada entran a la cola
  ("en camino" + hora estimada), webhooks firmados HMAC en ambas direcciones.
- **Firmware NXT TAP** (`firmware/`, AtomS3R): botón físico por estación.

## Arquitectura (runtime)

```
                    ┌────────────────────────────┐
                    │   Vercel — Next.js 16 App   │  ← deploy: push a main
                    │   (www.getnxtup.com)        │
                    │  /display /kiosk /dashboard │
                    │  /demo  /api/*              │
                    └──────────────┬─────────────┘
                                   │ supabase-js (anon + service role)
                    ┌──────────────▼─────────────┐
                    │  Supabase (proyecto único)  │
                    │  Postgres + RLS + Realtime  │
                    │  Auth (dueños) + pg_cron    │
                    └──┬───────────┬──────────┬──┘
        Realtime push  │           │          │  RPCs (device token)
   ┌───────────────────▼─┐   ┌─────▼─────┐  ┌─▼──────────────┐
   │ TV display / kiosko │   │ PWA barbero│  │ NXT TAP (fw)   │
   └─────────────────────┘   └───────────┘  └────────────────┘

   Mamacita (agente de voz "Julie") ⇄ /api/mamacita/* (HMAC compartido)
```

Un solo proyecto de Supabase: `wxrlhpjiyqnjuujjcozm`. La lógica de negocio
vive en los route handlers de Next (`src/app/api/*`) y en funciones SQL
(pg_cron); el cliente anónimo solo LEE lo público (modelo RLS de la
migración 050 — ver `OPERATIONS.md`).

## Layout del repo

| Carpeta | Qué es |
|---|---|
| `src/` | La webapp Next.js (App Router + TS + Tailwind 4). Aquí se compila y deploya. |
| `planning/` | Specs, migraciones SQL, ADRs, docs de integración. **El planning precede al build.** |
| `planning/migrations/` | TODO cambio de esquema/DB, numerado (`NNN_*.sql`). Se corren a mano — ver `OPERATIONS.md`. |
| `planning/SCHEMA.md` | Fotografía del esquema vivo + cómo regenerarla. |
| `firmware/` | Firmware del NXT TAP (AtomS3R / PlatformIO). |
| `OPERATIONS.md` | Runbook: deploy, migraciones, crons, integraciones, demo, seguridad. |

## Bootear en local

```bash
cd src
cp .env.example .env.local   # y llena los valores (ver comentarios ahí)
npm install
npm run dev                  # http://localhost:3000
```

Necesitas como mínimo `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(dashboard de Supabase → Settings → API). Sin `SUPABASE_SERVICE_ROLE_KEY` la app
arranca pero fallan kiosko/webhooks (usan el admin client server-side).

Typecheck: `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json`
(desde `src/`). Lint: `npm run lint`. No hay suite de tests todavía.

## Deploy

Push a `main` → Vercel construye y deploya automático (~40s) a
`www.getnxtup.com` (el apex redirige 307 a www). Los previews por rama están
detrás de SSO de Vercel (no son públicos). **Si el cambio depende de una
migración, corre la migración primero** — ver la secuencia exacta y el estado
de ramas vivas en `OPERATIONS.md`.

## Verticales

Este repo es la vertical **barbería**. La vertical **dealer** (concesionarios)
es OTRO repo, OTRO proyecto de Vercel y OTRA base de Supabase — no comparten
nada en runtime. No corras SQL de una vertical en la base de la otra.
