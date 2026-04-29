# Src — Next.js Webapp

Last updated: 2026-04-27

## What This Folder Is

Webapp de NXTUP construida en **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** como **PWA**. Una sola codebase con 4 superficies:

| Surface | Ruta sugerida | Device target |
|---------|---------------|---------------|
| **TV Display** | `/display/[shop_id]` | Fire TV / Fire Stick (Silk browser) |
| **Barber App** (backup) | `/barber` | Phone / iPad PWA, in-shop WiFi only |
| **Owner Dashboard** | `/dashboard` | Desktop / iPad |
| **Client Check-in (QR)** | `/q/[shop_id]` | Phone del cliente (browser, PWA install opcional) |

Todas leen y escriben al mismo Supabase project vía Realtime. Las 3 internas (display/barber/owner) requieren in-shop WiFi. La de cliente (`/q/[shop_id]`) es **pública** — cualquiera con el QR puede registrarse.

## How Work Gets Here

1. Spec del feature existe en `/planning/specs/<slug>-spec.md` con status `final`.
2. Implementación cumple con el `Acceptance` del spec.
3. Cambios de schema de Supabase referencian un ADR en `/planning/adr/`.
4. Test (manual o automated) antes de merge a main.

## Stack

- **Framework**: Next.js 14+ App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind + shadcn/ui (no custom CSS frameworks)
- **State**: Server components donde sea posible. Client state mínimo. Supabase Realtime para queue updates.
- **Auth**: Supabase Auth (email/password + magic link). Owner y barbers tienen roles distintos.
- **DB**: Supabase Postgres con Row-Level Security (RLS) por shop.
- **Realtime**: Supabase Realtime channels — el TV display se suscribe al canal de su shop.
- **Hosting**: Vercel (Team `nxtup` separado de proyectos personales).
- **PWA**: `next-pwa` o config nativa de Next 14+ con manifest + service worker.

## Token Management

Cuando trabajes en este workspace, carga:
1. **Siempre**: este `CONTEXT.md`
2. **Siempre**: `CLAUDE.md` raíz
3. **A demanda**: spec del feature en `/planning/specs/`
4. **A demanda**: ADR de schema o decisión técnica relevante
5. **A demanda**: archivos de código de la feature

**NO cargar**: `/firmware/*` desde aquí (el firmware se sincroniza vía Supabase, no necesitas su código). Tampoco `/planning/business/` ni `/planning/ip/` (irrelevante para implementación).

## Quality Checklist

- [ ] Pasa `tsc --noEmit` (typecheck) sin errores
- [ ] Pasa `eslint` sin warnings
- [ ] Cumple con el `Acceptance` del spec
- [ ] RLS policies verificadas (un barber NO puede ver datos de otro shop)
- [ ] Realtime updates funcionan en TV display al cambiar estado del barber
- [ ] PWA installable en iPad (manifest + iconos correctos)
- [ ] Build de producción funciona en Fire TV (Silk browser)
- [ ] Client check-in (`/q/[shop_id]`) funciona en iOS Safari y Chrome Android sin instalar app
- [ ] Endpoint público de check-in tiene rate-limit y validación anti-spam

## What NOT to Do

- No shippear código sin spec en `/planning`.
- No agregar dependencias sin ADR (`npm i <x>` solo después de decisión registrada).
- No bypass del design system de shadcn/ui (custom components solo cuando shadcn no cubra).
- No client-side data fetching para datos críticos de queue — usar server components + Realtime subscription.
- No deshabilitar RLS "por conveniencia". Multi-tenant security es non-negotiable.
- No tocar lógica de queue sin tests. Esta es la core feature.
