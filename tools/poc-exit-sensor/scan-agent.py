#!/usr/bin/env python3
"""
NXTUP — Agente del POC de detección de salida de barberos.

Corre en un Linux REAL dentro del shop (Raspberry Pi o laptop/mini-PC
vieja, con root). Cada ciclo (~30-60s) mide DOS señales por dispositivo
pareado y las reporta CRUDAS al servidor NXTUP:

  - seen_arp:  presencia ARP (arp-scan) — la VERDAD, ve teléfonos dormidos.
  - seen_icmp: respuesta a ping — el PROXY de lo que una onn barata sin
               root podría hacer en producción.

El agente NO calcula nada (ni debounce, ni eventos): observa y reporta.
Toda la inteligencia (debounce, divergencia, falsas salidas) vive en el
análisis posterior sobre el log crudo.

Requisitos:
  - Correr como root (arp-scan necesita AF_PACKET / sockets crudos).
  - `sudo apt install arp-scan`
  - Python 3 (solo stdlib; no hay pip deps).

Config por variables de entorno:
  SENSOR_SERVER   base del servidor NXTUP  (ej. https://www.getnxtup.com)
  SENSOR_TOKEN    token del sensor del shop (dashboard → Sensor)
  SENSOR_INTERVAL segundos entre ciclos     (default 45)
  SENSOR_IFACE    interfaz de red opcional  (ej. wlan0 / eth0)
  SENSOR_SUBNET   subred opcional para arp-scan (ej. 192.168.1.0/24;
                  si falta usa --localnet)

Uso:
  sudo SENSOR_SERVER=https://www.getnxtup.com SENSOR_TOKEN=sensor_xxx \
       python3 scan-agent.py
"""

import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

SERVER = os.environ.get("SENSOR_SERVER", "").rstrip("/")
TOKEN = os.environ.get("SENSOR_TOKEN", "")
INTERVAL = int(os.environ.get("SENSOR_INTERVAL", "45"))
IFACE = os.environ.get("SENSOR_IFACE", "").strip()
SUBNET = os.environ.get("SENSOR_SUBNET", "").strip()

DEVICES_URL = f"{SERVER}/api/sensor/devices"
OBS_URL = f"{SERVER}/api/sensor/observations"

IPV4 = re.compile(r"\b(\d{1,3}(?:\.\d{1,3}){3})\b")


def log(msg: str) -> None:
    print(f"[{datetime.now().isoformat(timespec='seconds')}] {msg}", flush=True)


def fetch_devices() -> list:
    """GET la lista de dispositivos pareados del servidor."""
    req = urllib.request.Request(
        DEVICES_URL, headers={"Authorization": f"Bearer {TOKEN}"}
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode())
    return data.get("devices", [])


def arp_present() -> set:
    """Set de IPs presentes según arp-scan (la verdad). Requiere root."""
    cmd = ["arp-scan", "--quiet", "--ignoredups"]
    if IFACE:
        cmd += ["-I", IFACE]
    cmd += [SUBNET] if SUBNET else ["--localnet"]
    try:
        out = subprocess.run(
            cmd, capture_output=True, text=True, timeout=INTERVAL
        ).stdout
    except (subprocess.SubprocessError, FileNotFoundError) as e:
        log(f"arp-scan falló: {e}")
        return set()
    ips = set()
    for line in out.splitlines():
        m = IPV4.match(line.strip())
        if m:
            ips.add(m.group(1))
    return ips


def icmp_up(ip: str) -> bool:
    """True si el dispositivo responde a un ping (1 paquete, 1s timeout)."""
    try:
        r = subprocess.run(
            ["ping", "-c", "1", "-W", "1", ip],
            capture_output=True,
            timeout=3,
        )
        return r.returncode == 0
    except (subprocess.SubprocessError, FileNotFoundError):
        return False


def post_observations(rows: list) -> None:
    body = json.dumps({"observations": rows}).encode()
    req = urllib.request.Request(
        OBS_URL,
        data=body,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {TOKEN}",
        },
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        json.loads(r.read().decode())


def main() -> None:
    if not SERVER or not TOKEN:
        log("Falta SENSOR_SERVER o SENSOR_TOKEN. Abortando.")
        sys.exit(1)

    log(f"Arrancando. server={SERVER} interval={INTERVAL}s iface={IFACE or 'auto'}")
    devices = []
    last_device_refresh = 0.0

    while True:
        cycle_start = time.time()

        # Refrescar la lista de dispositivos cada ~15 min (o si está vacía).
        if not devices or cycle_start - last_device_refresh > 900:
            try:
                devices = fetch_devices()
                last_device_refresh = cycle_start
                log(f"{len(devices)} dispositivo(s) pareado(s).")
            except (urllib.error.URLError, ValueError) as e:
                log(f"No pude obtener dispositivos: {e}")

        if devices:
            arp = arp_present()
            scan_ts = datetime.now(timezone.utc).isoformat()
            rows = []
            for d in devices:
                ip = d.get("ip", "")
                rows.append(
                    {
                        "device_id": d.get("id"),
                        "scan_ts": scan_ts,
                        "seen_arp": ip in arp,
                        "seen_icmp": icmp_up(ip) if ip else False,
                    }
                )
            try:
                post_observations(rows)
                seen = sum(1 for r in rows if r["seen_arp"] or r["seen_icmp"])
                log(f"ciclo ok — {len(rows)} obs, {seen} presente(s) (arp={len(arp)} en red)")
            except (urllib.error.URLError, ValueError) as e:
                log(f"No pude enviar observaciones: {e}")

        # Dormir hasta completar el intervalo (descontando lo que tardó el ciclo).
        elapsed = time.time() - cycle_start
        time.sleep(max(1.0, INTERVAL - elapsed))


if __name__ == "__main__":
    main()
