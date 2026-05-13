// ============================================================
// nxtup_net.h — WiFi + REST calls to the NXTUP backend
//
// Pulls credentials and identity from secrets.h (gitignored).
// Designed for the ESP32-S3 NXT TAP device.
// ============================================================

#pragma once

#include <Arduino.h>

namespace nxtup {

struct Snapshot {
  String barberName;
  String status;        // "available" | "busy" | "break" | "offline"
  int fifoPosition;     // -1 if not in FIFO
  int heldPosition;     // -1 if no held position
  String calledClient;  // empty string if none
  String currentClient; // empty string if none
  String breakStartedAt; // empty if not in break
  int breakMinutesAtStart; // -1 if not in break
  int firstBreakMinutes;
  int nextBreakMinutes;
  bool keepPositionOnBreak;
  int breakPositionGraceMinutes;
};

/**
 * Block until WiFi is up (or timeout @ 15s). Returns true on success.
 * Safe to call repeatedly — if already connected, returns true immediately.
 */
bool connectWiFi();

/**
 * GET /api/barbers/[BARBER_ID]/snapshot
 * Returns true and fills `out` on success.
 */
bool fetchSnapshot(Snapshot& out);

/**
 * PATCH /api/barbers/[BARBER_ID]/state
 * newStatus must be one of "available" | "busy" | "break".
 * Returns true on HTTP 200.
 */
bool postState(const char* newStatus);

}  // namespace nxtup
