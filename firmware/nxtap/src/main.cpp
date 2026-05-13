// ============================================================
// NXTUP — NXT TAP firmware
// Phase C-lite — title + 3 equal buttons (ACTIVE / BUSY / BREAK)
//
// Layout matches the spirit of the physical NXT TAP render
// (three discrete buttons). Each button transitions the barber
// to that state. The currently active button is filled with its
// status color; the others are outlined.
//
// Mock data only — Phase D wires this to Supabase.
// ============================================================

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <Wire.h>
#include <TAMC_GT911.h>

#include "board_pins.h"
#include "nxtup_colors.h"
#include "nxtup_net.h"

// ── Display ────────────────────────────────────────────────────────
//
// Bounce buffer mode: the ESP-IDF RGB LCD driver allocates two small
// SRAM buffers; the LCD peripheral reads from those, while DMA refills
// them from the PSRAM framebuffer in the background. This decouples
// LCD scan-out from our framebuffer writes and eliminates the tearing
// we saw when writing to the LCD's own buffer mid-scan.
//
// 10 lines × 800 px = 8000 px ≈ 16 KB SRAM — plenty of headroom.
constexpr size_t kBounceBufPx = 10 * LCD_WIDTH;

static Arduino_ESP32RGBPanel *bus = new Arduino_ESP32RGBPanel(
    LCD_DE_PIN, LCD_VSYNC_PIN, LCD_HSYNC_PIN, LCD_PCLK_PIN,
    LCD_R0_PIN, LCD_R1_PIN, LCD_R2_PIN, LCD_R3_PIN, LCD_R4_PIN,
    LCD_G0_PIN, LCD_G1_PIN, LCD_G2_PIN, LCD_G3_PIN, LCD_G4_PIN, LCD_G5_PIN,
    LCD_B0_PIN, LCD_B1_PIN, LCD_B2_PIN, LCD_B3_PIN, LCD_B4_PIN,
    /* hsync_polarity         */ 0,
    /* hsync_front_porch      */ 8,
    /* hsync_pulse_width      */ 4,
    /* hsync_back_porch       */ 8,
    /* vsync_polarity         */ 0,
    /* vsync_front_porch      */ 8,
    /* vsync_pulse_width      */ 4,
    /* vsync_back_porch       */ 8,
    /* pclk_active_neg        */ 1,
    /* prefer_speed           */ 16'000'000,
    /* useBigEndian           */ false,
    /* de_idle_high           */ 0,
    /* pclk_idle_high         */ 0,
    /* bounce_buffer_size_px  */ kBounceBufPx);

// Direct RGB display with auto-flush. With bounce buffer enabled in the
// panel above, writes to the framebuffer don't conflict with LCD scan-out,
// so we don't need a Canvas back buffer.
static Arduino_RGB_Display *gfx = new Arduino_RGB_Display(
    LCD_WIDTH, LCD_HEIGHT, bus, /* rotation */ 0, /* auto_flush */ true);

static TAMC_GT911 tp(TOUCH_SDA_PIN, TOUCH_SCL_PIN,
                     TOUCH_INT_PIN, TOUCH_RST_PIN,
                     LCD_WIDTH, LCD_HEIGHT);

// ── State ──────────────────────────────────────────────────────────
enum BarberState { ST_ACTIVE, ST_BUSY, ST_BREAK };

static BarberState g_state            = ST_ACTIVE;
// Persistent storage for strings that come from the server. Backed by
// fixed buffers so the pointers handed to render code never dangle.
static char        g_barberNameBuf[48] = "...";
static char        g_clientNameBuf[48] = "";
static const char *g_barberName       = g_barberNameBuf;
static const char *g_clientName       = g_clientNameBuf;
static int         g_position         = -1;
static int         g_breakDurationSec = 60 * 60;
static uint32_t    g_breakStartMs     = 0;
static uint32_t    g_lastCountdownMs  = 0;

// Touch
static bool        g_wasTouched       = false;
static uint32_t    g_lastTapMs        = 0;
constexpr uint32_t kDebounceMs        = 200;

// Polling cadence — re-fetch the snapshot every 3s while idle so the
// device stays in sync with whatever the dashboard / TV / web app do.
static uint32_t    g_lastPollMs       = 0;
constexpr uint32_t kPollIntervalMs    = 3000;

