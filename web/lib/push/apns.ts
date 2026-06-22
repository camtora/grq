import jwt from "jsonwebtoken";
import { readFileSync } from "node:fs";

// APNs (Apple Push Notification service) sender — token-based auth (a .p8 key),
// raw HTTP/2, no third-party dependency. Mirrors the Discord chokepoint in
// web/agent/alerts.ts: configured-or-no-op, failures are caught and never take
// the caller down. Used by lib/push/notify.ts.
//
// Setup (the Apple-portal half is humans-only — docs/PUSH-NOTIFICATIONS.md):
//   APNS_KEY_ID    the 10-char Key ID of the APNs Auth Key (.p8)
//   APNS_TEAM_ID   the Apple Developer Team ID (defaults to the GRQ team)
//   APNS_BUNDLE_ID the app bundle id == the apns-topic (defaults to ca.camerontora.grq)
//   APNS_KEY_B64   the .p8 contents, base64-encoded (env_file-safe: no newlines/$)
//     …or APNS_KEY_PATH (a path to the .p8 file) …or APNS_KEY (raw PEM, \n-escaped)
//
// A device token carries the env that minted it ("production" = TestFlight/store,
// "sandbox" = an Xcode debug build); they use different gateways, so we send each
// token to its own host. The provider JWT + key are shared across both.

const DEFAULT_TEAM_ID = "3WR9SN94Q4";
const DEFAULT_BUNDLE_ID = "ca.camerontora.grq";

const HOSTS: Record<string, string> = {
  production: "https://api.push.apple.com",
  sandbox: "https://api.sandbox.push.apple.com",
};

export type ApnsEnv = "production" | "sandbox";

export type ApnsPayload = {
  title: string;
  body: string;
  /** Logical grouping for the OS (collapses/threads on the lock screen). */
  threadId?: string;
  /** Extra keys delivered alongside `aps` (e.g. a deep-link symbol). */
  data?: Record<string, string | number | boolean | null>;
};

export type ApnsResult = {
  token: string;
  ok: boolean;
  status: number;
  /** APNs `reason` on failure — "BadDeviceToken", "Unregistered", … */
  reason?: string;
  /** The gateway that actually delivered (200). Differs from the device's recorded
   *  env when we self-healed a mismatch — the caller persists the correction. */
  deliveredEnv?: ApnsEnv;
};

function keyId(): string | null {
  return process.env.APNS_KEY_ID?.trim() || null;
}

function teamId(): string {
  return process.env.APNS_TEAM_ID?.trim() || DEFAULT_TEAM_ID;
}

function bundleId(): string {
  return process.env.APNS_BUNDLE_ID?.trim() || DEFAULT_BUNDLE_ID;
}

/** The .p8 private key as PEM, from whichever env form is set. */
function signingKey(): string | null {
  if (process.env.APNS_KEY_B64) {
    try {
      return Buffer.from(process.env.APNS_KEY_B64, "base64").toString("utf8");
    } catch {
      return null;
    }
  }
  if (process.env.APNS_KEY_PATH) {
    try {
      return readFileSync(process.env.APNS_KEY_PATH, "utf8");
    } catch (e) {
      console.error("apns: APNS_KEY_PATH unreadable", e);
      return null;
    }
  }
  if (process.env.APNS_KEY) {
    // Allow a single-line env with literal \n escapes.
    return process.env.APNS_KEY.replace(/\\n/g, "\n");
  }
  return null;
}

/** True when every piece needed to send is present. Callers no-op otherwise. */
export function apnsConfigured(): boolean {
  return !!(keyId() && signingKey());
}

// Provider JWT cache. Apple wants it refreshed at most every 20 min and at least
// every 60; we mint a fresh one every ~50 min.
let cachedToken: { jwt: string; mintedAtMs: number } | null = null;
const TOKEN_TTL_MS = 50 * 60 * 1000;

