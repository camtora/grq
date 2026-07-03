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

**Connecting the simulator to Ubuntu's Metro — SSH tunnel (no infra changes):**

```bash
# On the Mac; leaves Mac-localhost:8081 pointing at Ubuntu's Metro on 8082
ssh -N -L 8081:localhost:8082 camerontora@192.168.2.34 &
```

A Debug build looks for Metro at `localhost:8081` by default, so with the tunnel up it
just works — and Xcode's "Start Packager" phase sees 8081 occupied and skips launching
a local one. Edit any `.tsx` here and the simulator refreshes in ~a second.

Port **8082** because `sbca-metro` permanently holds 8081 on this box.

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

## What's deliberately NOT here yet (scaffold phase)

- Google Sign-In wiring (`@react-native-google-signin` is installed so its pod is already
  baked; `configure()` + the iOS URL-scheme plugin entry come with the auth phase).
- Push registration (`expo-notifications` installed + plugin configured; the backend
  `DeviceToken`/APNs plumbing is D53 and unchanged).
- Real content — all four tabs (Today · Portfolio · The Wire · More) are themed
  placeholders. The splash greeting says "Welcome back." until auth lands.
- EAS builds; the Wire tab's feed; `shared/contract.ts` type imports.
