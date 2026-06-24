# Plan — Clear the iPhone lockscreen by opening the web notification drawer

**Status:** Web shipped + deployed · iOS code written (awaiting Cam's TestFlight build) · **Drafted:** 2026-06-23
**Decision:** D64 · **Depends on:** D63 (web notification center) · **Touches:** `web/` + `ios/`

> Phases 1 (web) + 2 (iOS code) are done. Remaining: Cam archives → TestFlight → installs, then Phase 3 verify.

---

## 1. Context — why

D63 shipped the web notification center (the header bell), which persists every pushable event to a
`Notification` row so the web feed mirrors what goes to the phone. But the **two surfaces are
independent**: notifications **pile up on the iPhone lockscreen**, and reading them in the web bell
does nothing to the phone. Cam triages on the desktop, then has a graveyard of stale dossier / trade
/ report pings on his phone.

**Goal:** opening the web notification drawer should **clear the iPhone's delivered notifications**
(and zero the app badge), so the lockscreen reflects what's already been seen.

This is the **web → phone clear** direction. The infrastructure exists on **neither** side yet:
- `web/lib/push/apns.ts` only sends `apns-push-type: alert` (no silent/background path).
- The iOS app has no background/silent-push handler, and `UIBackgroundModes` is not enabled.

## 2. The honest reliability ceiling (Apple's limit, not ours)

The only server-initiated way to remove an **already-delivered** iOS notification is a **silent
(background) push** that wakes the app to call `removeAllDeliveredNotifications()`. iOS treats silent
pushes as **best-effort**:
- **Throttled** (roughly a few per hour for a backgrounded app).
- **Not delivered at all if the app was force-quit** (swiped out of the app switcher).

So the realistic behavior:

| App state | Result of opening the web bell |
|---|---|
| Backgrounded but alive | Lockscreen clears within a few seconds ✅ |
| Foreground | Clears immediately ✅ |
| Force-quit / Low Power Mode | May **not** clear until next app open ⚠️ — the foreground-reconcile net (Phase 2) catches it |

We accept this. It cannot be made a hard guarantee from the server — it's an OS design limit.

**Semantics chosen: clear-all.** Opening the bell clears the *entire* delivered pile. This needs **no
per-notification id mapping**, keeping both sides simple. Precise "clear only the ones I read" is
**deferred** (§8).

## 3. The flow

```
  Web bell opened
        │
        ▼
  POST /api/notifications/read   ── marks Notification rows read (existing)
        │
        ▼
  pushClear(email)               ── NEW: silent push to that member's devices
        │  apns-push-type: background, apns-priority: 5
        │  body: { aps: { "content-available": 1, badge: 0 }, clear: "all" }
        ▼
  iPhone wakes in background
        │
        ▼
  AppDelegate.didReceiveRemoteNotification(clear:"all")
        │
        ▼
  removeAllDeliveredNotifications() + setBadgeCount(0)   ── lockscreen clears

  Reliability net: on app foreground → ask server for unread; if 0, clear delivered locally.
```

## 4. Current state (what's already there)

- **`web/lib/push/apns.ts`** — `ApnsPayload` (~L30), `apsBody()` (~L117, always builds `alert`+`sound`),
  request headers (~L160: `apns-push-type: alert`, `apns-priority: 10`). Has the reusable
  provider-token (ES256 JWT), per-gateway http2 session, env-retry, and dead-token-prune machinery.
- **`web/lib/push/notify.ts`** — `pushNotify()` (the fan-out, D63) + `sendApns` import. Pattern to
  mirror for `pushClear`.
- **`web/app/api/notifications/read/route.ts`** — `POST` marks read via `markNotificationsRead()`.
  The web bell (`web/components/NotificationBell.tsx`) already calls this on open — **no UI change needed.**
- **iOS `ios/GRQ/Services/Services.swift`** — `PushManager` (registers `.alert/.badge/.sound`),
  `AppDelegate` (~L569: foreground-present + tap-routing only; **no** background handler).
- **iOS `ios/GRQ/App/GRQApp.swift`** — `RootView` has an existing `.onChange(of: scenePhase)` (~L76)
  firing on return-to-active — the natural hook for foreground reconcile.
- **iOS `ios/GRQ/Info.plist`** — no `UIBackgroundModes`. **`ios/GRQ/GRQ.entitlements`** — has
  `aps-environment` (sufficient; background delivery rides the existing Push capability).

---

## 5. Phase 1 — Server / web  *(agent: implement + deploy + verify)*

### 5.1 `web/lib/push/apns.ts` — add a silent-push capability
Reuse the existing sender; just branch on a `silent` flag.
- Extend `ApnsPayload` (~L30): `silent?: boolean`, `badge?: number`.
- `apsBody()` (~L117): when `silent` →
  `{ aps: { "content-available": 1, ...(badge != null ? { badge } : {}) }, ...data }`
  with **no** `alert`/`sound`. Otherwise unchanged.
- Headers (~L160): `apns-push-type` = `silent ? "background" : "alert"`;
  `apns-priority` = `silent ? "5" : "10"`.

### 5.2 `web/lib/push/notify.ts` — `pushClear`
```ts
/** Tell a member's devices to clear their delivered notifications + zero the badge.
 *  Silent (background) push — best-effort, no preference gating (housekeeping). */
export async function pushClear(email: string): Promise<void> {
  if (!apnsConfigured()) return;
  const devices = await prisma.deviceToken.findMany({ where: { email: email.toLowerCase() } });
  if (devices.length === 0) return;
  const results = await sendApns(
    devices.map((d) => ({ token: d.token, apnsEnv: d.apnsEnv })),
    { silent: true, badge: 0, title: "", body: "", data: { clear: "all" } },
  );
  // prune dead tokens, same as pushNotify
}
```

### 5.3 `web/app/api/notifications/read/route.ts` — fire it on read
After `markNotificationsRead(session.email, ids)`, call `pushClear(session.email)` best-effort
(don't block/await the response on it; `.catch(() => {})`).

### 5.4 Verify (server-side, before any iOS work)
- `tsc --noEmit` clean.
- Deploy web (build → up -d → image prune -f → re-check `df -h /var`).
- As a member, `POST /api/notifications/read` and confirm the web logs show APNs returning **200**
  for the silent push (proves the background payload + headers are accepted by Apple). The *visible*
  clear needs Phase 2.

---

## 6. Phase 2 — iOS  *(agent: write the code · **Cam: build + ship** — no Xcode on the Linux host)*

### 6.1 `ios/GRQ/Info.plist` — enable background delivery
Add before the closing `</dict>`:
```xml
<key>UIBackgroundModes</key>
<array><string>remote-notification</string></array>
```
No entitlement change (`aps-environment` already present).

### 6.2 `ios/GRQ/Services/Services.swift` — `AppDelegate` silent-push handler
```swift
func application(_ application: UIApplication,
                 didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                 fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
    if userInfo["clear"] != nil {
        Task { @MainActor in
            UNUserNotificationCenter.current().removeAllDeliveredNotifications()
            try? await UNUserNotificationCenter.current().setBadgeCount(0)
        }
    }
    completionHandler(.noData)
}
```

### 6.3 `ios/GRQ/Services/Services.swift` — foreground reconcile (the catch-up net)
- `PushManager.reconcileOnForeground() async`: GET the feed; if `unread == 0`, run
  `removeAllDeliveredNotifications()` + `setBadgeCount(0)`.
- `APIClient.notificationsUnread() async -> Int`: `GET /api/notifications` → read `.unread`
  (mirror the existing `registerDeviceToken` / messages GETs).

### 6.4 `ios/GRQ/App/GRQApp.swift` — wire the net to scene activation
In `RootView`'s existing `.onChange(of: scenePhase)` (~L76): on `new == .active`, also
`Task { await push.reconcileOnForeground() }`.

---

## 7. Phase 3 — End-to-end verification *(after Cam's TestFlight build)*

1. Generate a few pushes (open a couple of stock pages to queue dossiers, or wait for agent events)
   → confirm banners land on the iPhone lockscreen.
2. App **backgrounded** → open the web bell on desktop → lockscreen pile clears within seconds, app
   badge zeroes. ✅
3. **Force-quit** the app, repeat → expect it *not* to clear immediately (documented limit); then
   open the app → foreground reconcile clears the pile. ✅

## 8. Docs to update on ship
- `docs/PUSH-NOTIFICATIONS.md` — the silent-clear flow, the `clear` payload, `UIBackgroundModes`, the
  best-effort caveat.
- `docs/DECISIONS.md` — **D64**: web-bell-open clears the iPhone lockscreen via a silent push;
  clear-all semantics; foreground-reconcile net; Apple best-effort caveat.

## 9. Division of labor
- **Agent (end-to-end):** all of Phase 1 (web code + deploy + APNs-accept verify), the iOS *code*
  edits in Phase 2, and the doc updates.
- **Cam (manual, on a Mac):** Xcode archive → upload → TestFlight → install on both phones (this host
  has no Xcode — the app can't be compiled/shipped here). Then run Phase 3 together.

## 10. Deferred / future (explicitly out of scope for v1)
- **Per-notification precision** (clear only the ones actually read) — needs `Notification.id` stamped
  into each APNs payload + id-keyed `removeDeliveredNotifications(withIdentifiers:)`. Clear-all suffices.
- **Live badge counts on every alert push** (icon number tracks the pile in real time) — cheap later:
  one unread-count query per fan-out, set `aps.badge` on the alert send.
- **`apns-collapse-id` grouping** — coalesces repeat pings of the same event; orthogonal nicety.

## 11. Locked decisions
- Clear-all semantics (not per-id) for v1.
- Trigger = the existing `POST /api/notifications/read` (bell open) — no new endpoint, no UI change.
- Reliability is best-effort by Apple's design; foreground reconcile is the accepted mitigation.
