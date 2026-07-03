# GRQ Go — the Expo mobile app (`mobile/`)

The third iteration of the GRQ companion app. The first two (`ios/GRQ`, `ios/GRQNext`)
were native SwiftUI; GRQ Go is **Expo / React Native** — the same stack as the SBCA app —
so frontend changes hot-reload live in dev instead of needing an Xcode rebuild per change.

- **Project name:** `GRQGo` (`mobile/ios/GRQGo.xcodeproj`) · **display name:** "GRQ" ·
  **bundle:** `com.camerontora.grqgo`
- **What carried over from the native app:** only the splash — the falling-💵 money rain,
  tap-to-continue, cross-fade to the welcome greeting, then into Today
  (`components/Splash.tsx` + `components/MoneyRain.tsx`, ported from
  `ios/GRQ/Views/Splash.swift`).
- **Backend:** unchanged — the same mobile API the native app used
  (`POST /api/auth/google` → GRQ-JWT Bearer, `/api/portfolio`, `/api/today`,
  `/api/dossier/[symbol]`, …; wire shapes in `shared/contract.ts`). `services/api.ts`
  is the client; base URL from `EXPO_PUBLIC_API_URL` in `mobile/.env`.
- **Stack:** Expo SDK 55 · React Native 0.83 · expo-router (file routes in `mobile/app/`)
  · reanimated 4 · TypeScript strict. Versions deliberately match `sbca/app` so the
  Mac pod pipeline behaves identically.

## Dev pipeline (Ubuntu edits → Mac builds, same split as SBCA)

The Linux box cannot compile iOS. Source lives here; the Mac holds a build copy at
`~/Developer/Projects/personal/grqgo-build/` fed by rsync.

**On the Mac — sync + build (one-time setup at the top of the script):**

```bash
grqgo-sync        # = scripts/grqgo-mac-sync.sh — rsyncs source, npm ci, pod install when needed
open ~/Developer/Projects/personal/grqgo-build/ios/GRQGo.xcworkspace
# Build & run (⌘R) on a simulator — Debug config loads JS from Metro
```

**On Ubuntu — Metro (the live-reload dev server):**

```bash
~/grq/scripts/grq-metro.sh    # expo start on port 8082
# optional: alias grq-metro='~/grq/scripts/grq-metro.sh' in ~/.bashrc
```

**Metro is a permanent Docker service** (`grq-metro`, port 8082 — `sbca-metro` owns
8081) with `mobile/` bind-mounted, so it's always on and edits hot-reload without
touching the container. Rebuild it only when `mobile/package.json` changes:
`docker-compose build metro && docker-compose up -d metro`.

**Connecting devices — the domain (primary, 2026-07-03):** Debug builds load JS from
`https://metro.grq.camerontora.ca` (nginx `31-grq-metro.conf` → :8082, WebSocket
hot reload) via the `bundleURL()` patch in `mobile/ios/GRQGo/AppDelegate.swift` —
the sbca pattern. **Both phones and the simulator hot-reload from anywhere**; a
phone needs ONE Debug install via Xcode (cable), then never again until a native
change. ⚠️ `expo prebuild` regenerates AppDelegate — re-apply the patch after.

**Fallback — SSH tunnel** (works without DNS/cert/nginx):

```bash
ssh -N -L 8081:localhost:8082 camerontora@192.168.2.34 &                # from the LAN
ssh -N -L 8081:localhost:8082 -p 2222 camerontora@camerontora.ca &     # from anywhere else
```

(then revert the AppDelegate patch so Debug looks at localhost:8081 as stock).

**After adding a native package** (`npx expo install <pkg>` here): re-run `grqgo-sync`
on the Mac — the package-hash check triggers `npm ci` + `pod install` automatically.
Pure-JS packages need no resync for the dev loop (Metro serves them from Ubuntu).

**After changing `app.json` plugins/config:** re-run `npx expo prebuild --platform ios
--no-install` here (regenerates `mobile/ios/`), then `grqgo-sync` on the Mac.
⚠️ Prebuild regenerates `AppDelegate.swift` — if the metro-domain patch (below) has been
applied, re-apply it after prebuild.

## Later option: a Metro domain instead of the tunnel

SBCA runs `metro.sba.camerontora.ca` → nginx → Metro, with the debug `bundleURL()` in
`AppDelegate.swift` hard-pointed at the domain (see `sbca/app/ios/SBCA/AppDelegate.swift`).
The GRQ equivalent needs infra work (all in `~/infrastructure`, per its CLAUDE.md
"Adding a New Service" checklist): a `metro.grq.camerontora.ca` DNS record, certbot
expansion of the shared cert, a conf.d file proxying to host port 8082, and the
AppDelegate patch. The tunnel makes this optional — do it if the tunnel gets annoying
or when a physical device (which can't see the Mac's localhost) needs the dev loop.

## Status (2026-07-03)

All five pages SHIPPED: Today (the newspaper) · Portfolio (Alfred | Personal, CA/US books)
· The Wire (full-screen paged feed, five card kinds) · Watchlist (D78 parity + add-ticker)
· Search (jump-to-stock index) — plus the stock page (`/stock/[symbol]`, hidden tab screen,
web section order incl. RatingBar/mascots, no-dossier → Research → poll flow). Google auth,
member-keyed themes, markdown rendering, universal stock linking: all live.

## Backlog — next up (teed 2026-07-03)

**Stock page gaps (each needs a small dossier-feed addition unless noted):**
1. **Options positioning panel** (Tier 3, D88) — `getOptions`/`optionsLine` exist server-side;
   add an `options` block to `dossierResponse` + a panel (US names only, CA dark).
2. **Social sentiment panel** (Tier 8, D89) — `getSocial`/`socialLine`; same pattern, mark
   "on probation" honestly like the web.
3. **Related names** (D-KG Slice 1) — the web computes on-the-fly in the page; needs a
   `related` block in the feed.
4. **Journal / the record** — `record[]` is ALREADY on the wire (typed journal history);
   render as a collapsible section. No backend change.
5. **Scoreboard** — `scoreboard[]` already on the wire; render when non-empty.
6. **Tappable [[glossary]] terms** — MdText tints them; wire to the shared glossary for
   inline explainers (the literacy pillar).

**Functional gaps (bigger):** notifications center + push registration (bundle-id/APNs
decision needed — grqgo ≠ the native app's bundle), Ask Alfred chat (SSE), a home for
kill switch/risk dial/FX/share (avatar sheet or settings screen), live quote polling,
Today's date archive, shared/contract.ts imports via metro watchFolders, TestFlight
device build, native `ios/` retirement at parity.
