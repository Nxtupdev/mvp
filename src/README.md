# NXTUP — webapp (Next.js)

La app de producción de NXTUP (App Router + TypeScript + Tailwind 4 +
Supabase). **El entry point de documentación es el [`README.md` de la
raíz](../README.md)** — arquitectura, layout del repo y deploy. El runbook
operativo está en [`OPERATIONS.md`](../OPERATIONS.md).

## Arrancar

```bash
cp .env.example .env.local   # llenar valores (comentados ahí)
npm install
npm run dev                  # http://localhost:3000
```

## Comandos

| Qué | Cómo |
|---|---|
| Dev server | `npm run dev` |
| Typecheck | `node node_modules/typescript/lib/tsc.js --noEmit -p tsconfig.json` |
| Lint | `npm run lint` |
| Build de producción | `npm run build` (Vercel lo corre en cada push a main) |

## Mapa rápido de rutas

| Ruta | Qué es |
|---|---|
| `/` | Landing pública |
| `/display/[shop_id]` | TV de la tienda (público, realtime) |
| `/kiosk/[shop_id]` | Check-in del cliente en tablet (público) |
| `/dashboard/*` | Panel del dueño (auth) |
| `/demo` | Demo pública read-only (ISR 30s) |
| `/api/mamacita/*` | Webhooks de la integración de voz (HMAC) |
| `/api/barbers/[id]/*` | Endpoints de dispositivos (device token) |

La lógica compartida vive en `src/lib/` (i18n, orden de cola, clientes de
Supabase, integración Mamacita, demo). Los cambios de esquema NO van aquí:
van a `../planning/migrations/` (ver OPERATIONS.md).
