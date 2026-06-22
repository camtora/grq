# Handoff: "The Hunt" — iOS (Native Mobile)

## Overview
Native iOS adaptation of **The Hunt**, the AI stock-discovery feed in the **Get Rich Quick (GRQ)** app. Same brand, same data model, and same signature elements as the desktop redesign — heat ranking, confidence gauges, sparklines, the punchy hunt bar — re-laid-out for a single-column iPhone experience.

This package is for implementing the **iOS app screens** (SwiftUI native, or React Native / your mobile stack). The desktop web redesign is a separate package (`design_handoff_the_hunt`); the two share the data model and visual language but are independent layouts. If you have the desktop README, its **Per-Stock Data Model**, **gauge/sparkline math**, and **color/heat tokens** apply verbatim here — this doc focuses on what's mobile-specific.

## About the Design Files
The `.dc.html` file is a **design reference built in HTML** — it shows the intended look, layout, spacing, and component behavior on a phone-sized canvas. **It is not production code to copy.** The HTML prototyping runtime (`<x-dc>`, `<sc-for>`, `renderVals()`) and `ios-frame.jsx` (the device bezel mock) **do not ship** — `ios-frame.jsx` is only here so you can open the prototype and see the chrome in context. Recreate these screens with **native iOS components** (or your chosen mobile framework).

## Fidelity
**High-fidelity** for visual treatment, spacing, and the data-viz components. Match colors, type, radii, gauges, sparklines, and the heat system closely. The stock data is illustrative — wire the real GRQ hunt feed.

---

## Device Targets
- Designed at **402 × 874 pt** (iPhone 16 / 15 Pro logical size). Layouts are fluid single-column — scale to other widths by letting cards fill `width - 32pt` (16pt side margins).
- **Dark mode only** for this surface (the brand is a dark teal theme). Don't auto-invert to light.
- Honor the **safe-area insets**: content starts below the Dynamic Island / status bar (~58pt top inset in the mock) and clears the home indicator (~34pt bottom). In the prototype these are faked by the bezel; in-app, use real safe-area layout guides.
- The whole feed is a single vertically-scrolling view (`ScrollView` / `UICollectionView` / `FlatList`).

## Two Screens in This Package
| # | Screen | Purpose | Screenshot |
|---|--------|---------|-----------|
| 1 | **Hunt Feed** | The main list — brand row, large title, hunt bar, directed-hunt banner, sort toolbar, ranked heat cards | `screens/01-feed-top.png`, `screens/02-feed-scrolled.png` |
| 2 | **Top Pick / Stock Focus** | Pushed view when a card is tapped — hero treatment of the #1 stock with a large price chart, big gauge + heat, full thesis, then a compact "Next up" list | `screens/03-toppick-scrolled.png` |

Navigation: tapping a feed card (or "full dossier →") pushes Screen 2. "‹ Back to feed" pops. Standard iOS navigation stack.

---

## Screen 1 — Hunt Feed

### Brand row (top)
Compact, not a system nav bar. Left: 30×30 logo tile (gradient `linear-gradient(150deg,#34e0c4,#1c8f7c)`, glyph "↗", glow) + "GET **RICH** QUICK" wordmark (Space Grotesk 700, 13pt). Right: **HALT** status pill (red, pulsing 6pt dot — reflects real trading kill-switch) + 30×30 conic-gradient avatar.

### Large title
"The Hunt" — Space Grotesk 700, 34pt, `#eafff9`. Subtitle 12.5pt `#6c8a83`: *"AI sweeps North America for names ready to pop."*

### Hunt bar (focal element)
Gradient-border card (1.5pt padding wrapper, `linear-gradient(120deg, teal, violet, orange)`, radius 16) with an animated glow overlay (`huntGlow`, 4s — see Motion). Inner panel `linear-gradient(150deg,#0e1f1c,#0a1614)`, radius 15, 14pt padding:
- Row: 38×38 "⌖" icon tile (teal-tinted) + current brief text (14.5pt `#eafff9`) over a hint line (11pt `#5d7b74`).
- **Full-width HUNT button** below: 13pt padding, radius 11, Space Grotesk 700, `#04110d` on `linear-gradient(180deg,#5af0d6,#22c2a8)`, teal glow shadow. Label "⚡ HUNT".
- Tapping the brief text opens the keyboard to edit; HUNT submits → runs the AI web-search → repopulates the feed + shows the banner.

