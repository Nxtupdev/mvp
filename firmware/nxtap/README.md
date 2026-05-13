# NXT TAP firmware

Hardware target: **Waveshare ESP32-S3-Touch-LCD-4.3** (800×480 RGB LCD with capacitive touch GT911).

## First-time setup

1. Open this folder (`firmware/nxtap/`) in VSCode — PlatformIO auto-detects.
2. Wait for PlatformIO to finish indexing (status bar bottom).
3. Connect the device via USB-C.
4. Click the **Build** icon in the PlatformIO toolbar (✓ checkmark) — first build downloads ~1-2 GB of toolchain.
5. Click **Upload** (➜ arrow).
6. Click **Monitor** (🔌 plug) — you should see `[NXTUP] firmware booting...` at 115200 baud.

If the display lights up and shows "NXTUP" centered → ✅ Phase A done.

## Phases (incremental)

- [x] **A — Hello world** — display init + "NXTUP" text (this commit).
- [ ] B — Touch input (GT911) + tap counter on screen
- [ ] C — LVGL bridge + 3 status screens (ACTIVE/BUSY/BREAK)
- [ ] D — WiFi connection + Supabase REST client
- [ ] E — Captive portal setup flow (AP mode + barber pairing)
- [ ] F — NVS persistence + edge cases

## Specs

Read these before adding features:

- `planning/specs/firmware-ui-spec.md` — pantallas y flow de touch
- `planning/specs/firmware-network-spec.md` — protocolo Supabase + polling
- `planning/specs/firmware-setup-spec.md` — first-boot pairing

## Pin map verification

`include/board_pins.h` targets the standard Waveshare 4.3" variant. If
the display does not show anything after flashing:

1. Open Serial Monitor — confirm `[NXTUP] firmware booting...` prints
2. If yes → toolchain works, problem is the pin map
3. Compare `board_pins.h` against your board's datasheet:
   https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-4.3
4. Specifically the `ESP32-S3-Touch-LCD-4.3B` variant has different pins
