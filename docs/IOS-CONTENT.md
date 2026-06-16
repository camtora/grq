# GRQ iOS — Content Spec

What every screen *says and shows*, screen by screen. Content comes from two places:

- **Live data** — JSON from the API (the `shared/contract.ts` shapes). Many of these are
  **new GET endpoints** (the web reads Prisma in server components today; see
  `IOS-PLAN.md`). Marked **[new API]**.
- **Words** — `shared/content/` (one source for both platforms): `glossary.json`,
  `daily.json`, `strings.json`, `voice.md`.

Everything obeys `voice.md`. Every number obeys the literacy pillar (`docs/LITERACY.md`):
if it's on screen, it's explainable — a tappable `Term` or an "Explain this" box.

## Global

- **Tab bar** (`strings.tabs`): Today · Market · Portfolio · Ideas · Settings. SF Symbols:
  `newspaper` · `chart.line.uptrend.xyaxis` · `briefcase` · `lightbulb` · `gearshape`.
- **Theme** — per member (Cam light, Graham dark; `users.ts` `theme`), from `/api/auth/me`.
  Tokens from `shared/tokens.json` (teal `#14b8a6`/`#5eead4`, near-black `#060d0c`).
- **Literacy** — a SwiftUI `Term` view underlines a glossary key and taps to a definition
  sheet (`glossary.json`); an "Explain this" affordance posts to `POST /api/explain`
  (cached, members only). Mirror of web `components/Term.tsx`.
- **States** — every list has empty (`strings.emptyStates`), loading (`strings.loading`),
  and offline copy. Read-only for viewers; member-only controls hidden + 403-guarded.
- **Money** — display only; integer cents from the API formatted on device. No math on device.

---

## 1. Splash  →  see `IOS-PLAN.md` + `strings.splash`

Dollar-bill rain → wealth-aware greeting (`daily.json`, banded by P&L from `/api/auth/me`)
→ TabView or Sign-in. Tagline `strings.brand.taglineShort`. The fun lives here; no money
logic.

## 2. Sign-in  ·  `strings.auth`

Wordmark + "Sign in to your fund." + Continue with Google (Apple later). Invite-only note.
Non-allowlisted email → `strings.auth.notAllowed`. Privacy/about link.

## 3. Today — "The Daily"  ·  **[new API]** `GET /api/today`  ·  parity: `web/app/today`

The newspaper (`docs/NEWSPAPER.md`). Edition auto-selected by ET clock:
Morning (pre-9:30) · Midday (9:30–16:00) · Evening (16:15+) · Weekend.

| Section | Content | Source |
|---|---|---|
| **Masthead** | *GRQ Daily*, edition + date, NAV headline + day P&L, daily quote/joke | `/api/today` · `daily.quotes` |
| **The Tape** | intraday NAV open→now, vs-XIC, sparkline | `/api/today` (NavSnapshot) |
| **Lead story** | agent's EOD wrap, or the morning plan pre-close | `/api/today` (Report) |
| **Market Movers** | biggest universe moves (5 up / 5 down) | `/api/today` |
| **Top Hitters** | holdings by day move | `/api/today` |
| **On the Radar** | ideas w/ near-term + 12-mo targets → expected return $/% on $1,000, confidence; unfamiliar names first | `/api/today` |
| **As it happened** | full journal timeline (progressive disclosure) | `/api/today` |
| **Fun fact** | rotating literacy fact | `daily.funFacts` |

Tappable terms: NAV, P&L, vs-XIC, The Tape, expected-return, confidence, dossier.
Voice: targets are hypotheses (`strings.literacy.hypothesisNote`); luck labelled.

## 4. Market  ·  **[new API]** `GET /api/market`  ·  parity: `web/app/market`

The universe + watchlist as cards: ticker (monogram avatar / logo), price + day move,
recommendation % (`recommendation`), the agent's call (`agent-call`), signal strip
(trend/RSI/MACD). Filters/search (`symbol-search` exists). Browse vs Research sub-tabs.
Empty: `strings.emptyStates.noMovers`. Tappable: recommendation, RSI, MACD, SMA, universe,
watchlist.

## 5. Portfolio  ·  **[new API]** `GET /api/portfolio`  ·  parity: `web/app/portfolio`

NAV header (cash + market value), day P&L, total P&L vs contributions vs XIC. Positions
list: shares, ACB, market value, weight, unrealized P&L, stop/take levels. Empty:
`strings.emptyStates.noHoldings`. Tappable: NAV, ACB, weight, unrealized-pnl, cash-floor,
drawdown, contributions.

## 6. Ideas  ·  **[new API]** `GET /api/ideas` + `GET /api/stocks/{symbol}`  ·  parity: `web/app/ideas`, `web/app/stocks/[symbol]`

Idea list → **Stock detail / dossier**: one-pager (business, signals, bull/bear, verdict),
near-term + 12-mo targets w/ expected return, analyst consensus target as an outside check,
fundamentals (mkt cap, FCF, P/E, div yield), recent news. "Explain this" on any concept.
Member directives (pin / no-fly) via `POST /api/stocks/directive` (member + Face ID).
Tappable: dossier, price-target, expected-return, analyst-target, moat, pe, free-cash-flow,
dividend-yield, short-interest, dilution.

## 7. Settings  ·  `GET/POST /api/settings` (exists)  ·  parity: `web/app/settings`

Risk dial (cash floor, max weight, stop/take, fee budget — all explainable). Members list.
Theme. **Kill switch** (`components/KillSwitch.tsx` parity) — big, unmissable, member-only,
Face ID + confirm (`strings.actions.killSwitch`), state from `/api/settings`, flips via
`POST /api/killswitch`. Soak status. Phase/roadmap. Sign out. Money-rule copy is plain
(`strings.guardrails`).

## 8. Agent chat (P3)  ·  `POST /api/chat` (exists, read-only)  ·  parity: `web/app/chat`

Read-only "Ask GRQ" — no order tools. Markdown answers; auto-tag glossary terms. Same
explainer infra as `/api/explain`.

---

## Contract note

The exact JSON shapes for the **[new API]** endpoints are defined once in
`shared/contract.ts` (zod) → TS for web, generated structs for Swift. Until those land,
this spec is the field list per screen. Money is always integer cents on the wire.

## Parity checklist (per feature, the "no separation" rule)

- [ ] Words added to `shared/content/` (in voice), not hardcoded per platform
- [ ] Shape added/changed in `shared/contract.ts` (one source)
- [ ] Web renders it · iOS renders it · same change/commit
- [ ] Every new number has a glossary term or an explainer
- [ ] Money-path copy states the guardrail plainly (no jokes)