// ── Layout zones (800x480 landscape) ───────────────────────────────
//
//   y= 0  ┌─────────────────────────────┐
//         │       NXTUP   Carlos        │  title 100px
//   y=100 ├─────────────────────────────┤
//         │                              │
//         │        info panel            │  hero 260px
//         │      (state-specific)        │
//         │                              │
//   y=360 ├─────────────────────────────┤
//         │ [ACTIVE] [ BUSY ] [BREAK ]   │  3 buttons 120px tall
//   y=480 └─────────────────────────────┘
//
constexpr int kInfoY      = 110;
constexpr int kInfoH      = 250;
constexpr int kBtnY       = 360;
constexpr int kBtnH       = 120;
constexpr int kBtnGap     = 6;
constexpr int kBtnW       = (LCD_WIDTH - kBtnGap * 2) / 3;  // 3 buttons, 2 gaps

// ── Drawing helpers ────────────────────────────────────────────────

static void drawCenteredText(int y, uint16_t color, uint8_t size, const char *txt) {
  gfx->setTextColor(color);
  gfx->setTextSize(size);
  int charW = 6 * size;
  int textW = (int)strlen(txt) * charW;
  gfx->setCursor((LCD_WIDTH - textW) / 2, y);
  gfx->print(txt);
}

static void drawCenteredInRect(int x, int y, int w, int h, uint16_t color,
                               uint8_t size, const char *txt) {
  gfx->setTextColor(color);
  gfx->setTextSize(size);
  int charW = 6 * size;
  int textW = (int)strlen(txt) * charW;
  int textH = 8 * size;
  gfx->setCursor(x + (w - textW) / 2, y + (h - textH) / 2);
  gfx->print(txt);
}

static void drawTitle() {
  // NXTUP wordmark
  gfx->setTextColor(nxtup::kFg);
  gfx->setTextSize(6);
  // Center for 5 chars at size 6 = 5*36=180 wide
  gfx->setCursor((LCD_WIDTH - 180) / 2, 20);
  gfx->print("NXTUP");

  // Barber name underneath
  gfx->setTextColor(nxtup::kMuted);
  gfx->setTextSize(2);
  int nameW = (int)strlen(g_barberName) * 12;
  gfx->setCursor((LCD_WIDTH - nameW) / 2, 78);
  gfx->print(g_barberName);
}

// Rectangular button. Filled when "selected", outlined otherwise.
// (Started as rounded but simplified to debug a boot-loop issue.)
static void drawButton(int idx, const char *label, uint16_t color, bool selected) {
  int x = idx * (kBtnW + kBtnGap);
  int y = kBtnY;

  // Clear behind first
  gfx->fillRect(x, y, kBtnW, kBtnH, nxtup::kBg);

  if (selected) {
    gfx->fillRect(x, y, kBtnW, kBtnH, color);
    drawCenteredInRect(x, y, kBtnW, kBtnH, nxtup::kFg, 5, label);
  } else {
    // 2-pixel border
    gfx->drawRect(x, y, kBtnW, kBtnH, color);
    gfx->drawRect(x + 1, y + 1, kBtnW - 2, kBtnH - 2, color);
    drawCenteredInRect(x, y, kBtnW, kBtnH, color, 5, label);
  }
}

static void drawAllButtons() {
  drawButton(0, "ACTIVE", nxtup::kActive, g_state == ST_ACTIVE);
  drawButton(1, "BUSY",   nxtup::kBusy,   g_state == ST_BUSY);
  drawButton(2, "BREAK",  nxtup::kBreak,  g_state == ST_BREAK);
}

// ── Info panel per state ───────────────────────────────────────────

static void drawInfoActive() {
  gfx->fillRect(0, kInfoY, LCD_WIDTH, kInfoH, nxtup::kBg);

  drawCenteredText(kInfoY + 10, nxtup::kActive, 2, "EN FILA");

  char posBuf[8];
  snprintf(posBuf, sizeof(posBuf), "#%d", g_position);
  drawCenteredText(kInfoY + 50, nxtup::kFg, 12, posBuf);

  if (g_position == 1) {
    drawCenteredText(kInfoY + 200, nxtup::kMuted, 2, "Eres el siguiente");
  } else {
    char hint[40];
    snprintf(hint, sizeof(hint), "Posicion %d en la fila", g_position);
    drawCenteredText(kInfoY + 200, nxtup::kMuted, 2, hint);
  }
}

