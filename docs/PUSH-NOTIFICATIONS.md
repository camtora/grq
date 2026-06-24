# Push Notifications (iOS / APNs) — D53

The same events that fan out to Discord (`web/agent/alerts.ts`) now also fan out to
each member's iOS devices via APNs, gated by per-user preferences. This is the
operational guide: the architecture, the categories, the Apple-portal steps (the only
part a human must do), config, deploy, and verification.

**Status (2026-06-23): LIVE.** The Apple-portal steps are done and the `APNS_*` env is
set in `.env` + both containers — `apnsConfigured()` is true and APNs delivers to
registered devices. Cam's device is registered (sandbox/Xcode build); a member only
no-ops if they have no `DeviceToken` row yet (e.g. Graham hasn't opened the app). The
config/runbook below is kept for reference (key rotation, a fresh device, redeploy).

---

## How it works

```
event (a fill, a dossier, a kill-switch flip, …)
   │
   ├─ alert()  / notifyOut()           web/agent/alerts.ts   (the one chokepoint)
   │      ├─ Discord webhook            (unchanged)
   │      └─ pushNotify({category,…})   web/lib/push/notify.ts
   │             ├─ resolve recipients  ← DeviceToken × NotificationPreference
   │             │     • trades + risk  → always (non-toggleable)
   │             │     • critical severity → always (system outages)
   │             │     • else → the member's per-category toggle (default ON)
   │             │     • skip the actor (don't ping who did the thing)
   │             └─ sendApns()          web/lib/push/apns.ts  (HTTP/2 + .p8 token)
   │                    └─ prune dead tokens (410 / BadDeviceToken / Unregistered)
```

- **No new dependency.** `apns.ts` uses Node's built-in `http2` + `jsonwebtoken`
  (ES256, already a dep) for the provider token; the token is cached ~50 min.
- **Runs in both containers.** `web` (the member-action routes) and `agent` (the
  runner/sessions) both call `alert()`, so both need the `APNS_*` env. They share the
  root `.env` via `env_file`, so one place covers both.
- **Tokens carry their env.** Each device token is `sandbox` or `production`; the
  server sends it to the matching gateway (`api.sandbox.push.apple.com` vs
  `api.push.apple.com`). The single `.p8` Auth Key works for BOTH — token auth is not
  environment-specific (unlike the old certificate model). One key, both gateways.

### Sandbox vs production (the gotcha that cost us a test)

The APNs environment is set by the **signing/provisioning profile**, NOT the build
configuration. So:

| How it's signed | aps-environment | Token env |
|---|---|---|
| Run from Xcode (dev profile), **any** build config incl. Release | development | **sandbox** |
| TestFlight / Ad-Hoc (distribution profile) | production | **production** |
| App Store | production (no embedded profile) | **production** |

A locally-installed **Release** build is therefore **sandbox**, even though it's "release."
Two defenses keep this from silently dropping pushes:
1. **iOS** reads the real `aps-environment` from the embedded `embedded.mobileprovision`
   (`PushManager.apnsEnv`) instead of `#if DEBUG`, so it registers the correct env.
2. **Server self-heals.** If a token bounces with `403 BadEnvironmentKeyInToken`,
   `sendApns` retries the other gateway and `notify.ts` persists the corrected env. So
   even a mis-recorded token gets delivered (and fixed) on the first real push.

## Clearing the lock-screen pile from the web bell (D64)

Triage on the desktop, and the phone follows: opening the web notification bell clears
the iPhone's *delivered* notifications + zeroes the app badge.

```
member opens the web bell
   │
   └─ POST /api/notifications/read       web/app/api/notifications/read/route.ts
          ├─ markNotificationsRead()      (web feed → read)
          └─ pushClear(email)             web/lib/push/notify.ts
                 └─ sendApns({ silent:true, badge:0, data:{ clear:"all" } })
                        apns-push-type: background · apns-priority: 5
                        aps: { "content-available": 1, badge: 0 }
                              │
                              ▼  (iOS wakes the app in the background)
            AppDelegate.didReceiveRemoteNotification(clear) → PushManager.clearDelivered()
                              → removeAllDeliveredNotifications() + setBadgeCount(0)
```

- **Clear-all semantics** — opening the bell wipes the whole delivered pile; no
  per-notification id mapping. (Per-id precision is deferred.)
- **Best-effort, by Apple's design.** Silent/background pushes are throttled and are
  **not delivered to a force-quit app**. Reliable when the app is backgrounded-but-alive;
  otherwise the **foreground reconcile** is the catch-up net: on app activation
  (`GRQApp` scenePhase → `PushManager.reconcileOnForeground()`), if the server reports
  `unread == 0` the app clears its delivered notifications locally. A *failed* unread
  fetch returns `nil` → no clear (so a transient error never wipes the lock screen).
- **iOS needs `UIBackgroundModes: [remote-notification]`** (`ios/GRQ/Info.plist`) — added
  for D64. `aps-environment` already covers it; no entitlement change.

## Categories (Cam, 2026-06-22 — "default opt in for all categories")

**Always-on — non-toggleable:**
- **Trades** (`trades`) — every order fill: buys, sells, protective stops, take-profits.
- **Risk & safety** (`risk`) — kill switch, drawdown halt, daily-loss pause.
- **Critical outages** — *any* `critical`-severity alert (agent crash, drawdown kill
  switch) pushes regardless of toggles.

**Toggleable — default ON, per-user:**

| Key | Label | Fires on |
|---|---|---|
| `dossiers` | Research dossiers | a requested dossier is ready / failed; weekly refresh queued |
| `hunt` | The Hunt & ideas | discovery/directed hunt posted; smart-money scan |
| `agentMoves` | Agent universe moves | the agent self-tracks / self-promotes a name; startup review |
| `reports` | Daily reports | midday brief, EOD, weekly review, self-scheduled check-in |
| `members` | Member activity | the *other* member's universe/directive actions |
| `system` | System health | restarts, data-feed/broker hiccups, triage notes (non-critical) |

The catalog lives in `web/lib/push/categories.ts` (web UI) and mirrored in
`ios/GRQ/Models/Models.swift` `NotificationPreferences.catalog`.

**Later (not built):** `priceTargets` — set a target, get pinged when hit. The schema
column + a contract field exist as placeholders; no event is wired to it yet.

---

## One-time Apple setup (humans-only — I can't do these)

1. **Create an APNs Auth Key (.p8).** developer.apple.com → Certificates, IDs &
   Profiles → **Keys** → **+** → check **Apple Push Notifications service (APNs)** →
   Continue → Register → **Download** the `AuthKey_XXXXXXXXXX.p8` (download ONCE; keep
   it safe). Note the **Key ID** (the `XXXXXXXXXX`) and the **Team ID** (`3WR9SN94Q4`).
2. **Enable Push on the App ID.** Identifiers → `ca.camerontora.grq` → tick **Push
   Notifications** → Save. (Regenerates the provisioning profile / automatic signing
   handles it.)
3. **Add the capability in Xcode.** Open `ios/GRQ.xcodeproj` → target **GRQ** →
   **Signing & Capabilities** → **+ Capability** → **Push Notifications**. This
   reconciles `GRQ/GRQ.entitlements` (already created, `aps-environment`) with the App
   ID and adds the file to the project navigator. The `CODE_SIGN_ENTITLEMENTS` build
   setting is already wired in `project.pbxproj`.

## Server config (`.env`, then rebuild)

**Done (2026-06-23) — kept for reference / key rotation.** The block is set in `.env`
(env_file rule: **no quotes**):

```bash
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=3WR9SN94Q4
APNS_BUNDLE_ID=ca.camerontora.grq
APNS_KEY_B64=<base64 of the .p8>      # base64 -w0 AuthKey_XXXXXXXXXX.p8
```

`APNS_KEY_B64` is preferred (env_file-safe — no newlines, no `$`). Alternatives the
sender also accepts: `APNS_KEY_PATH` (a mounted .p8 file) or `APNS_KEY` (raw PEM with
`\n` escapes). Then rebuild both services so they pick up the env + new code:

```bash
cd /home/camerontora/grq
docker-compose build web && docker-compose up -d web && docker image prune -f
docker-compose build agent && docker-compose up -d agent && docker image prune -f
# (chat doesn't send push — no rebuild needed unless its source changed)
```

Watch `/var` between builds (the agent image is ~3.5 GB — see CLAUDE.md disk notes).

## Verify

1. **Configured?** `apnsConfigured()` gates everything — with the env unset, push is a
   no-op (check logs for nothing pushed; Discord still fires).
2. **Device registers.** Run the app on a real device (the simulator can't get an APNs
   token), sign in → accept the prompt → a row should appear:
   `docker exec -it grq-db psql -U grq grq -c 'select email, platform, "apnsEnv", left(token,12) from "DeviceToken";'`
3. **End-to-end.** Trigger a `trades`/`risk` event (e.g. flip the kill switch from the
   *other* member's session, or wait for a fill). A banner should land. A `410`/
   `BadDeviceToken` auto-prunes the row.
4. **Toggles.** Settings → Notifications (web *and* iOS) → flip a category off → confirm
   that category's events stop while trades/risk keep arriving.

## Files

| Path | What |
|---|---|
| `web/prisma/schema.prisma` | `DeviceToken`, `NotificationPreference` models |
| `web/lib/push/apns.ts` | APNs HTTP/2 sender (token auth, JWT cache, prune signal) |
| `web/lib/push/notify.ts` | `pushNotify()` — recipient resolution + gating + fan-out |
| `web/lib/push/categories.ts` | the catalog (always-on vs toggleable) + defaults |
| `web/agent/alerts.ts` | `alert()` / `notifyOut()` now call `pushNotify` |
| `web/app/api/notifications/register/route.ts` | POST/DELETE device token |
| `web/app/api/notifications/preferences/route.ts` | GET/PUT per-user toggles |
| `web/components/NotificationSettings.tsx` | web Settings toggles |
| `web/middleware.ts` | `/api/notifications` admitted to the mobile API surface |
| `shared/contract.ts` | `NotificationPreferences` wire shape |
| `ios/GRQ/GRQ.entitlements` | `aps-environment` |
| `ios/GRQ/Services/Services.swift` | `AppDelegate`, `PushManager`, APIClient push methods |
| `ios/GRQ/App/GRQApp.swift` | `@UIApplicationDelegateAdaptor`, register-after-auth, tap deep-link |
| `ios/GRQ/Views/Settings.swift` | `NotificationSettingsView` + the More-tab link |
| `ios/GRQ/Models/Models.swift` | `NotificationPreferences` + catalog |
