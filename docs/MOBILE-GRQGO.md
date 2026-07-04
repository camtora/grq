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

## Status (2026-07-03, end of day one)

THE FULL APP SHIPPED IN A DAY: five tabs (Today · Portfolio w/ Alfred|Personal +
From-the-desk briefings · The Wire · Watchlist · More), the stock page (dossier
parity incl. no-dossier→Research→poll), search overlay, Ask Alfred (bull, SSE),
Cam↔Graham chat + sharing everywhere, notifications (feed + options + verified
push incl. sandbox), Settings (kill switch · risk dial · FX approvals · appearance
override), More (Smart Money · Browse · Reports · Second Opinions · Bull Race ·
Options Desk · Report Card · Chess Moves). Live hot-reload on both phones via
metro.grq.camerontora.ca.

## Backlog (noted 2026-07-03 EOD — Cam)

**Stock page — the missed pieces:**
1. ~~Options positioning panel~~ ✅ 2026-07-03 — (Tier 3, D88) — add an `options` block to
   `dossierResponse` (`getOptions`/`optionsLine` exist); US names only.
2. ~~Social sentiment panel~~ ✅ 2026-07-03 — (Tier 8, D89) — `social` block; keep the "on probation"
   honesty label.
3. ~~Related names~~ ✅ 2026-07-03 — `related` feed block + the panel (+ chart ranges, the value-chain cards, agent's note).
4. ~~The record~~ ✅ 2026-07-03 — the journal spine (3 collapsed rows, unfold, show-all).
5. ~~Scoreboard~~ ✅ 2026-07-03 — `scoreboard[]` already on the wire; render when non-empty.
6. Tappable [[glossary]] terms → inline explainers (the literacy pillar).
7. ~~Confidence levers~~ ✅ 2026-07-03 — ("what would change our mind", D93) — not on the wire yet.
8. ~~Personal positions~~ ✅ 2026-07-03 — + bought-at price on dossiers (the web got this in v2.46) —
   check/mirror on the mobile wire.
9. ~~Watch/who-is-watching on the stock page + search rows~~ ✅ 2026-07-03 (eye toggle
   + avatars; pin/block + chart range selector still open).

**Experiments — build out to match the site:**
10. ~~Second Opinions: per-day/per-call detail (web `race/[date]`), call browser~~ ✅ 2026-07-04 —
    overview rebuilt to web parity (ranked tiles w/ counts+book, how-it-works, race-day list) +
    `race-day/[date]` (standings strip, champion-vs-challenger session matrix; feed:
    `/api/race` grew counts/positions/days + new `/api/race/day/[date]`).
11. Bull Race: past races (the feed's `races[]`), per-bull trade history, richer
    holdings (avg cost, market value).
12. Options Desk: member desk controls + muteable nudge (D92), per-option decay
    sparkline, expiry/punchline cards; link the options education portal.
13. Report Card: the web's filters (source · verdict · ticker · latest-per-name),
    full-ledger paging.
14. Chess Moves: theme DETAIL (`/api/chess/[id]` — the parsed board + heat-ranked
    plays + levers), brief/research actions.
15. Short Lab · Day-Trading Lab · options portal — web-only; want mobile feeds +
    screens eventually.

**Platform:**
16. ~~Cache /api/today~~ ✅ 2026-07-03 (60s shared, 11s→12ms) — (~9s per load today; FMP quota).
17. Today date archive (the web's ?d= day-changer).
18. ~~Live quote polling~~ ✅ 2026-07-03 (stock hero 15s; Today re-pulls the cached feed 60s).
19. ~~The Hunt as a page (heat board)~~ ✅ 2026-07-04 (More ▸ The Hunt: heat-board rows w/
    rail/meter/rank, expand = sparkline+targets+full thesis+watch/share/dismiss, D38 brief
    bar + 🎯 banner, pending poll anchored on latestFindAt; helpers in `lib/hunt.ts`).
20. Ask Alfred: thread switcher (each other's threads) + symbol-aimed chat from
    stock pages.
21. ~~Agent container rebuild (push topics)~~ ✅ 2026-07-03 — v2.47 live.
22. ~~shared/contract.ts direct imports~~ ✅ 2026-07-03 (@shared alias; migrate types
    opportunistically). Still open: TestFlight/EAS-Update distribution; retire ios/ +
    GRQNext at parity.
