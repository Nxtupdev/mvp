# POC — Detección de salida de barberos (sensor Wi-Fi)

Mide si podemos detectar cuándo un barbero **sale del shop** mirando la red
local, para luego forzarle break automático. Esta fase es **solo medición** —
no toca la lógica de disponibilidad ni pone break a nadie.

## Qué mide y por qué
Cada ~45s, por cada teléfono pareado, el agente registra **dos señales**:
- **ARP** (`arp-scan`): la **verdad** — ve el teléfono aunque esté dormido.
- **ICMP** (`ping`): el **proxy** de lo que una cajita barata (onn) sin root
  podría hacer en producción.

Guardamos el log **crudo** (sin debounce). El debounce (3/5/7 min) se simula
después sobre el mismo dataset. La divergencia **ARP-presente pero ICMP-ausente**
es el punto ciego que decide si producción va en la onn o en un Pi por shop.

## Hardware
Un **Linux real con root** en el shop: Raspberry Pi, o una laptop/mini-PC vieja.
NO la onn (Android sin root no puede hacer arp-scan real). Conectado al **mismo
Wi-Fi** que los teléfonos de los barberos.

## Setup
```bash
sudo apt update && sudo apt install -y arp-scan python3
```

1. En NXTUP: **Dashboard → Sensor (POC)** → genera el **token** y **parea** cada
   teléfono (su IP local = qué barbero). Para ver la IP de un teléfono: en el
   teléfono, Ajustes → Wi-Fi → (i) de la red.
2. Corre el agente (como root — arp-scan lo necesita):
```bash
sudo SENSOR_SERVER=https://www.getnxtup.com \
     SENSOR_TOKEN=sensor_xxxxx \
     SENSOR_INTERVAL=45 \
     python3 scan-agent.py
```
Opcional: `SENSOR_IFACE=wlan0` y `SENSOR_SUBNET=192.168.1.0/24` si la
auto-detección no acierta.

## Que sobreviva reinicios (systemd)
`/etc/systemd/system/nxtup-sensor.service`:
```ini
[Unit]
Description=NXTUP POC exit sensor
After=network-online.target
Wants=network-online.target

[Service]
Environment=SENSOR_SERVER=https://www.getnxtup.com
Environment=SENSOR_TOKEN=sensor_xxxxx
Environment=SENSOR_INTERVAL=45
ExecStart=/usr/bin/python3 /ruta/a/scan-agent.py
Restart=always
User=root

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl enable --now nxtup-sensor
journalctl -u nxtup-sensor -f   # ver el log en vivo
```

## Protocolo de prueba (lo corre Francisco)
- 3-4 días corriendo, 2-3 teléfonos pareados (mezcla iPhone/Android si se puede).
- Anotar **a mano** 3-4 salidas reales (barbero X salió a las HH:MM) para comparar
  contra lo detectado.

## Criterio de éxito
< 2 falsas salidas por dispositivo por día con debounce ≤ 7 min, y detección de
salidas reales en ≤ 7 min. Se evalúa con la tabla de divergencias del dashboard,
no antes.

## Descartable
Todo esto (tablas `poc_*`, este script) es del POC. En producción el modelo
será otro (eventos ya debounceados) y esto se borra.
