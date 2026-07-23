# ADRs — decisiones de arquitectura

Registro corto de las decisiones grandes y su porqué. **Complemento, no
reemplazo:** el detalle fino histórico vive en los comentarios de
`planning/migrations/` (cada migración documenta su razón) y en
`planning/specs/`. Aquí va lo que un ingeniero nuevo debe saber ANTES de
tocar el sistema.

| ADR | Decisión |
|---|---|
| [001](001-fifo-antitrampa-wifi.md) | FIFO por `available_since` + gating por WiFi de la tienda (anti-trampa) |
| [002](002-seguridad-rls-admin-client.md) | Seguridad: RLS mínimo público + lógica en endpoints con admin client |
| [003](003-presencia-voz-arrived-at.md) | Presencia de voz: `arrived_at` como única señal de "llegó" |
| [004](004-rate-limiting-por-capas.md) | Rate limiting por capas: DB-backed ahora, borde (WAF) a escala |
| [005](005-billing-price-agnostic.md) | Billing Stripe price-agnostic, gating apagado en pilotos |

Formato: contexto → decisión → consecuencias. Si tomas una decisión que a
alguien le va a doler revertir, agrégala aquí (numera secuencial).