static void drawInfoBusy() {
  gfx->fillRect(0, kInfoY, LCD_WIDTH, kInfoH, nxtup::kBg);

  drawCenteredText(kInfoY + 10, nxtup::kBusy, 2, "EN SILLA");

  String name(g_clientName);
  name.toUpperCase();
  drawCenteredText(kInfoY + 60, nxtup::kFg, 9, name.c_str());

  drawCenteredText(kInfoY + 200, nxtup::kMuted, 2, "tap ACTIVE al terminar");
}

static void drawBreakCountdown() {
  uint32_t elapsedSec = (millis() - g_breakStartMs) / 1000;
  int remaining = (int)g_breakDurationSec - (int)elapsedSec;
  if (remaining < 0) remaining = 0;

  if (remaining == 0) {
    g_state = ST_ACTIVE;
    drawInfoActive();
    drawAllButtons();
    return;
  }

  int mm = remaining / 60;
  int ss = remaining % 60;
  char buf[10];
  snprintf(buf, sizeof(buf), "%02d:%02d", mm, ss);  // fixed width

  // With bounce-buffer mode active on the RGB panel, the LCD reads from
  // SRAM and we can write to PSRAM framebuffer without tearing. So:
  //  - setTextColor(fg, bg) → each glyph fills its own background
  //  - fixed-width "%02d:%02d" → every digit lands in the same pixel slot
  // No fillRect, no canvas needed.
  gfx->setTextColor(nxtup::kFg, nxtup::kBg);
  gfx->setTextSize(12);
  int charW = 6 * 12;
  int textW = (int)strlen(buf) * charW;
  gfx->setCursor((LCD_WIDTH - textW) / 2, kInfoY + 50);
  gfx->print(buf);
}

static void drawInfoBreak() {
  gfx->fillRect(0, kInfoY, LCD_WIDTH, kInfoH, nxtup::kBg);

  drawCenteredText(kInfoY + 10, nxtup::kBreak, 2, "EN BREAK");

  drawBreakCountdown();

  // The server is authoritative on which break this is (first or next);
  // we just display the duration that was snapshotted at break start.
  char sub[40];
  snprintf(sub, sizeof(sub), "%d min", g_breakDurationSec / 60);
  drawCenteredText(kInfoY + 200, nxtup::kMuted, 2, sub);
}

static void drawInfo() {
  switch (g_state) {
    case ST_ACTIVE: drawInfoActive(); break;
    case ST_BUSY:   drawInfoBusy();   break;
    case ST_BREAK:  drawInfoBreak();  break;
  }
}

static void renderAll() {
  gfx->fillScreen(nxtup::kBg);
  drawTitle();
  drawInfo();
  drawAllButtons();
}

// ── Touch routing ──────────────────────────────────────────────────

// Copy a String into a fixed buffer safely (always null-terminated).
static void copyToBuf(char *dst, size_t dstSize, const String &src) {
  size_t n = src.length() < dstSize ? src.length() : dstSize - 1;
  memcpy(dst, src.c_str(), n);
  dst[n] = '\0';
}

// Translate the server's status string into our local enum. Offline maps
// to ACTIVE for rendering purposes — buttons stay usable.
static BarberState statusToState(const String &s) {
  if (s == "busy")  return ST_BUSY;
  if (s == "break") return ST_BREAK;
  return ST_ACTIVE; // available, offline, anything else
}

// Pull the relevant client name out of the snapshot depending on state.
// When called/in_progress, the client name lives in different fields.
static void pickClientName(const nxtup::Snapshot &snap, BarberState state, char *out, size_t outSize) {
  if (state == ST_BUSY) {
    copyToBuf(out, outSize, snap.currentClient);
  } else if (state == ST_ACTIVE && snap.calledClient.length()) {
    copyToBuf(out, outSize, snap.calledClient);
  } else {
    out[0] = '\0';
  }
}

