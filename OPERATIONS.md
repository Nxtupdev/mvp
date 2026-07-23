# NXTUP — Runbook de operaciones

Estado al **18 jul 2026**. Qué está corriendo, dónde, y cómo se opera.
Complementa el `README.md` (arquitectura) y `planning/SCHEMA.md` (esquema).

## Infra (quién es quién)

| Pieza | Valor |
|---|---|
| App producción | `www.getnxtup.com` (apex → 307 → www) — Vercel, proyecto `nxtup-app`, cuenta `getnxtup` |
| Supabase | proyecto `wxrlhpjiyqnjuujjcozm` (Postgres + Auth + Realtime + pg_cron) |
| Repo | `github.com/Nxtupdev/mvp` — deploy automático al pushear `main` |
| Vertical dealer | repo/Vercel/Supabase APARTE. Nada compartido. |

Secrets: viven en **Vercel → proyecto → Settings → Environment Variables**
(server) y en `src/.env.local` (local, gitignored). La lista completa y qué
hace cada una: `src/.env.example`.

## Migraciones

- Viven en `planning/migrations/NNN_*.sql`, numeradas y con el porqué en
  comentarios (son el registro histórico de decisiones de DB).
- **Se corren A MANO** en el SQL Editor de Supabase (no hay pipeline).
  PostgREST/REST no puede correr DDL — solo un humano en el editor.
- ⚠️ **Verifica el proyecto antes de pegar** (selector arriba a la
  izquierda): ya ocurrió correr una migración de barbería en la base de
  dealers por error.
- ⚠️ **Secuencia migración ↔ deploy:** si el código nuevo escribe una columna
  nueva, corre la migración ANTES de deployar (y viceversa al revertir). Una
  migración aplicada con código viejo desplegado puede romper la app viva.
- El SQL Editor **no muestra `raise notice`** — si necesitas un valor de
  vuelta, haz que la función lo `return` y usa `select mi_funcion();`.

**Estado (18 jul 2026):** corridas en prod hasta la **061** inclusive
(incluye 056 del POC de sensor, 057 rate limiting, 058 eta, 059/060 demo,
061 billing). El código de algunas vive en ramas SIN mergear:

| Rama | Qué contiene | Migración | Estado |
|---|---|---|---|
| `feat/rate-limiting` | rate limit por IP en kiosk/checkin + lookup | 057 (corrida) | código sin desplegar; validar con socios |
| `feat/poc-exit-sensor` | POC sensor de presencia (ARP/ICMP) | 056 (corrida) | pendiente montar Linux + protocolo |
| `feat/stripe-billing` | estructura completa de billing Stripe | 061 (corrida) | esperando cuenta de Stripe (ver abajo) |

## pg_cron (jobs en la base)

Fuente de verdad: `select jobname, schedule, active from cron.job order by 1;`

| Job | Schedule | Qué hace | Origen |
|---|---|---|---|
| `nxtup-nightly-reset` | `0 9 * * *` (≈4-5am ET) | apaga barberos, cancela cola vieja, resetea breaks | 013 (reemplazó al job de 010) |
| `nxtup-cleanup-activity-log` | `15 3 * * *` | poda del activity log | 009 |
| `nxtup-cascade-no-show` | `10 seconds` | cascada de no-show del cliente llamado | 018 → 035 → 042 |
| `nxtup-release-stale-called` | `* * * * *` | libera 'called' vencidos | 016 (parte reemplazada por la cascada) |
| `nxtup-break-expired-offline` | `* * * * *` | break vencido + gracia → offline | 028 |
| `nxtup-demo-reseed` | `*/30 * * * *` | re-siembra la barbería demo | 060 |
| `nxtup-auto-offline-idle` | — | **DESACTIVADO** (046 lo desagendó) | 021/046 |

## Integraciones

