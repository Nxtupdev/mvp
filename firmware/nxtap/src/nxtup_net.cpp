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

// ── Persistent TLS connection ────────────────────────────────────
//
// The previous version created a fresh WiFiClientSecure + HTTPClient
// per call. Each one paid a full TLS handshake (RSA cert verification
// on the ESP32-S3 ≈ 800-1500 ms) — that handshake alone was most of
// our tap→TV latency.
//
// Now we keep ONE client + http alive at file scope and set
// http.setReuse(true). After the first call warms the TLS session,
// subsequent RPCs reuse the same TCP+TLS connection and finish in
// ~150-300 ms. The idle snapshot poll in main.cpp keeps it warm
// during slow shop hours.
//
// If Supabase or a NAT in the middle drops the TCP at some point,
// http.POST() returns a negative code and the caller retries. The
// next http.begin() will transparently reopen the connection (paying
// the handshake again for that one call only).
static WiFiClientSecure g_client;
static HTTPClient       g_http;
static bool             g_netReady = false;

void ensureNetReady() {
  if (g_netReady) return;
  // MVP: skip CA validation. Supabase uses Let's Encrypt; production
  // can embed the ISRG root and switch to setCACert().
  g_client.setInsecure();
  // Disable Nagle so the ESP32 sends our small request packets
  // immediately instead of waiting ~200 ms hoping to coalesce. For
  // request/response on a single short body, Nagle is pure latency.
  g_client.setNoDelay(true);
  // Keep the TCP+TLS session alive between requests to the same host
  // (both our RPCs hit the same Supabase project).
  g_http.setReuse(true);
  g_netReady = true;
}

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
  // Explicit keep-alive — most gateways default to this for HTTP/1.1
  // but Kong (in front of Supabase) occasionally needs the prompt.
  http.addHeader("Connection", "keep-alive");
}

// ── POST helper with retry-on-stale-connection ───────────────────
//
// setReuse(true) keeps the TLS session alive between requests, which
// is great when it works — sub-300ms RPCs. But Kong (in front of
// Supabase) and home-router NATs occasionally close idle keep-alive
// sockets. When that happens, the next POST returns a negative code
// (mbedTLS -80 = SSL_CONN_EOF, or HTTPClient -1 = CONNECTION_REFUSED)
// and we'd otherwise spend ~6-10s of failed retries before recovering.
//
// This helper detects the stale-socket case and forces a fresh TCP
// handshake on attempt #2 by calling g_client.stop(). The slow path
// (one bad cache day) pays the TLS handshake once; the fast path
// (every other call) stays on the cached session.
//
// Returns the final HTTP status code (200 on success). The response
// body is written to *outPayload if non-null and the code was 200.
static int postRpc(const char* tag, const char* url, const String& body,
                   String* outPayload) {
  for (int attempt = 0; attempt < 2; attempt++) {
    if (!g_http.begin(g_client, url)) {
      Serial.printf("[net] %s http.begin failed (attempt %d)\n", tag, attempt + 1);
      return -1;
    }
    addSupabaseHeaders(g_http);
    g_http.setTimeout(3000);

    const uint32_t t0 = millis();
    const int code = g_http.POST(body);
    const uint32_t elapsed = millis() - t0;

    if (code == 200) {
      Serial.printf("[net] %s → HTTP 200 (%lu ms%s)\n", tag,
                    (unsigned long)elapsed, attempt ? ", reconnected" : "");
      if (outPayload) *outPayload = g_http.getString();
      g_http.end();
      return 200;
    }

    if (code > 0) {
      // Server-side error (4xx/5xx). Retrying won't fix it.
      Serial.printf("[net] %s → HTTP %d (%lu ms): %s\n", tag, code,
                    (unsigned long)elapsed, g_http.getString().c_str());
      g_http.end();
      return code;
    }

    // Network-level failure. The cached TLS session is likely stale.
    // Tear it down so the next attempt re-handshakes from scratch.
    Serial.printf("[net] %s POST failed code=%d (%lu ms, attempt %d) — forcing reconnect\n",
                  tag, code, (unsigned long)elapsed, attempt + 1);
    g_http.end();
    g_client.stop();
  }
  return -1;
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
  ensureNetReady();

  String body = String("{\"p_barber_id\":\"") + BARBER_ID +
                "\",\"p_device_token\":\"" + DEVICE_API_TOKEN + "\"}";

  String payload;
  if (postRpc("snapshot", rpcUrl("device_get_barber_snapshot"), body, &payload) != 200) {
    return false;
  }
  return parseSnapshot(payload, out);
}

bool postState(const char* newStatus) {
  return postStateAndSnapshot(newStatus, nullptr);
}

bool postStateAndSnapshot(const char* newStatus, Snapshot* outSnap) {
  if (!connectWiFi()) return false;
  ensureNetReady();

  // Same JSON-body RPC convention as the snapshot fn. The state RPC
  // returns the fresh snapshot in its response, so when the caller
  // passes an outSnap we get to skip a second round trip entirely.
  String body = String("{\"p_barber_id\":\"") + BARBER_ID +
                "\",\"p_target\":\"" + newStatus +
                "\",\"p_device_token\":\"" + DEVICE_API_TOKEN + "\"}";

  String tag = String("state ") + newStatus;
  String payload;
  String* outPtr = (outSnap != nullptr) ? &payload : nullptr;
  if (postRpc(tag.c_str(), rpcUrl("device_update_barber_state"), body, outPtr) != 200) {
    return false;
  }
  if (outSnap != nullptr) {
    return parseSnapshot(payload, *outSnap);
  }
  return true;
}

}  // namespace nxtup
