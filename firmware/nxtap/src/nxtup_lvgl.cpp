// ============================================================
// nxtup_lvgl.cpp — implementation
// ============================================================

#include "nxtup_lvgl.h"
#include "board_pins.h"

#include <Arduino.h>
#include <lvgl.h>
#include <esp_heap_caps.h>

namespace {

// We hold the device handles statically so the LVGL callbacks (which
// take no userdata in our simple case) can reach them.
Arduino_RGB_Display *s_gfx = nullptr;
TAMC_GT911 *s_tp = nullptr;

// Partial render buffer in PSRAM. 1/10th of the screen — LVGL renders
// one stripe at a time and we blit each stripe into the framebuffer via
// gfx->draw16bitRGBBitmap.
constexpr int kStripeRows = 48;
constexpr size_t kStripePx = LCD_WIDTH * kStripeRows;
constexpr size_t kStripeBytes = kStripePx * sizeof(uint16_t);

uint8_t *s_buf1 = nullptr;

// Track elapsed time for lv_tick_inc.
uint32_t s_lastTickMs = 0;

// ── LVGL callbacks ──────────────────────────────────────────────────

// Display flush: LVGL has rendered `area` into `px_map`. Copy it into
// the actual framebuffer, then tell LVGL we're done so it can reuse the
// buffer for the next stripe.
void flushCb(lv_display_t *disp, const lv_area_t *area, uint8_t *px_map) {
  if (!s_gfx) {
    lv_display_flush_ready(disp);
    return;
  }
  const uint32_t w = area->x2 - area->x1 + 1;
  const uint32_t h = area->y2 - area->y1 + 1;
  s_gfx->draw16bitRGBBitmap(area->x1, area->y1,
                            reinterpret_cast<uint16_t *>(px_map), w, h);
  lv_display_flush_ready(disp);
}

// Pointer input: TAMC_GT911 reports raw coords with both axes mirrored
// vs our panel orientation. Apply the same correction as handleTap()
// in main.cpp so taps land on the right LVGL widget.
void inputReadCb(lv_indev_t * /*indev*/, lv_indev_data_t *data) {
  if (!s_tp) {
    data->state = LV_INDEV_STATE_RELEASED;
    return;
  }
  s_tp->read();
  if (s_tp->isTouched) {
    const int rawX = s_tp->points[0].x;
    const int rawY = s_tp->points[0].y;
    data->point.x = LCD_WIDTH - 1 - rawX;
    data->point.y = LCD_HEIGHT - 1 - rawY;
    data->state = LV_INDEV_STATE_PRESSED;
  } else {
    data->state = LV_INDEV_STATE_RELEASED;
  }
}

}  // namespace

namespace nxtup {

void lvglInit(Arduino_RGB_Display *gfx, TAMC_GT911 *tp) {
  s_gfx = gfx;
  s_tp = tp;

  Serial.println("[lvgl] lv_init...");
  Serial.flush();
  lv_init();

  // Allocate the partial render buffer in PSRAM. 48 rows × 800 cols ×
  // 2 bytes = ~77 KB. Fits comfortably in our 8 MB PSRAM.
  s_buf1 = static_cast<uint8_t *>(
    heap_caps_malloc(kStripeBytes, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (!s_buf1) {
    Serial.println("[lvgl] FATAL: failed to allocate render buffer");
    return;
  }
  Serial.printf("[lvgl] render buffer %u bytes in PSRAM\n",
                (unsigned)kStripeBytes);

  // Create the display and wire its buffers + flush callback.
  lv_display_t *disp = lv_display_create(LCD_WIDTH, LCD_HEIGHT);
  lv_display_set_color_format(disp, LV_COLOR_FORMAT_RGB565);
  lv_display_set_buffers(disp, s_buf1, nullptr, kStripeBytes,
                         LV_DISPLAY_RENDER_MODE_PARTIAL);
  lv_display_set_flush_cb(disp, flushCb);

  // Pointer (capacitive touch) input device.
  lv_indev_t *indev = lv_indev_create();
  lv_indev_set_type(indev, LV_INDEV_TYPE_POINTER);
  lv_indev_set_read_cb(indev, inputReadCb);

  s_lastTickMs = millis();
  Serial.println("[lvgl] ready");
  Serial.flush();
}

void lvglPump() {
  const uint32_t now = millis();
  uint32_t elapsed = now - s_lastTickMs;
  if (elapsed > 0) {
    lv_tick_inc(elapsed);
    s_lastTickMs = now;
  }
  lv_timer_handler();
}

}  // namespace nxtup