// Apply a server snapshot to local state. Returns true if anything that
// affects the rendered screen changed, so the caller can decide whether
// to redraw.
static bool applySnapshot(const nxtup::Snapshot &snap) {
  bool changed = false;

  BarberState newState = statusToState(snap.status);
  if (newState != g_state) {
    // Entering break: start the local countdown clock. The duration we
    // use is whatever the server snapshotted at the start of THIS break
    // (avoids races if the shop config changes mid-break).
    if (newState == ST_BREAK) {
      g_breakStartMs    = millis();
      g_lastCountdownMs = millis();
      g_breakDurationSec = (snap.breakMinutesAtStart > 0)
                             ? snap.breakMinutesAtStart * 60
                             : 60 * 60;
    }
    g_state = newState;
    changed = true;
  }

  if (snap.barberName.length() &&
      strncmp(g_barberNameBuf, snap.barberName.c_str(), sizeof(g_barberNameBuf)) != 0) {
    copyToBuf(g_barberNameBuf, sizeof(g_barberNameBuf), snap.barberName);
    changed = true;
  }

  if (snap.fifoPosition != g_position) {
    g_position = snap.fifoPosition;
    changed = true;
  }

  char nextClient[sizeof(g_clientNameBuf)];
  pickClientName(snap, g_state, nextClient, sizeof(nextClient));
  if (strncmp(g_clientNameBuf, nextClient, sizeof(g_clientNameBuf)) != 0) {
    memcpy(g_clientNameBuf, nextClient, sizeof(g_clientNameBuf));
    changed = true;
  }

  return changed;
}

static void onButtonTap(int idx) {
  // 0 = ACTIVE → "available"
  // 1 = BUSY   → "busy"
  // 2 = BREAK  → "break"
  const char *target = (idx == 0) ? "available" : (idx == 1) ? "busy" : "break";
  BarberState predicted = (idx == 0) ? ST_ACTIVE
                          : (idx == 1) ? ST_BUSY
                                       : ST_BREAK;

  // Local idempotent guard — saves a full network round trip if the
  // barber re-taps the button matching their current state.
  if (predicted == g_state) {
    Serial.println("[NXTUP] tap ignored — already in this state");
    return;
  }

  // ── Optimistic UI ───────────────────────────────────────────────
  // Update the screen RIGHT NOW with the predicted state instead of
  // waiting ~2-3s for the POST + re-fetch to complete. If the server
  // disagrees for any reason, the next 3s poll will reconcile.
  if (predicted == ST_BREAK) {
    g_breakStartMs    = millis();
    g_lastCountdownMs = millis();
    // g_breakDurationSec stays as last snapshotted from the server.
  } else {
    // Leaving busy / break / etc → no called client locally.
    g_clientNameBuf[0] = '\0';
  }
  g_state = predicted;
  drawInfo();
  drawAllButtons();

  Serial.printf("[NXTUP] tap → optimistic %s · POST follows\n", target);
  Serial.flush();

  // ── Server write + reconcile ────────────────────────────────────
  if (!nxtup::postState(target)) {
    Serial.println("[NXTUP] postState FAILED — forcing immediate poll");
    g_lastPollMs = 0;  // makes the loop poll on the very next tick
    return;
  }

  // Re-fetch immediately so we pick up server-side effects we couldn't
  // predict locally (auto-calling the next client when going active,
  // position restored from break, etc.).
  nxtup::Snapshot snap;
  if (nxtup::fetchSnapshot(snap)) {
    if (applySnapshot(snap)) {
      drawInfo();
      drawAllButtons();
    }
  }
}

static void handleTap(int rawX, int rawY) {
  // The GT911 panel reports Y flipped on this Waveshare board — a tap on
  // the bottom row (where the buttons are, y≈420) comes in as y≈60.
  // Mirror Y so the screen and touch share the same coordinate space.
  const int x = rawX;
  const int y = LCD_HEIGHT - 1 - rawY;

  Serial.printf("[NXTUP] handleTap (%d, %d)  raw(%d,%d)  buttonZone=[%d..%d]\n",
                x, y, rawX, rawY, kBtnY, kBtnY + kBtnH);

  // Only accept taps inside the bottom button band.
  if (y < kBtnY) {
    Serial.println("[NXTUP] tap outside button zone — ignored");
    return;
  }

  int idx;
  if (x < LCD_WIDTH / 3)            idx = 0;  // ACTIVE
  else if (x < 2 * LCD_WIDTH / 3)   idx = 1;  // BUSY
  else                               idx = 2;  // BREAK

  Serial.printf("[NXTUP] -> button idx=%d\n", idx);
  onButtonTap(idx);
}

