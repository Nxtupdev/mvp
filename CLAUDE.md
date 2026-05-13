# nxtup

Sistema práctico, transparente y confiable para eliminar el error humano en la cola de walk-in. *No reemplazamos tu sistema. Arreglamos lo único que tu sistema no hace — quién sigue.* Para dueños de barberías cansados de disputas por 'who's next', pizarras borradas y manipulación de la cola.

## Stack
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui (PWA)
- **Backend**: Supabase (Auth + Postgres + Realtime)
- **Hosting**: Vercel
- **Hardware MVP**: M5Stack AtomS3R (ESP32-S3 + LCD 0.85") — firmware en Arduino/PlatformIO

## Voice
Directo y pro. Frases cortas. Sin jargon corporativo. Sin "powered by AI".

## Workspaces
- `/planning` — Specs, ADRs, business plan, IP/legal, roadmap
- `/src` — Next.js webapp (TV display, barber app, owner dashboard, client check-in)
- `/firmware` — Código del NXT TAP (AtomS3R)

## Surfaces de la webapp (todas en `/src`)

| Surface | Ruta | Device | Audience |
|---------|------|--------|----------|
| TV Display | `/display/[shop_id]` | Fire TV | Toda la barbería |
| Barber App (backup) | `/barber` | Phone/iPad in-shop | Barbero |
| Owner Dashboard | `/dashboard` | Desktop/iPad | Owner |
| Client Check-in (QR) | `/q/[shop_id]` | Phone del cliente | Cliente walk-in |

## Routing
| Task | Go to | Read | Skills |
|------|-------|------|--------|
| Definir spec de feature/página | `/planning` | `CONTEXT.md` | — |
| Construir UI/lógica de webapp | `/src` | `CONTEXT.md` | `ui-ux-pro-max` |
| Firmware del NXT TAP | `/firmware` | `CONTEXT.md` | — |
| Decisiones de negocio / IP / patentes | `/planning` | `CONTEXT.md` | — |

## Naming Conventions

| Content Type | Pattern | Example |
|--------------|---------|---------|
| Page/feature specs | `[slug]-spec.md` | `tv-display-spec.md` |
| Component specs | `[component]-spec.md` | `barber-card-spec.md` |
| Drafts | `[slug]-[status].md` | `pricing-draft.md` |
| Decision records (ADR) | `[YYYY-MM-DD]-[slug].md` | `2026-04-27-stack-choice.md` |

Slug rules: kebab-case, ASCII, no acentos. Status: `draft`, `review`, `final`.

## Hard Rules

1. **Specs are contracts, not blueprints.** Un spec dice WHAT + acceptance criteria. NO dicta HOW.
2. **Output must be tested.** Nada se shippea sin verificación — automated o manual.
3. **Don't build without a spec.** Incluso cambios pequeños tienen un spec liviano.
4. **Workspace isolation.** Cada `CONTEXT.md` declara qué NO cargar de otros workspaces.
5. **Hardware-driven UX no es negociable.** El botón físico es el diferenciador. Cualquier feature que cree dependencia de teléfono se discute primero.
