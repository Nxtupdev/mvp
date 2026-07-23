# ADR 002 — RLS mínimo público + lógica en endpoints con admin client

**Contexto.** El diseño original (001/032) dejaba policies RLS públicas de
escritura para que el kiosko anónimo funcionara. La auditoría de seguridad
(jun 2026) encontró que eso permitía, con la anon key, leer/escribir tablas
sensibles (teléfonos de clientes) directo por el REST API de Supabase.

**Decisión** (migración **050**). Lo público queda en LECTURA solo para lo
que el TV/kiosko necesitan mostrar (shops, barbers, queue_entries, services).
`clients` (PII) y toda ESCRITURA sensible se movieron a **route handlers
server-side** que usan el **admin client** (service role, bypassa RLS) y
validan TODO en código (shop existe, is_open, cupo, formatos, rate limit).

**Consecuencias.**
- La seguridad de esos flujos vive en el código de los endpoints — revisar
  el endpoint es revisar la seguridad. RLS queda como red de fondo.
- El admin client JAMÁS se expone al browser (`src/lib/supabase/admin.ts`).
- Costo: features nuevos públicos no pueden "hablar directo" a la DB; pasan
  por un endpoint. Es intencional.
