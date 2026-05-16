// ============================================================
// nxtup_lvgl.h — LVGL bootstrap for the NXT TAP device
//
// Wires LVGL 9.x to:
//   * Arduino_GFX (Arduino_RGB_Display) as the display driver
//   * TAMC_GT911 as the input device (with the X+Y mirror our panel
//     needs)
//
// Lives separately from main.cpp so the LVGL ↔ Arduino glue is isolated
// from the app logic / state machine.
// ============================================================

#pragma once

#include <Arduino_GFX_Library.h>
#include <TAMC_GT911.h>

namespace nxtup {

/**
 * Call once after gfx->begin() and tp.begin() have succeeded.
 * Internally: lv_init, allocates the partial render buffer in PSRAM,
 * creates the display + input device, and wires the flush / read cbs.
 *
 * After this returns, you can create screens / widgets and call
 * lv_timer_handler() from your main loop.
 */
void lvglInit(Arduino_RGB_Display *gfx, TAMC_GT911 *tp);

/**
 * Call once per main loop iteration. Drives LVGL's tick and runs its
 * scheduled tasks (animations, redraws, input polling).
 */
void lvglPump();

}  // namespace nxtup
