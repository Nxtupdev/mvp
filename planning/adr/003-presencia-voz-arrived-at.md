# ADR 003 — Presencia de voz: `arrived_at` como única señal de "llegó"

**Contexto.** Las reservas por teléfono (Mamacita/Julie) entran a la cola
ANTES de que el cliente esté físicamente en la tienda. Si se tratan como
walk-ins: el match automático les asigna barbero que se queda esperando, la
cascada de no-show los bota antes de llegar, y las stats del dueño se inflan
con gente que quizá nunca aparece.

**Decisión** (migraciones 053 + 058).
- `queue_entries.arrived_at` = presencia física. Walk-in **nace** con ella;
  la reserva de voz nace con `arrived_at = null` y **se activa** cuando el
  cliente llega y teclea su teléfono en el kiosko (misma entrada, no
  duplicado — el teléfono se normaliza a 10 dígitos en ambos lados).
- Voz sin llegar (`mamacita_entry_id != null AND arrived_at IS null`): no
  recibe match automático, el TV la muestra con 📞 + `eta_at` (~hora), y las
  **stats cuentan solo `arrived_at != null`** ("llegaron", no "llamaron").

**Consecuencias.** Cualquier feature nuevo que cuente/matchee clientes debe
preguntarse "¿llegó o solo llamó?" y filtrar por `arrived_at`. La posición
en cola SÍ se reserva desde la llamada (esa es la promesa del producto).
