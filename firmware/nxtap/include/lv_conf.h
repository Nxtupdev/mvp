/**
 * lv_conf.h — focused LVGL 9.x config for the NXTUP NXT TAP device.
 *
 * 800x480 RGB565 panel on ESP32-S3 with octal PSRAM. We manage tick +
 * task scheduling manually from loop() so the FreeRTOS network task on
 * core 0 keeps its own timing.
 *
 * Flags not listed here fall back to LVGL's defaults in
 * lv_conf_internal.h.
 */

#ifndef LV_CONF_H
#define LV_CONF_H

#include <stdint.h>

// ── Color & memory ──────────────────────────────────────────────────
#define LV_COLOR_DEPTH 16
#define LV_COLOR_16_SWAP 0

#define LV_USE_STDLIB_MALLOC  LV_STDLIB_BUILTIN
#define LV_USE_STDLIB_STRING  LV_STDLIB_BUILTIN
#define LV_USE_STDLIB_SPRINTF LV_STDLIB_BUILTIN
#define LV_MEM_SIZE           (64U * 1024U)

// ── Refresh / OS ────────────────────────────────────────────────────
#define LV_DEF_REFR_PERIOD 16
#define LV_DPI_DEF         130
#define LV_USE_OS          LV_OS_NONE

// ── Logging / asserts (off for prod) ────────────────────────────────
#define LV_USE_LOG 0
#define LV_USE_ASSERT_NULL              1
#define LV_USE_ASSERT_MALLOC            1
#define LV_USE_ASSERT_STYLE             0
#define LV_USE_ASSERT_MEM_INTEGRITY     0
#define LV_USE_ASSERT_OBJ               0
#define LV_USE_PERF_MONITOR             0
#define LV_USE_MEM_MONITOR              0

// ── Fonts ────────────────────────────────────────────────────────────
#define LV_FONT_MONTSERRAT_14 1
#define LV_FONT_MONTSERRAT_18 1
#define LV_FONT_MONTSERRAT_28 1
#define LV_FONT_MONTSERRAT_48 1
#define LV_FONT_DEFAULT       &lv_font_montserrat_18

// ── Widgets ─────────────────────────────────────────────────────────
#define LV_USE_LABEL    1
#define LV_USE_BUTTON   1
#define LV_USE_IMAGE    1
#define LV_USE_ARC      1
#define LV_USE_BAR      1
#define LV_USE_SPINNER  1

// ── Layouts ─────────────────────────────────────────────────────────
#define LV_USE_FLEX 1
#define LV_USE_GRID 1

// ── Theme ────────────────────────────────────────────────────────────
#define LV_USE_THEME_DEFAULT          1
#define LV_THEME_DEFAULT_DARK         1
#define LV_THEME_DEFAULT_GROW         1
#define LV_THEME_DEFAULT_TRANSITION_TIME 80

// ── Demos / examples (off) ──────────────────────────────────────────
#define LV_USE_DEMO_WIDGETS   0
#define LV_USE_DEMO_BENCHMARK 0
#define LV_USE_DEMO_STRESS    0
#define LV_USE_DEMO_MUSIC     0

#endif // LV_CONF_H
