// ============================================================
// Waveshare ESP32-S3-Touch-LCD-4.3 — pin map
//
// Verify against the Waveshare wiki for your specific board revision:
//   https://www.waveshare.com/wiki/ESP32-S3-Touch-LCD-4.3
//
// If the display does not initialize after flashing, the most likely
// cause is a pin mismatch between this header and your physical board.
// ============================================================

#pragma once

// ── RGB LCD parallel interface ─────────────────────────────────────
#define LCD_DE_PIN     5
#define LCD_VSYNC_PIN  3
#define LCD_HSYNC_PIN  46
#define LCD_PCLK_PIN   7

// 5-bit red
#define LCD_R0_PIN     1
#define LCD_R1_PIN     2
#define LCD_R2_PIN     42
#define LCD_R3_PIN     41
#define LCD_R4_PIN     40

// 6-bit green
#define LCD_G0_PIN     39
#define LCD_G1_PIN     0
#define LCD_G2_PIN     45
#define LCD_G3_PIN     48
#define LCD_G4_PIN     47
#define LCD_G5_PIN     21

// 5-bit blue
#define LCD_B0_PIN     14
#define LCD_B1_PIN     38
#define LCD_B2_PIN     18
#define LCD_B3_PIN     17
#define LCD_B4_PIN     10

// Backlight (PWM-capable)
#define LCD_BL_PIN     -1   // backlight wired to logic always-on; PWM via expander on this board

// ── Capacitive touch (GT911 over I2C) ─────────────────────────────
#define TOUCH_SDA_PIN  8
#define TOUCH_SCL_PIN  9
#define TOUCH_INT_PIN  4
// Touch reset is wired to the CH422G IO expander on the Waveshare 4.3",
// not to a real GPIO. -1 makes the library print a benign warning but
// the GT911 still works because it auto-initializes from power-on.
// (Phase B confirmed this works.)
#define TOUCH_RST_PIN  -1

// ── Display geometry ──────────────────────────────────────────────
#define LCD_WIDTH      800
#define LCD_HEIGHT     480
