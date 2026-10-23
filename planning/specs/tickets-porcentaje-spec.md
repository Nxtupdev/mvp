# Tickets por porcentaje · Spec

**Estado**: diseño cerrado con Francisco (22-oct-2026). Construcción en rama
`feat/tickets`, SIN push hasta su orden. Reemplaza los "Guest Checks" de papel
donde hoy se anota cada servicio y se calcula el reparto a mano (fotos reales:
60/40 y 70/30 conviviendo en la misma barbería, líneas tipo "30", "40 barba",
"100 tinte", agrupadas por día, totales del encabezado sumados a mano).

## Reglas de negocio

1. **Opt-in por barbería**: toggle "Cuentas por porcentaje" en Configuración
   (apagado por defecto). Apagado = NADA de esto existe en pantalla: panel del
   barbero intacto (3 botones), cero fricción para shops de sueldo/renta.
2. **Reparto por barbero**: % default del shop (60/40 al encender) + override
   individual. UI: DESLIZADOR sobre una línea (Barbero ⟷ Barbería), pasos de 5,
   ambos números visibles en vivo. NUNCA campos numéricos (el "7"/"700" de
   dedo está prohibido por construcción).
3. **Captura = botones, el precio se hereda, jamás se teclea**: al cerrar un
   cliente (busy → available), el panel pregunta "¿Qué le hiciste?" con los
   servicios del shop como botones de SELECCIÓN (toggle, multi-select con total
   visible) + botón "Terminar". Caso común: 2 toques. El estado del barbero
   NUNCA se bloquea: la transición dispara igual y la hoja va encima.
4. **Pendiente, no pérdida**: si cierra la hoja sin elegir, queda una línea
   `pending` (badge); la completa el barbero después (misma hoja) o el dueño.
5. **Corrección solo-dueño, sin tachados**: el dueño edita o elimina una línea
   desde Cuentas; queda rastro en activity_log. El barbero no anula nada (su
   corrección es antes de Terminar).
6. **Vista ≠ cierre**: las vistas filtran por rango (hoy/semana/libre). El
   CIERRE es un botón ("Cerrar cuentas"): liquida TODAS las líneas confirmadas
   no liquidadas, congela por barbero {total, parte barbero, parte casa, %} en
   un comprobante consultable/imprimible, y las marca liquidadas. Sin ciclo
   impuesto: el que paga diario cierra diario; el semanal, el domingo. Las
   `pending` no entran al cierre (la UI avisa si existen).
7. **Dos lentes, una verdad**: dueño ve todo; el barbero ve SOLO lo suyo
   ("Mi cuenta" en su PWA: su semana en vivo con su parte calculada + su
   historial de liquidaciones). Jamás ve números de otros ni de la casa.
8. **Fuera de v1**: propinas, método de pago, estilista de mujeres (tinte
   $100: su dueño no enciende el toggle o la excluye), resumen por WhatsApp,
   PIN de Mi cuenta (pospuesto por Francisco, ver memoria).

## Datos (migración 082)

- `shops.tickets_enabled bool default false` · `shops.barber_split_percent int
  default 60` (parte del BARBERO, 0-100, step 5).
- `barbers.split_percent int null` (override; null = usa el del shop).
- `tickets`: id, shop_id, barber_id, entry_id?, service_id?, service_name
  (snapshot), amount numeric (snapshot del precio al capturar), status
  'pending'|'confirmed', settlement_id?, created_at. RLS: dueño SELECT;
  escrituras solo service role (rutas).
- `settlements`: id, shop_id, range_start, range_end, totals jsonb
  [{barber_id, name, percent, total, barber_part, house_part}], created_at.
  RLS: dueño SELECT.

## Rutas

- `POST /api/barbers/[barber_id]/tickets` (mismo modelo de acceso del panel):
  { entry_id?, service_ids: [] } → precios resueltos SERVER-side de la tabla
  services (nunca del cliente); [] = crea línea pending. `PATCH` para
  completar una pending (solo pending, solo del barbero).
- `GET /api/barbers/[barber_id]/tickets?from&to` → sus líneas + su % + totales
  (Mi cuenta).
- Dueño (cookie): editar/eliminar línea, `POST /api/tickets/settle` (cierre).

## UI

- Configuración → Equipo: toggle + deslizador default + deslizador por barbero.
- Panel barbero: hoja "¿Qué le hiciste?" post-cierre + link "Mi cuenta".
- Dashboard → Cuentas: filtro de rango, tarjeta por barbero (líneas por día),
  totales, botón Cerrar cuentas, historial de comprobantes, versión imprimible.
