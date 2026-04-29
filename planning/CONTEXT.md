# Planning

Last updated: 2026-04-27

## What This Folder Is

Specs, decisiones (ADRs), business plan, notas de IP/patentes y roadmap de NXTUP. Specs son contratos: **WHAT + acceptance**, nunca HOW. Cualquier cosa que se construya en `/src` o `/firmware` empieza con un spec aquí.

## How Work Gets Here

1. Idea o requerimiento llega (de socios, pilotos, owner feedback).
2. Se redacta un spec liviano antes de tocar código.
3. Spec se valida con stakeholders → status `final`.
4. `/src` o `/firmware` consumen el spec para construir.
5. Decisiones técnicas no-triviales se guardan como ADR (`adr/`).
6. Notas de IP, patentes, trademark viven en `ip/`.

## File Format(s)

### Spec template (`specs/<slug>-spec.md`)

```markdown
# [Feature Name] Spec

Status: draft | review | final
Last updated: YYYY-MM-DD

## Purpose
[1-2 líneas: por qué existe]

## Audience / Surface
[Quién lo usa: barber, owner, TV display, hardware]

## Sections / Behavior
[Qué hace, paso a paso. Comportamientos clave.]

## Acceptance
- [ ] Criterio verificable 1
- [ ] Criterio verificable 2

## Out of scope
- [Lo que explícitamente NO se construye]

## References
[Links a otros specs, ADRs, business plan]
```

### ADR template (`adr/<YYYY-MM-DD>-<slug>.md`)

```markdown
# [Decision title]

Date: YYYY-MM-DD
Status: proposed | accepted | superseded

## Context
[Qué problema/situación obligó a decidir]

## Decision
[Lo que se decidió, en una oración]

## Consequences
[Qué cambia, qué se gana, qué se pierde]

## Alternatives considered
[Opciones descartadas y por qué]
```

### Sub-folders sugeridas (créalas a demanda)

- `specs/` — feature/page specs
- `adr/` — decision records con fecha
- `business/` — business plan, pricing, modelo de revenue
- `ip/` — patent notes, trademark, NDAs templates
- `roadmap/` — fases y milestones

## Token Management

Cuando trabajes en este workspace, carga:
1. **Siempre**: este `CONTEXT.md`
2. **Siempre**: `CLAUDE.md` raíz (voz, hard rules)
3. **A demanda**: spec específico que estás escribiendo o referenciando
4. **A demanda**: ADRs relacionados

**NO cargar**: `/src/*` ni `/firmware/*` desde aquí. El planning vive antes del build, no junto al build.

## Quality Checklist

- [ ] Spec tiene Purpose, Sections, Acceptance verificables, Out of scope explícito
- [ ] ADR tiene Context, Decision, Consequences, Alternatives
- [ ] Lenguaje directo y pro (sin jargon, sin "powered by AI")
- [ ] Acceptance criteria son testeables (no "funciona bien" — algo medible)
- [ ] Decisiones de hardware/firmware tienen ADR (no solo prosa libre)

## What NOT to Do

- No escribir implementación dentro de specs (no código JSX, no SQL completo). Solo schema/contrato.
- No specificar sin pensar en la audiencia (barber vs owner vs TV — UX cambia).
- No editar specs después de que `/src` o `/firmware` empezó a build. Si cambia el alcance: nuevo spec o version bump.
- No mezclar business decisions con specs técnicos. Cada uno en su sub-folder.
- No publicar notas de IP/patentes — esto es trade secret hasta filing.
