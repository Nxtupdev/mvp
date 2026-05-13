// ============================================================
// nxtup_net.cpp — implementation
// ============================================================

#include "nxtup_net.h"

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "secrets.h"

namespace {

const char* baseUrl() {
  static String s = String("https://") + NXTUP_HOST;
  return s.c_str();
}

}  // namespace

namespace nxtup {

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  Serial.printf("[net] WiFi connecting → %s ", WIFI_SSID);
  Serial.flush();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > 15000) {
      Serial.println(" TIMEOUT");
      return false;
    }
    Serial.print(".");
    Serial.flush();
    delay(250);
  }
  Serial.printf(" OK · IP=%s · RSSI=%d dBm\n",
                WiFi.localIP().toString().c_str(),
                WiFi.RSSI());
  return true;
}

bool fetchSnapshot(Snapshot& out) {
  if (!connectWiFi()) return false;

  WiFiClientSecure client;
  // MVP: skip CA validation. Production should embed Let's Encrypt
  // ISRG Root X1 + add WiFiClientSecure::setCACert(...) for proper TLS.
  client.setInsecure();

  HTTPClient http;
  String url = String(baseUrl()) + "/api/barbers/" + BARBER_ID + "/snapshot";
  if (!http.begin(client, url)) {
    Serial.println("[net] http.begin failed (snapshot)");
    return false;
  }
  // Vercel redirects apex↔www at the domain level (HTTP 307). Without
  // FOLLOW_REDIRECTS the HTTPClient stops at the first hop and returns
  // 307 + "Redirecting..." HTML instead of our JSON.
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.addHeader("x-device-token", DEVICE_API_TOKEN);
  http.setTimeout(8000);

  const int code = http.GET();
  if (code != 200) {
    Serial.printf("[net] snapshot GET HTTP %d · %s\n",
                  code, http.errorToString(code).c_str());
    if (code > 0) Serial.println(http.getString());
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();

  // ArduinoJson v7 — heap-allocated, auto-sized.
  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, payload);
  if (err) {
    Serial.printf("[net] JSON parse error: %s\n", err.c_str());
    return false;
  }

  out.barberName              = String((const char*)(doc["barber"]["name"]                        | ""));
  out.status                  = String((const char*)(doc["barber"]["status"]                      | ""));
  out.fifoPosition            = doc["fifo_position"]                                              | -1;
  out.heldPosition            = doc["held_position"]                                              | -1;
  out.calledClient            = String((const char*)(doc["called_client"]["name"]                 | ""));
  out.currentClient           = String((const char*)(doc["current_client"]["name"]                | ""));
  out.breakStartedAt          = String((const char*)(doc["barber"]["break_started_at"]            | ""));
  out.breakMinutesAtStart     = doc["barber"]["break_minutes_at_start"]                           | -1;
  out.firstBreakMinutes       = doc["shop"]["first_break_minutes"]                                | 60;
  out.nextBreakMinutes        = doc["shop"]["next_break_minutes"]                                 | 30;
  out.keepPositionOnBreak     = doc["shop"]["keep_position_on_break"]                             | false;
  out.breakPositionGraceMinutes = doc["shop"]["break_position_grace_minutes"]                     | 5;
  return true;
}

bool postState(const char* newStatus) {
  if (!connectWiFi()) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  String url = String(baseUrl()) + "/api/barbers/" + BARBER_ID + "/state";
  if (!http.begin(client, url)) {
    Serial.println("[net] http.begin failed (state)");
    return false;
  }
  http.setFollowRedirects(HTTPC_FORCE_FOLLOW_REDIRECTS);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-device-token", DEVICE_API_TOKEN);
  http.setTimeout(8000);

  String body = String("{\"status\":\"") + newStatus + "\"}";
  const int code = http.sendRequest("PATCH", (uint8_t*)body.c_str(), body.length());

  Serial.printf("[net] state PATCH %s → HTTP %d\n", newStatus, code);
  if (code >= 400) {
    Serial.println(http.getString());
  }
  http.end();
  return code >= 200 && code < 300;
}

}  // namespace nxtup