function providerToken(): string | null {
  const kid = keyId();
  const key = signingKey();
  if (!kid || !key) return null;
  const now = Date.now();
  if (cachedToken && now - cachedToken.mintedAtMs < TOKEN_TTL_MS) return cachedToken.jwt;
  try {
    const token = jwt.sign({}, key, {
      algorithm: "ES256",
      keyid: kid,
      issuer: teamId(),
      // `iat` is added automatically; APNs rejects a token older than 1h.
    });
    cachedToken = { jwt: token, mintedAtMs: now };
    return token;
  } catch (e) {
    console.error("apns: failed to sign provider token (check the .p8 key)", e);
    return null;
  }
}

function apsBody(payload: ApnsPayload): string {
  const aps: Record<string, unknown> = {
    alert: { title: payload.title, body: payload.body },
    sound: "default",
  };
  if (payload.threadId) aps["thread-id"] = payload.threadId;
  return JSON.stringify({ aps, ...(payload.data ?? {}) });
}

/** Send one payload to many device tokens. Each token is tried on the gateway its
 *  recorded env names; if APNs says the env is wrong ("BadEnvironmentKeyInToken" — a
 *  dev-signed Release build reports "production" but is really sandbox), we retry the
 *  other gateway and report which one delivered so the caller can self-heal the record.
 *  Returns a per-token result so the caller can also prune dead tokens (410 / BadDeviceToken). */
export async function sendApns(
  devices: { token: string; apnsEnv: string }[],
  payload: ApnsPayload,
): Promise<ApnsResult[]> {
  if (!apnsConfigured() || devices.length === 0) return [];
  const token = providerToken();
  if (!token) return [];

  const http2 = await import("node:http2");
  const topic = bundleId();
  const body = apsBody(payload);

  // One reused TLS/HTTP2 session per gateway (HTTP/2 multiplexes concurrent streams).
  const sessions = new Map<string, import("node:http2").ClientHttp2Session>();
  const sessionFor = (host: string) => {
    let s = sessions.get(host);
    if (!s || s.closed || s.destroyed) {
      s = http2.connect(host);
      s.on("error", () => {}); // swallow — per-request handling below
      sessions.set(host, s);
    }
    return s;
  };

  const postOne = (host: string, deviceToken: string): Promise<{ status: number; reason?: string }> =>
    new Promise((resolve) => {
      const req = sessionFor(host).request({
        ":method": "POST",
        ":path": `/3/device/${deviceToken}`,
        "apns-topic": topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        authorization: `bearer ${token}`,
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
      req.setTimeout(8000, () => req.close());
      let status = 0;
      let data = "";
      req.on("response", (headers) => {
        status = Number(headers[":status"]) || 0;
      });
      req.on("data", (chunk) => {
        data += chunk;
      });
      req.on("end", () => {
        let reason: string | undefined;
        if (status !== 200 && data) {
          try {
            reason = JSON.parse(data).reason;
          } catch {
            /* keep raw status */
          }
        }
        resolve({ status, reason });
      });
      req.on("error", () => resolve({ status: 0, reason: "RequestError" }));
      req.end(body);
    });

  const envOf = (e: string): ApnsEnv => (e === "sandbox" ? "sandbox" : "production");

  const results = await Promise.all(
    devices.map(async (d): Promise<ApnsResult> => {
      const primary = envOf(d.apnsEnv);
      const other: ApnsEnv = primary === "sandbox" ? "production" : "sandbox";
      let r = await postOne(HOSTS[primary], d.token);
      let deliveredEnv: ApnsEnv | undefined = r.status === 200 ? primary : undefined;
      if (r.status === 403 && r.reason === "BadEnvironmentKeyInToken") {
        const r2 = await postOne(HOSTS[other], d.token);
        if (r2.status === 200) {
          r = r2;
          deliveredEnv = other;
        } else {
          r = r2;
        }
      }
      return { token: d.token, ok: r.status === 200, status: r.status, reason: r.reason, deliveredEnv };
    }),
  );

  for (const s of sessions.values()) {
    try {
      s.close();
    } catch {
      /* ignore */
    }
  }
  return results;
}