### Directed-hunt banner
Shown when a brief is active. Orange-tinted pill (radius 12), 8pt orange dot with glow, copy **"Directed hunt:"** + the brief. Dismiss/clear returns to a broad hunt.

### Sort toolbar
One line: "**6** hot names · sorted by **HEAT ▾**" (12pt, HEAT in teal — tappable to change sort key) and a small "↻" refresh pill (teal-tinted) right-aligned.

### Heat Card (the repeating feed unit)
Rounded card (radius 18, bg `linear-gradient(150deg,#10211e,#0a1513)`, 1px hairline border `rgba(90,200,180,0.12)`, 15pt padding, 12pt gap between cards). A **3pt left rail** painted the card's `heatColor` with a matching glow. Internal layout, top → bottom:
1. **Header row:** rank block (big `heatColor` number + "RANK", ~30pt wide) · `heatColor` logo tile (36×36, initials) · ticker (Space Grotesk 700, 18pt) + "▲ HOTTEST" badge on rank 1 + name·exchange line (10.5pt muted) · **confidence gauge** (48pt radial ring) pinned right.
2. **Price + sparkline row:** price (JetBrains Mono 16pt) + change % (colored) with a "30-DAY TREND" micro-label, beside a flex-filling sparkline (38pt tall).
3. **Heat meter row:** "HEAT" label · gradient-fill bar (7pt, `linear-gradient(90deg,#34e0c4,heatColor)`, width = heat%) · heat score (JetBrains Mono 700, `heatColor`).
4. **Thesis:** 12.5pt `#b6d4cc`, clamped to 2 lines.
5. **Actions:** full-width "full dossier →" primary button (teal gradient) + a 38×38 watch toggle (★/☆; "on" state teal-tinted).

Tapping anywhere on the card (or "full dossier →") pushes Screen 2.

---

## Screen 2 — Top Pick / Stock Focus

### Top row
"‹ Back to feed" (teal) + "IBKR-PAPER" account pill (reflects the connected brokerage/paper-trading mode).

### Hero card (the focused stock)
Large card (radius 22, bg `linear-gradient(140deg,#13251f,#0a1513)`, orange-tinted border + ambient `0 0 60px rgba(255,122,69,0.08)` glow, 3pt top accent bar `linear-gradient(90deg,#34e0c4,heatColor)`):
1. "▲ HOTTEST PICK" badge (orange) + "RANK 01 · HEAT 88" (mono).
2. 48×48 logo tile + ticker (Space Grotesk 700, **32pt**) + name·exchange.
3. Price (JetBrains Mono 700, 26pt) + change %.
4. **Large 30-day price chart** in an inset panel (radius 13, `rgba(0,0,0,0.18)` bg): header row "30-DAY PRICE" + change; a 120pt-tall area+line sparkline with two faint gridlines and a glowing end-dot. Color = change direction (green up / red down).
5. **Gauge + heat row:** 80pt confidence ring beside "HEAT SCORE" (mono 22pt `heatColor`) over a 9pt gradient heat bar.
6. **Full thesis** (unclamped, 13pt, line-height 1.6).
7. **Actions:** "full dossier →" primary + watch toggle (label form, "★ watching"/"☆ watch").

### "NEXT UP" list
Section label (Space Grotesk 600, 12pt, letter-spacing 1px) then compact rows (radius 16, `heatColor` left rail): rank · logo tile · ticker + price/change · mini sparkline · heat score. Tapping a row swaps the focused stock.

---

## Components (shared with desktop — recreate natively)

### Confidence Gauge
Radial ring meter. Track + progress arc on an SVG circle r=22 (circumference ≈ 138.23); arc length = `confidence/100 × circumference`, drawn from 12-o'clock clockwise (`rotate(-90)`), round cap, teal `#34e0c4` with a soft glow. Center: confidence number (JetBrains Mono 700) over a "CONF"/"CONFIDENCE" label. Rendered at **48pt** (feed card / next-up) and **80pt** (hero). In SwiftUI: a trimmed `Circle().trim(from:0,to:conf/100)` with `.stroke(lineCap:.round)` + a background ring; overlay the number.

### Heat Meter
Rounded track (radius 4, `rgba(255,255,255,0.06)`) with a gradient fill `linear-gradient(90deg,#34e0c4,heatColor)`, width = `heat%`. Heights: 7pt (card), 9pt (hero), 5pt (compact).

### Sparkline
30-day series → normalized polyline + a closed area fill (≈0.13 opacity) + a glowing end-dot. Color is the change-direction color. Build from real daily closes. In SwiftUI: a `Path` over normalized points; Charts framework also works.

