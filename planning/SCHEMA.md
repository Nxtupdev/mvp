# NXTUP — Esquema vivo (fotografía)

**Verificado contra la base de prod el 18 jul 2026** (filas reales vía REST +
migraciones 001–061). Esto es un MAPA para orientarse rápido — la verdad
byte-a-byte siempre es la base. Para regenerar esta foto, corre en el SQL
Editor:

```sql
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
order by table_name, ordinal_position;
```

Historia/razones de cada columna: `planning/migrations/NNN_*.sql` (están
comentadas con el porqué). Convención de estados y quién escribe qué:
`OPERATIONS.md` → Modelo de seguridad.

---

## shops — la barbería (1 dueño = 1 shop)
`id`, `name`, `owner_id`→auth.users, `is_open`, `max_queue_size`, `created_at`,
`break_duration_minutes` (legacy), `logo_url`, `first_break_minutes`,
`next_break_minutes`, `keep_position_on_break`, `break_position_grace_minutes`,
`timezone` (IANA, para stats/nightly), `trusted_public_ip` (anti-trampa WiFi;
null = sin gating), `break_mode` ('guaranteed'/'not_guaranteed'),
`late_arrival_threshold_time`, `late_arrival_cuts_required`,
`late_arrival_sanction_hours`, `display_message` (cintillo del TV),
`display_language` ('es'/'en' — el TV no depende de cookies).
RLS: lectura pública; escribe el dueño.

## barbers — barberos del shop
`id`, `shop_id`, `name`, `status` ('available'|'busy'|'break'|'offline'),
`created_at`, `available_since` (CLAVE: orden FIFO anti-manipulación; null =
fuera de la fila), `break_started_at`, `avatar`, `breaks_taken_today`,
`break_held_since` (posición retenida al irse a break),
`break_minutes_at_start`, `break_invalidating_barber_ids`,
`break_invalidated` (reserva perdida en modo not_guaranteed),
`late_toll_remaining` (LEGACY 019 — no leer; 047 lo dejó en 0),
`sanctioned_until` (sanción por llegada tarde, 047).
RLS: lectura pública; mutaciones de estado vía endpoints con device token /
RPCs (gating por WiFi).

## queue_entries — la cola (clientes)
`id`, `shop_id`, `client_name`, `client_phone` (10 dígitos normalizados),
`position` (counter histórico; único PARCIAL solo entre estados activos),
`status` ('waiting'|'called'|'in_progress'|'done'|'cancelled'), `barber_id`,
`created_at`, `called_at`, `completed_at`, `client_id`→clients,
`service_id`→services, `mamacita_entry_id` (≠null ⇒ reserva de VOZ; unique
parcial), `check_in_code` (4 chars que Mamacita mandó por WhatsApp),
`arrived_at` (**presencia física**: walk-in nace con ella; la voz la recibe
al hacer check-in en el kiosko; ≠null = "llegó" para stats), `eta_at` (hora
estimada de llegada de la voz, 058 — se muestra en el TV).
RLS: lectura pública; INSERT/UPDATE vía endpoints server-side (050).

## clients — CRM por shop (PII)
`id`, `shop_id`, `phone_number` (unique por shop), `first_name`, `last_name`,
`preferred_language`, `referral_source` (solo 1ª visita:
walk-by|google|instagram|tiktok|friend|other), `first_visit_at`,
`last_visit_at`, `total_visits`, `created_at`, `updated_at`.
RLS: **SIN lectura anónima** (050 — teléfonos). Acceso solo server-side.
RPC: `track_client_visit(client_id)`.

## services — catálogo por shop
`id`, `shop_id`, `name` (unique por shop), `duration_minutes`, `sort_order`,
`active`, `created_at`, `price` (055 — editable por el dueño; cambios se
notifican a Mamacita vía `shop_profile_updated`).
RLS: lectura pública; gestiona el dueño.

## activity_log — bitácora (009)
`shop_id`, `barber_id`, `action` ('state_change'|'no_show'|'client_assigned'|…),
`from_status`, `to_status`, `metadata` jsonb, `created_at`.
Poda nocturna por cron.

## subscriptions — billing Stripe (061; 1:1 con shop)
`shop_id` PK→shops, `stripe_customer_id`, `stripe_subscription_id`,
`status` ('none'|'trialing'|'active'|'past_due'|'canceled'|…), `plan`,
`price_id`, `current_period_end`, `cancel_at_period_end`, `trial_end`.
RLS: el dueño LEE la suya; escribe SOLO el webhook (service role).

## rate_limit_counters — rate limiting app-level (057)
`bucket` PK (`scope:ip:ventana`), `count`, `created_at`.
RPCs: `rate_limit_hit(bucket)` (upsert-increment atómico),
`rate_limit_cleanup()`. Código en rama `feat/rate-limiting`.

## Tokens de acceso (043)
Tablas de tokens de panel/control para links compartibles del dueño
(ver migración 043 y `/api/admin/panel-tokens`).

## poc_* — POC sensor de salida (056; descartables)
`poc_sensor_config`, `poc_sensor_devices`, `poc_scan_observations` +
vista `poc_sensor_summary` (security_invoker). Solo para el experimento
ARP/ICMP (rama `feat/poc-exit-sensor`); se botan al terminar el POC.

---

## Funciones/RPCs clave (no exhaustivo)
- `track_client_visit(uuid)` — contadores de visita (032).
- `barber_set_state(...)` y RPCs de dispositivo (017/020) — transiciones con reglas.
- `nightly_state_reset()` (013), cascada no-show (018/035/042), break vencido (028).
- `reset_demo_shop()` (059) — reseed de la barbería demo; corre cada 30 min (060).
- `rate_limit_hit/cleanup` (057).

## Realtime
Publicación `supabase_realtime`: `queue_entries` + `barbers` (001) — es lo
que empuja TV/dashboard/kiosko sin polling.