**Mamacita / Julie (voz)** — secreto compartido `MAMACITA_SHARED_SECRET`
(Bearer + HMAC-SHA256 del body; ver `src/lib/mamacita.ts`).
- Entrada (Mamacita → NXTUP): `/api/mamacita/availability`,
  `/api/mamacita/queue-entries` (crea reserva "en camino", guarda `eta_at`).
- Salida (NXTUP → Mamacita): `notifyMamacita()` → `MAMACITA_WEBHOOK_URL`.
  Eventos: `entry_completed`, `turn_approaching`, `entry_no_show`,
  `shop_profile_updated` (usa `nxtup_shop_id`). Best-effort: si falla, NO
  rompe la cola.
- La activación de presencia: el cliente de voz llega y teclea su teléfono en
  el kiosko → se activa su entrada (`arrived_at`), no se duplica.

**Dispositivos (NXT TAP / paneles)** — endpoints `/api/barbers/[id]/state` y
`snapshot` autenticados con header `x-device-token` = `DEVICE_API_TOKEN`.

**Stripe (parqueado)** — estructura completa en `feat/stripe-billing`
(checkout, portal, webhook, `/dashboard/billing`). Price-agnostic: al definir
precios solo se crean en Stripe y se setean `STRIPE_SECRET_KEY`,
`STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO` en Vercel. Test mode no requiere
EIN. Gating de features APAGADO a propósito (pilotos no se bloquean).

## Barbería DEMO

Para enseñar el producto a dueños. Detalle completo: `planning/demo/`.

| Qué | Valor |
|---|---|
| Dueño demo | `demo@getnxtup.com` (Auth user creado a mano, Auto-Confirm) |
| shop_id (estable) | `8581694a-71db-4185-a2ca-d662877d507a` |
| Página pública | `www.getnxtup.com/demo` — read-only, sin login, ISR 30s, escala a cientos |
| TV / Kiosko | `/display/<shop_id>` · `/kiosk/<shop_id>` |
| Reset manual | botón "Resetear demo" en el header del dashboard (solo visible al dueño demo) → `POST /api/demo/reset` → RPC `reset_demo_shop()` (059) |
| Reset automático | cron `nxtup-demo-reseed` cada 30 min (060) — sin él, el nightly reset dejaría el demo muerto |

## Modelo de seguridad (resumen)

- **RLS**: lo público (shops/barbers/queue_entries/services) tiene lectura
  anónima para TV/kiosko; `clients` y `subscriptions` NO (PII/billing). Desde
  la migración **050** las escrituras sensibles pasaron de policies públicas a
  **route handlers con admin client** (service role) que validan en código.
- **Admin client** (`src/lib/supabase/admin.ts`): solo server-side, nunca al
  browser. La seguridad de esos endpoints vive en sus validaciones.
- **Anti-trampa de presencia**: `shops.trusted_public_ip` — mutaciones de
  estado del barbero exigen venir del WiFi de la tienda.
- **Rate limiting**: app-level DB-backed en rama `feat/rate-limiting`
  (fail-open). A escala, el flood se corta en el borde (Vercel Firewall /
  Cloudflare), NO en la DB.
- ⚠️ `NXTUP VERCEL CODES.txt` (raíz, sin trackear): contiene códigos — está
  en `.gitignore` como cinturón, pero idealmente muévelo FUERA del repo.

## Diagnóstico rápido

- ¿Deploy roto? Vercel → Deployments (¿build rojo?). ¿Migración faltante?
  (error de columna inexistente en logs = código nuevo contra DB vieja).
- ¿TV congelado? El display tiene wake-lock + reload cada 6h; recarga la
  página. Si el shop entero "amaneció apagado" a media mañana, revisa la
  zona horaria del nightly reset.
- ¿Reserva de voz no aparece? Verifica firma HMAC (401 en logs de
  `/api/mamacita/queue-entries`) y que el shop esté `is_open`.
- ¿Demo muerto? `select reset_demo_shop();` y revisa `cron.job`.