// ── Setup / loop ───────────────────────────────────────────────────

static uint32_t g_lastHeartbeatMs = 0;

void setup() {
  Serial.begin(115200);
  // Big delay so USB-CDC has time to enumerate before we print anything.
  // Without this, early Serial output is lost and we can't tell if setup
  // actually starts.
  delay(2000);
  Serial.println("\n[NXTUP] firmware Phase C-lite (3 buttons) booting...");
  Serial.flush();

  // Canvas->begin() calls display->begin() internally — calling both
  // double-initializes the RGB panel and crashes the chip.
  Serial.println("[NXTUP] step 1: gfx->begin() (canvas)");
  Serial.flush();
  if (!gfx->begin()) {
    Serial.println("[NXTUP] FATAL: canvas init failed (PSRAM?)");
    Serial.flush();
    while (true) delay(1000);
  }
  Serial.println("[NXTUP] step 1: gfx + canvas ready");
  Serial.flush();

  Serial.println("[NXTUP] step 2: Wire.begin()");
  Serial.flush();
  Wire.begin(TOUCH_SDA_PIN, TOUCH_SCL_PIN);
  Serial.println("[NXTUP] step 2: Wire ready");
  Serial.flush();

  Serial.println("[NXTUP] step 3: tp.begin()");
  Serial.flush();
  tp.begin();
  tp.setRotation(ROTATION_NORMAL);
  Serial.println("[NXTUP] step 3: touch ready");
  Serial.flush();

  // ── Phase D.2: prove network connectivity to getnxtup.com ────
  // Best-effort. If WiFi or the snapshot fetch fails, we log the failure
  // to Serial and continue running the local-only Phase C state machine
  // so the device stays usable even without internet.
  Serial.println("[NXTUP] step 4: network");
  Serial.flush();
  if (nxtup::connectWiFi()) {
    nxtup::Snapshot snap;
    if (nxtup::fetchSnapshot(snap)) {
      Serial.printf(
        "[NXTUP] snapshot OK · barber=%s status=%s fifo=%d held=%d "
        "called=%s current=%s\n",
        snap.barberName.c_str(),
        snap.status.c_str(),
        snap.fifoPosition,
        snap.heldPosition,
        snap.calledClient.length() ? snap.calledClient.c_str() : "—",
        snap.currentClient.length() ? snap.currentClient.c_str() : "—");
      // Seed local state from the live server view BEFORE the first
      // renderAll() so the very first frame already shows reality.
      applySnapshot(snap);
      g_lastPollMs = millis();
    } else {
      Serial.println("[NXTUP] snapshot fetch FAILED (check token / barber_id)");
    }
  } else {
    Serial.println("[NXTUP] WiFi unavailable — running OFFLINE");
  }
  Serial.flush();

  Serial.println("[NXTUP] step 5: render");
  Serial.flush();
  renderAll();
  Serial.println("[NXTUP] running — tap any button");
  Serial.flush();
}

void loop() {
  tp.read();
  const uint32_t now = millis();

  // Heartbeat every 10s — keep-alive only, much quieter
  if (now - g_lastHeartbeatMs >= 10000) {
    g_lastHeartbeatMs = now;
    Serial.printf("[NXTUP] hb state=%d pos=%d\n", g_state, g_position);
  }

  if (tp.isTouched) {
    if (!g_wasTouched && (now - g_lastTapMs) >= kDebounceMs) {
      g_lastTapMs = now;
      handleTap(tp.points[0].x, tp.points[0].y);
    }
    g_wasTouched = true;
  } else {
    g_wasTouched = false;
  }

  if (g_state == ST_BREAK && (now - g_lastCountdownMs) >= 1000) {
    g_lastCountdownMs = now;
    drawBreakCountdown();
  }

  // Periodic snapshot poll — keeps the device in sync with any state
  // change made from the dashboard, simulator, TV, or another device.
  // Blocking call, brief LCD freeze acceptable for MVP.
  if (now - g_lastPollMs >= kPollIntervalMs) {
    g_lastPollMs = now;
    nxtup::Snapshot snap;
    if (nxtup::fetchSnapshot(snap)) {
      if (applySnapshot(snap)) {
        drawInfo();
        drawAllButtons();
      }
    }
  }

  delay(10);
}
