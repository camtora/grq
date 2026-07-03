# GRQ Go — Mobile Design System

The visual contract for the Expo app (`mobile/`). Sibling of `docs/DESIGN.md` (the web
contract) — same soul (teal, honest, lightly funny), adapted to a phone. Read this before
adding or restyling any screen. **Consistency is the product requirement**: every screen
should look like it came from the same hand.

## 1. Theming — member-keyed, not device-keyed

Two palettes in `constants/theme.ts`, ported from the native `Theme.swift` / web tokens.
**The signed-in member picks the theme: Cam = light, Graham = dark** (`me.theme` from
`/api/auth/me`). The device scheme is only the fallback before sign-in. `usePalette()`
resolves this — never call `useColorScheme()` directly in a screen.

**The colour rule (same as web, non-negotiable):** every colour comes from the palette
object `p` (or `brandAccent`). No raw hex in components, no gray/white/black literals.
Meaning is consistent: **teal** = brand/neutral, **emerald (`p.pos`)** = gains/live,
**red (`p.neg`)** = losses/halt, **amber** = caution/obscurity (use `#f59e0b`-family via
a palette addition if needed — don't inline it).

## 2. Typography

Two families, loaded in the root layout (`@expo-google-fonts/*`):

| Role | Font | Token (`F.` in theme.ts) |
|---|---|---|
| Display — masthead, page titles, big numbers | **Space Grotesk** 600/700 | `F.display`, `F.displayMed` |
| UI/body — everything else | **Inter** 400/500/600/700/800 | `F.reg` `F.med` `F.semi` `F.bold` `F.black` |

RN rule: custom fonts ignore `fontWeight` — always set the exact `fontFamily` token.
Numbers that align in columns (money, %) add `fontVariant: ['tabular-nums']` (Inter).

Scale: page title 17 (in the header bar) · section title 15 · body 14 · secondary 12 ·
caption 11 · micro 10. Money/hero numbers go bigger (20–28, display family).

## 3. The chrome — every screen, no exceptions

Every tab screen renders inside `<Screen title="...">` (`components/Chrome.tsx`):

- **Top bar**: the **bull bubble** top-left (34, circular, accent ring + glow — the
  web's floating launcher moved up here) → the member's **Ask Alfred** thread
  (`/chat`); the **page title centered** (Space Grotesk 700, 17); top-right the
  **notifications bell**, the **chat icon** (unread red dot; → `/messages`, the
  Cam↔Graham thread), then the **signed-in member's avatar** (28, circular, accent
  ring) → identity sheet (signed in as… / sign out).
- Body: `ScrollView` with pull-to-refresh (`RefreshControl` tinted `p.accent`) unless
  the screen is a list that scrolls itself.
- Background `p.bodyBg` everywhere; content padding 16 horizontal.

The splash and sign-in screens are the only chrome-less surfaces.

## 4. Surfaces & sections

- **Card**: `p.cardBg` background, 1px `p.cardBorder`, radius 16, padding 12–16
  (`components/Chrome.tsx` `Card`). Every panel sits on one. Lists inside cards use
  hairline dividers (`p.cardBorder`).
- **Section header** (`SectionTitle`): uppercase, Inter 700, 13, `p.textPrimary`,
  letter-spacing 1 — with an optional lighter descriptor (`sub`) after it, like the
  web's `SectionTitle`/`SectionSub`. Sits **outside** the card, 8pt above it.
- Section spacing: 24 between sections, 8 header→card.
- **Row** pattern (movers/hitters/earnings): logo 32 → symbol (Inter 600, `p.accentText`)
  over muted name (11) → right-aligned numbers (tabular).
- **Every stock listed anywhere links to `/stock/[symbol]`** (Cam 2026-07-03). Plain
  rows: the whole row is the Pressable. Rows with their own tap behavior (e.g. the
  Watchlist's expand-on-tap): the *symbol* is the link, underlined (web §1.7 — the
  symbol is the affordance). Back always returns to the originating screen
  (`router.push` history; the stock route is a hidden tab screen so the bottom nav
  stays visible).
- **Segmented toggle** (`Segmented` in Chrome.tsx): the house two-way switch — pill
  container on `p.cardBg`, active segment `p.accent` @ 15% with `p.accentText` label.
  Used for Portfolio's Alfred | Personal split; reuse it for any in-page view switch.

## 5. Money & numbers

Integer **cents** end-to-end (house rule #4). Render only via `lib/format.ts`
(`money`, `signedMoney`, `pctFromBps`, `signedPctFromBps`) — never `toFixed` in a
component. P&L colours by sign: `p.pos` / `p.neg` / `p.textMuted` for flat.

## 6. Data

- All data through `services/api.ts` (`api<T>()`, GRQ-JWT Bearer) + `useApi` hook
  (`services/hooks.ts`) — loading / error / pull-to-refresh in one place.
- Wire types live in `services/types.ts`, hand-mirrored from `shared/contract.ts`
  (import-from-shared is a later metro-config follow-up). Additive server fields are
  optional here — render nothing when absent, never crash.

## 7. Voice

GRQ's voice everywhere: honest, plain-English, lightly funny — but money rules are
never funny. Empty states get a line of personality ("All cash — patience is a
position."), errors state what happened plainly.

## 8. The five pages

Today · Portfolio · The Wire · Watchlist · Search — tab bar in that order, Ionicons
outline set, active tint `p.accent`. Each page is designed for the phone (not a port
of the web layout), but reuses the web's *content order* where it exists.

- **Today** — the newspaper (shipped; see `components/today/sections.tsx`).
- **Portfolio** — split **Alfred | Personal** via `Segmented`, defaulting to Alfred.
  Alfred = NAV hero → the Tape → the book (cash + positions) → latest fund-level
  briefing. Personal = each member's SnapTrade accounts, read-only, with the honest
  footer that Alfred can neither see nor trade them (D97).
