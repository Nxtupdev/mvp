// ============================================================
// NXTUP — NXT TAP firmware
// Phase G.1 — LVGL bootstrap test
//
// This is a temporary minimal main() that ONLY exercises the LVGL
// integration:
//   * boots display + touch
//   * initializes LVGL
//   * shows a label + a single button
//   * counts taps and updates the label
//
// Network task, state machine, snapshot polling, etc. are all parked
// for now and come back in Phase G.2 once we've confirmed LVGL renders
// correctly on the actual hardware. The previous Phase D firmware
// lives in git history (one commit back).
// ============================================================

#include <Arduino.h>
#include <Arduino_GFX_Library.h>
#include <Wire.h>
#include <TAMC_GT911.h>
#include <lvgl.h>

#include "board_pins.h"
#include "nxtup_colors.h"
#include "nxtup_lvgl.h"

// ── RGB LCD panel ────────────────────────────────────────────────────
constexpr int kBounceBufPx = 10 * LCD_WIDTH;

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

static Arduino_RGB_Display *gfx = new Arduino_RGB_Display(
    LCD_WIDTH, LCD_HEIGHT, bus, /* rotation */ 0, /* auto_flush */ true);

static TAMC_GT911 tp(TOUCH_SDA_PIN, TOUCH_SCL_PIN,
                     TOUCH_INT_PIN, TOUCH_RST_PIN,
                     LCD_WIDTH, LCD_HEIGHT);

// ── LVGL test UI state ──────────────────────────────────────────────
static lv_obj_t *s_counterLabel = nullptr;
static int s_tapCount = 0;

static void onTestButtonClicked(lv_event_t * /*e*/) {
  s_tapCount++;
  Serial.printf("[lvgl] test button tapped, count=%d\n", s_tapCount);
  if (s_counterLabel) {
    lv_label_set_text_fmt(s_counterLabel, "Tapped %d", s_tapCount);
  }
}

static void buildTestScreen() {
  lv_obj_t *scr = lv_screen_active();

  // Background: deep black, matches our brand.
  lv_obj_set_style_bg_color(scr, lv_color_hex(0x000000), 0);
  lv_obj_set_style_bg_opa(scr, LV_OPA_COVER, 0);

  // Title centered up top.
  lv_obj_t *title = lv_label_create(scr);
  lv_label_set_text(title, "NXTUP");
  lv_obj_set_style_text_color(title, lv_color_hex(0xFFFFFF), 0);
  lv_obj_set_style_text_font(title, &lv_font_montserrat_48, 0);
  lv_obj_align(title, LV_ALIGN_TOP_MID, 0, 40);

  // Subtitle.
  lv_obj_t *sub = lv_label_create(scr);
  lv_label_set_text(sub, "LVGL bootstrap test · Phase G.1");
  lv_obj_set_style_text_color(sub, lv_color_hex(0x71717A), 0);
  lv_obj_set_style_text_font(sub, &lv_font_montserrat_18, 0);
  lv_obj_align(sub, LV_ALIGN_TOP_MID, 0, 110);

  // Counter label centered.
  s_counterLabel = lv_label_create(scr);
  lv_label_set_text(s_counterLabel, "Tap the button below");
  lv_obj_set_style_text_color(s_counterLabel, lv_color_hex(0xFFFFFF), 0);
  lv_obj_set_style_text_font(s_counterLabel, &lv_font_montserrat_28, 0);
  lv_obj_align(s_counterLabel, LV_ALIGN_CENTER, 0, -10);

  // Big test button.
  lv_obj_t *btn = lv_button_create(scr);
  lv_obj_set_size(btn, 320, 100);
  lv_obj_align(btn, LV_ALIGN_BOTTOM_MID, 0, -50);
  lv_obj_set_style_bg_color(btn, lv_color_hex(0x22C55E), 0); // brand green
  lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, 0);
  lv_obj_set_style_radius(btn, 12, 0);
  lv_obj_add_event_cb(btn, onTestButtonClicked, LV_EVENT_CLICKED, nullptr);

  lv_obj_t *btnLabel = lv_label_create(btn);
  lv_label_set_text(btnLabel, "TAP ME");
  lv_obj_set_style_text_color(btnLabel, lv_color_hex(0x000000), 0);
  lv_obj_set_style_text_font(btnLabel, &lv_font_montserrat_28, 0);
  lv_obj_center(btnLabel);
}

// ── Setup / loop ────────────────────────────────────────────────────

void setup() {
  Serial.begin(115200);
  delay(2000);
  Serial.println("\n[NXTUP] Phase G.1 — LVGL bootstrap test booting...");
  Serial.flush();

  Serial.println("[NXTUP] step 1: gfx->begin()");
  Serial.flush();
  if (!gfx->begin()) {
    Serial.println("[NXTUP] FATAL: gfx init failed (PSRAM?)");
    while (true) delay(1000);
  }
  Serial.println("[NXTUP] step 1: gfx ready");
  Serial.flush();

  // Clear to black so we don't see boot garbage before LVGL takes over.
  gfx->fillScreen(nxtup::kBg);

  Serial.println("[NXTUP] step 2: Wire.begin()");
  Serial.flush();
  Wire.begin(TOUCH_SDA_PIN, TOUCH_SCL_PIN);

  Serial.println("[NXTUP] step 3: tp.begin()");
  Serial.flush();
  tp.begin();
  tp.setRotation(ROTATION_NORMAL);

  Serial.println("[NXTUP] step 4: lvglInit()");
  Serial.flush();
  nxtup::lvglInit(gfx, &tp);

  Serial.println("[NXTUP] step 5: buildTestScreen()");
  Serial.flush();
  buildTestScreen();

  Serial.println("[NXTUP] running — tap the green TAP ME button");
  Serial.flush();
}

void loop() {
  nxtup::lvglPump();
  delay(5);
}
