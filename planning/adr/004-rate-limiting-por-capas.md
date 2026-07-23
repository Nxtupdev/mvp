# ADR 004 — Rate limiting por capas: DB-backed ahora, borde a escala

**Contexto.** Los endpoints públicos sin auth (kiosk/checkin, lookup-client)
necesitan límite por IP. Opciones: servicio externo (Upstash/Redis), contador
en Postgres, o WAF en el borde.

**Decisión** (migración 057 + rama `feat/rate-limiting`). Para el volumen
actual: **contador de ventana fija en Postgres**, incrementado atómicamente
en una sentencia (RPC `rate_limit_hit`), **fail-open** (si el limitador
falla, deja pasar — un check-in real vale más que el límite), sin
dependencias nuevas. Límites holgados porque un shop entero sale por la IP
del WiFi del kiosko.

**Consecuencias / límites explícitos.**
- Esto cubre reglas de negocio y abuso casual. **NO es escudo de flood**: bajo
  ataque real cada request cuesta un write en Postgres aunque se rechace →
  satura el pool y tumba TODA la app.
- **A escala (≈1000 tiendas) o ante flood, la protección se mueve al BORDE**:
  Vercel Firewall/WAF o Cloudflare delante. Alternativa app-level que no toca
  Postgres: Upstash/Vercel KV.
- El fail-open implica que bajo estrés de DB se deja pasar todo — otra razón
  para que el flood se corte antes de llegar aquí.