### Heat color (drives rank number, rail, logo tile, meter end, accents)
`oklch(0.79 0.165 H)` where `H = 175 − (heat/100)·150`. High heat → warm/orange, low heat → teal. Use a native OKLCH→sRGB conversion (or precompute a gradient lookup) since UIKit/SwiftUI take sRGB.

---

## Data Model
Identical to the desktop package. Each result record:
`ticker, name, exchangeSector, price (currency-aware string), changePct, confidence (0–100), heat (0–100), thesis, thesisWordCount, sparkSeries (number[] daily closes), watching (bool)`.
**Derived in the view layer:** `rank` (sort results **descending by heat**, zero-padded display), rank 1 → `isTop`/"HOTTEST"; `initials` (ticker minus dots, first 2); `heatColor` (fn above); `changeColor` (green `oklch(0.82 0.15 162)` if `changePct ≥ 0` else red `oklch(0.68 0.2 22)`); `changeStr` (signed %).

## Interactions
- **Run a hunt:** tap hunt bar → keyboard → type brief → HUNT (or return) submits → calls the GRQ AI hunt/web-search endpoint → repopulates feed + shows directed-hunt banner. Empty brief = broad hunt.
- **Refresh:** "↻" re-runs (broad).
- **Sort:** tap "HEAT ▾" → action sheet to switch sort key (heat default; offer change%, confidence).
- **Open stock:** tap card / "full dossier →" → push Screen 2.
- **Watch toggle:** optimistic add/remove from watchlist; flips ★/☆ state. (Consider a swipe action on feed rows as the iOS-native shortcut.)
- **Next-up tap (Screen 2):** swap the focused stock.
- **Pull-to-refresh** on the feed is the expected iOS gesture — wire it to the broad refresh.

## Motion (keep subtle, respect Reduce Motion)
- `pulseDot` — 2s expanding-ring on the HALT dot.
- `huntGlow` — 4s opacity pulse on the hunt-bar gradient (a slow, living glow). Gate behind `UIAccessibility.isReduceMotionEnabled`.
- Card taps: standard iOS highlight/scale. Hunt submit: a brief loading state on the feed while the search runs.

## Design Tokens (mobile-specific values; full palette in the desktop README)
- **Page bg:** `#07110f` with a radial accent glow top-right (`rgba(52,224,196,0.10)` on the feed, `rgba(255,122,69,0.10)` on Screen 2).
- **Surfaces:** `linear-gradient(150deg,#10211e,#0a1513)` (cards), `linear-gradient(150deg,#0e1f1c,#0a1614)` (hunt bar), `linear-gradient(140deg,#13251f,#0a1513)` (hero).
- **Accent teal** `#34e0c4`; CTA gradient `#5af0d6 → #22c2a8`; accent text `#7af0da`. **Hot/orange** `#ff7a45 / #ff9a6e / #ffb18d`. **Danger** `#ff5d6b / #ff8b96`.
- **Text:** primary `#eafff9 / #d6efe8`, secondary `#b6d4cc`, muted `#6c8a83 / #5d7b74`.
- **Radii:** cards 18, hero 22, hunt 15–16, buttons/pills 8–16, meters 4–5. **Side margins:** 16pt. **Card gap:** 12pt.
- **Type:** Space Grotesk (display/tickers/CTAs), Hanken Grotesk (body/UI), JetBrains Mono (all numerics). Bundle these fonts in the app or substitute the nearest system equivalents (SF Pro Rounded / SF Pro / SF Mono) if you can't ship custom fonts — but the prototype intends the three named families.

## Assets
- **No image assets.** Logos are initial-tiles derived from the ticker; gauges/sparklines/icons are vector/glyph (↗ ⌖ ⚡ ▲ ★ ☆ ↻ ‹ ›). Swap glyphs for SF Symbols where sensible.
- Fonts: Space Grotesk, Hanken Grotesk, JetBrains Mono (Google Fonts) — bundle or substitute.

## Files
- `The Hunt — iOS.dc.html` — the interactive prototype (both screens, in iPhone frames). Open in a browser; the `renderVals()` block holds exact gauge/sparkline math + the sample data.
- `ios-frame.jsx` — device-bezel mock used by the prototype only. **Not for production.**
- `screens/01-feed-top.png`, `screens/02-feed-scrolled.png`, `screens/03-toppick-scrolled.png` — rendered captures.
