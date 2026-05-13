// ============================================================
// NXTUP brand color tokens — RGB565 encoded
//
// Mirror of the @theme tokens in src/app/globals.css. Keep in sync
// when web tokens change.
// ============================================================

#pragma once

#include <cstdint>

namespace nxtup {

// Helper: pack 8-bit RGB into RGB565
constexpr uint16_t rgb565(uint8_t r, uint8_t g, uint8_t b) {
  return ((r & 0xF8) << 8) | ((g & 0xFC) << 3) | (b >> 3);
}

// Surfaces
constexpr uint16_t kBg     = rgb565(0x00, 0x00, 0x00);  // pure black
constexpr uint16_t kFg     = rgb565(0xFF, 0xFF, 0xFF);  // white
constexpr uint16_t kMuted  = rgb565(0x71, 0x71, 0x7A);  // zinc-500
constexpr uint16_t kDim    = rgb565(0x3F, 0x3F, 0x46);  // zinc-700
constexpr uint16_t kLine   = rgb565(0x18, 0x18, 0x1B);  // zinc-900

// Brand
constexpr uint16_t kBlue   = rgb565(0x1E, 0x3A, 0xFF);  // brand blue
constexpr uint16_t kRed    = rgb565(0xEF, 0x24, 0x24);  // brand red

// Status (LED-style queue states) — text/accent
constexpr uint16_t kActive = rgb565(0x22, 0xC5, 0x5E);  // green
constexpr uint16_t kBusy   = rgb565(0xEF, 0x44, 0x44);  // red
constexpr uint16_t kBreak  = rgb565(0xEA, 0xB3, 0x08);  // yellow

// Status — full-screen background variants (darker, easier on the eyes)
constexpr uint16_t kActiveBg = rgb565(0x05, 0x30, 0x18);  // dark green
constexpr uint16_t kBusyBg   = rgb565(0x3A, 0x0C, 0x0C);  // dark red
constexpr uint16_t kBreakBg  = rgb565(0x3A, 0x2C, 0x05);  // dark amber

}  // namespace nxtup
