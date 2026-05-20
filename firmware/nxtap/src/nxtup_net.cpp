// ============================================================
// nxtup_net.cpp — implementation
//
// As of migration 017, the device talks DIRECTLY to Supabase via
// REST RPCs instead of bouncing through Vercel. This cut tap→TV
// latency from ~15s (Vercel cold start + double round trip) down
// to ~300-600ms. The Vercel endpoints still exist for the web app;
// only the firmware's hot path moved.
//
// Endpoints used now:
//   POST https://<SUPABASE_HOST>/rest/v1/rpc/device_update_barber_state
//   POST https://<SUPABASE_HOST>/rest/v1/rpc/device_get_barber_snapshot
//
// Both authenticate with:
//   apikey: <SUPABASE_ANON_KEY>
//   Authorization: Bearer <SUPABASE_ANON_KEY>
// and a per-request `p_device_token` body field that the Postgres
// function compares against app_settings.device_api_token.
// ============================================================

#include "nxtup_net.h"

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

#include "secrets.h"

namespace {

const char* rpcUrl(const char* fn) {
  // Allocated once per call site as a String, then exposed as
  // c_str. The host comes from secrets.h.
  static String s;
  s = String("https://") + SUPABASE_HOST + "/rest/v1/rpc/" + fn;
  return s.c_str();
}

// Apply the common Supabase REST headers to a started HTTPClient.
// Both anon key headers are required: `apikey` for the gateway,
// `Authorization: Bearer` for PostgREST itself.
void addSupabaseHeaders(HTTPClient& http) {
  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", SUPABASE_ANON_KEY);
  http.addHeader("Authorization", String("Bearer ") + SUPABASE_ANON_KEY);
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

// ── Shared JSON → Snapshot parser ────────────────────────────────
//
// Both fetchSnapshot() (idle poll) and postState() (after a tap)
// receive the same JSON shape — the state RPC returns the fresh
// snapshot in its response so we only need ONE roundtrip per tap.
//
// Returns true if the document was well-formed and Snapshot was
// populated.
static bool parseSnapshot(const String& payload, Snapshot& out) {
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

bool fetchSnapshot(Snapshot& out) {
  if (!connectWiFi()) return false;

  WiFiClientSecure client;
  // MVP: skip CA validation. Supabase uses Let's Encrypt; production
  // can embed the ISRG root and switch to setCACert().
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, rpcUrl("device_get_barber_snapshot"))) {
    Serial.println("[net] http.begin failed (snapshot)");
    return false;
  }
  addSupabaseHeaders(http);
  http.setTimeout(3000);

  // PostgREST RPC takes named arguments in the JSON body.
  String body = String("{\"p_barber_id\":\"") + BARBER_ID +
                "\",\"p_device_token\":\"" + DEVICE_API_TOKEN + "\"}";

  const int code = http.POST(body);
  if (code != 200) {
    Serial.printf("[net] snapshot RPC HTTP %d · %s\n",
                  code, http.errorToString(code).c_str());
    if (code > 0) Serial.println(http.getString());
    http.end();
    return false;
  }

  String payload = http.getString();
  http.end();
  return parseSnapshot(payload, out);
}

bool postState(const char* newStatus) {
  return postStateAndSnapshot(newStatus, nullptr);
}

bool postStateAndSnapshot(const char* newStatus, Snapshot* outSnap) {
  if (!connectWiFi()) return false;

  WiFiClientSecure client;
  client.setInsecure();

  HTTPClient http;
  if (!http.begin(client, rpcUrl("device_update_barber_state"))) {
    Serial.println("[net] http.begin failed (state)");
    return false;
  }
  addSupabaseHeaders(http);
  http.setTimeout(3000);

  // Same JSON-body RPC convention as the snapshot fn. The state RPC
  // returns the fresh snapshot in its response, so when the caller
  // passes an outSnap we get to skip a second round trip entirely.
  String body = String("{\"p_barber_id\":\"") + BARBER_ID +
                "\",\"p_target\":\"" + newStatus +
                "\",\"p_device_token\":\"" + DEVICE_API_TOKEN + "\"}";

  const int code = http.POST(body);
  Serial.printf("[net] state RPC %s → HTTP %d\n", newStatus, code);

  if (code != 200) {
    if (code > 0) Serial.println(http.getString());
    http.end();
    return false;
  }

  if (outSnap != nullptr) {
    String payload = http.getString();
    http.end();
    return parseSnapshot(payload, *outSnap);
  }

  http.end();
  return true;
}

}  // namespace nxtup
