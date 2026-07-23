# ADR 005 — Billing Stripe price-agnostic, gating apagado en pilotos

**Contexto.** La LLC estaba en formación (EIN pendiente) y los precios sin
definir, pero se quería la estructura de cobro lista para no bloquear el
lanzamiento comercial cuando ambas cosas aterricen.

**Decisión** (migración 061 + rama `feat/stripe-billing`).
- **1 shop = 1 suscripción** (owner↔shop es 1:1). El dueño es el Customer.
- La tabla `subscriptions` es un ESPEJO de Stripe: la escribe SOLO el
  webhook (`/api/stripe/webhook`, firma verificada con raw body). Nada más
  muta billing — Stripe es la fuente de verdad, la tabla es cache.
- **Price-agnostic**: el código referencia planes por clave (`pro`) y lee el
  Price id de env (`STRIPE_PRICE_PRO`). Definir/ cambiar precios = tocar
  Stripe + env, cero código.
- **Gating APAGADO**: `isSubscriptionActive()` existe pero no bloquea nada.
  Los shops piloto no pagan; encender el gating es una decisión de negocio
  explícita, no un default.

**Consecuencias.** Se puede probar todo el flujo en test mode sin EIN. Al
definir el modelo real (por shop vs por barbero/seat, trial) puede hacer
falta: más slots de plan (trivial) o `quantity` por seats (cambio menor en
checkout). Lo que NO hay que tocar: webhook ni tabla.
