# GRQ Go — automated visual audit

The **never-ship-unshot** rule (global CLAUDE.md) in executable form: drives the app on a real
simulator, taps every tab, screenshots each. Runs headless over macbridge — no human clicking.

## Run it

```bash
# on the Mac (or via: macbridge run '<cmd>')
export PATH="/opt/homebrew/opt/openjdk/bin:$HOME/.maestro/bin:$PATH"   # ← both are REQUIRED
export MAESTRO_CLI_NO_ANALYTICS=1
maestro --device 2AE351D0-24F1-4DB5-985A-093AB1DC23C7 test .maestro/audit.yaml   # iPhone 17 Pro Max, iOS 26.5
maestro --device 64FAF948-D4F3-41D7-88C6-2DF081D8E47F test .maestro/audit.yaml   # iPad Pro 13" M5, iOS 26.5
```

Screenshots land in `/tmp/aud-*.png`; pull them with `macbridge pull`.

## Things that cost an evening to learn (2026-07-16)

- **Selectors are regex and must match the WHOLE string.** RN exposes tab labels ONLY as
  `accessibilityText`, in VoiceOver form — `"Portfolio, tab, 2 of 6"`. A bare `tapOn: "Portfolio"`
  matches nothing. Use `.*Portfolio, tab.*`. Dump what's really there with `maestro hierarchy`.
- **maestro needs a JVM** (`brew install openjdk`) and it's **keg-only** — `java` is NOT on any PATH
  until you add `/opt/homebrew/opt/openjdk/bin`. A non-login ssh shell has neither that nor
  `~/.maestro/bin`, so export both explicitly.
- **`brew install maestro` is the WRONG THING** — that cask is a 652MB GUI app of the same name. The
  CLI is `curl -fsSL "https://get.maestro.mobile.dev" | bash`.
- **The sim must already be signed in.** A fresh sim install stops at Google sign-in and this flow
  can't get past it: sim builds get no provisioning profile, so no `keychain-access-groups`, so
  GIDSignIn dies with `Code=-2 keychain error`. Sign in by hand ONCE per canonical sim (the two UDIDs
  above are pinned in the global CLAUDE.md for exactly this reason). A dev-login path in the app would
  remove this last manual step.
- **NEVER build the sim app with `CODE_SIGNING_ALLOWED=NO`** — it strips entitlements and produces
  precisely that keychain error, i.e. a fake bug that looks real. Let it ad-hoc sign.
- **iPad in landscape**: taps report COMPLETED but don't land (coords are computed against the native
  portrait frame). Force portrait or solve the rotation before trusting an iPad run.

## The side-by-side demo (for filming)

`./demo.sh` — drives BOTH devices through the same tour AT THE SAME TIME, for a two-device video:

    home screen → launch → Today → Portfolio → Personal → The Wire → Watchlist → More → finale
    iPhone finale: Learn (scrolls to it)   iPad finale: Options Desk

It resets both to the **home screen** (terminate, not erase), waits for you to arrange the windows,
then rolls both in parallel and ends on the finale screens **with the app open**.

⚠️ **Never `simctl erase` these two sims.** It wipes the Google session, and only Cameron can sign
back in (sim builds get no provisioning profile → no keychain-access-groups → GIDSignIn Code=-2).
"Reset" here always means terminate-to-home-screen.

Row labels in More are COMPOSITE — `", Options Desk, Stock-only vs stock+options — …, "` — so match
with `.*Options Desk.*`, never the bare string. On the PHONE, More stacks the sections so LEARNING is
below the fold and needs `scrollUntilVisible`; the iPad's landscape More shows all four columns at
once and needs no scroll. Match `.*Learn, How the market actually works.*`, not a bare `.*Learn.*` —
that also hits the "LEARNING  every number explainable" section header.
