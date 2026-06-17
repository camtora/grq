# GRQ Decision Record

Engineering + plan decisions with rationale. Plan-level sign-offs also live in
`PROJECT_PLAN.md` §10; this file is the deeper "why" so future sessions don't relitigate.
All decided 2026-06-11 unless noted.

---

### D1 — Broker: Interactive Brokers Canada (not Questrade, not anyone else)
**Context:** The fund needs API order placement for a Canadian retail account, TSX + US.
**Decision:** IBKR Canada. **Why:** Questrade's API executes trades for *approved partner
developers only* — retail gets read-only account/market data (verified on questrade.com/api).
Wealthsimple/TD/CIBC have no public trading APIs. Alpaca doesn't serve Canadian residents.
IBKR has full retail API trading, both markets, CAD+USD, and a paper-trading twin.
**Consequences:** Headless auth runs through the Client Portal Gateway (retail OAuth isn't
self-service as of mid-2026) → IBeam container + a dedicated secondary username in Phase 3;
IBKR Flex Web Service (token-based, no gateway) as the resilient statements/history path.

### D2 — Swing trading; same-day round trips prohibited
**Context:** US FINRA day-trade rules constrain margin accounts < USD 25k (~3 day trades per
5 days; transitioning to Intraday Margin Standards through Oct 2027). $5k can't absorb
day-trade fee churn anyway. **Decision:** Multi-day holds; the v1 gate rejects same-day round
trips. **Consequences:** Sidesteps PDT entirely; delayed quotes are sufficient pre-live;
the agent's cadence is research-and-hold, not scalping.

### D3 — Non-registered **margin** account, margin borrowing banned in code
**Context:** CRA treats active trading inside a TFSA as business income (actively audited) —
a robot trading weekly is the poster child. Cash vs margin: cash accounts dodge PDT but
can never short and have settlement friction; margin settles flexibly. **Decision:**
Non-registered margin account, CAD base; guardrails prohibit borrowing. **Consequences:**
Capital-gains treatment preserved; the dormant shorting toggle (D4) stays *possible*;
buying power is never used beyond settled-cash equivalents by rule.

### D4 — No shorts in v1, but as a config toggle (Cam)
Shorting is OFF and hard-rejected by the gate, implemented as configuration rather than
assumption so it can be revisited *after the paper soak proves the model*. Enabling it is a
human decision + code change, never an agent decision.

### D5 — Sim-first build behind a broker seam (`BROKER=sim → ibkr-paper → ibkr-live`)
**Context:** IBKR account opening takes days–weeks; Cam wanted live-fire testing with a
pseudo-account immediately. **Decision:** Everything builds against `BrokerAdapter`; the sim
is a *complete* paper engine (real fills math, real accounting), upgraded from synthetic to
real delayed quotes in Phase 2. **Consequences:** Phases 0–2 have zero external dependencies;
clean sim weeks count toward the soak gate (≥2 of the ≥4 clean weeks must still be on IBKR
paper because only that tests gateway/session/fill plumbing); the sim survives forever as the
shadow sandbox for A/B-testing agent changes.

### D6 — Agent runs on Cam's Claude Max subscription (not metered API)
Token minted via `claude setup-token`, stored as `CLAUDE_CODE_OAUTH_TOKEN` in `.env`,
**verified working** with a live Haiku call. Marginal Claude cost ≈ $0 vs ~$40–120/mo
metered — the single biggest lever on a $5k fund where overhead is the main enemy
(full math: PROJECT_PLAN §8). Tradeoff: Max rate-limit windows; mitigated by Haiku-triage +
caching habits, acceptable for swing cadence.

### D7 — Money = integer cents, shares = integers
No floats in accounting paths, ever. BigInt rejected (JSON/serialization friction; int cents
covers ±$21M). Display formatting is the UI's job (`lib/money.ts`).

### D8 — Stack: TypeScript end-to-end, Next.js 15 + Prisma + Postgres, Docker
Matches the house (whosup = Express+TS+Prisma+Postgres; camerontora_web = Next on 3002).
One codebase: the Phase 2 agent joins as a second container from the same repo (own
entrypoint) rather than a workspace/monorepo split — legacy docker-compose v1 and solo
maintenance favour boring structure.

### D9 — Auth: reuse infra SSO, add an app-level member door
The global oauth2-proxy allowlist has ~7 people (wiki/media users). GRQ's middleware admits
exactly Cam + Graham (`lib/users.ts` ∪ `GRQ_ALLOWED_EMAILS`). Both are **equal admins and
both hold the kill switch** (Cam's call). The money is Cam's; Graham is a full partner in
operation and learning.

### D10 — ACB includes commissions; realized P&L is net
Buy commissions roll into average cost; sell commissions reduce realized P&L — matches CRA
adjusted-cost-base treatment and keeps dashboard P&L honest. Superficial-loss tracking
(30-day rebuy after a loss sale) is a Phase 2 agent rule.

### D11 — Hard limits live in code; the agent can never modify them
The gate (kill switch, no-short/no-margin, fee budget, position caps, rate limits) executes
deterministically inside `placeOrder` before any fill. The learning loop (D13) improves the
agent's *judgment*; its *leash* changes only by human commit. UI copy on the settings page
says exactly this, on purpose.

### D12 — Data feed: $0 delayed until go-live; real-time only when latency costs money
Phase 2 sim: Yahoo delayed (~15 min, free, unofficial-but-ubiquitous, feeds only the sim).
Phase 3: IBKR free delayed via gateway. Phase 4: TSX Level 1 streaming (~CAD 16.50/mo
historical non-pro rate). Protective stops will rest at IBKR and execute on exchange
real-time prices regardless of our subscription — downside protection is never 15 min late.

### D13 — Learning loop + capital recommendations are first-class requirements (Cam)
Thesis-at-entry (falsifiable) → retro-at-exit (luck flagged as luck) → distilled lessons
injected into every future session → weekly self-review proposing strategy tweaks
(human-approved during soak), all stamped with `agentVersion` so "v3 beats v2" is measurable.
Weekly report ends with contribute / hold / withdraw, honestly framed: more capital
amortizes overhead, it does not raise ROI %. Advisory only — money moves only in IBKR's portal.

### D14 — grq-db host port: loopback-only 5434
5432 = haymaker's postgres, 5433 already taken. Host-side prisma CLI uses
`web/.env` → 127.0.0.1:5434; containers use `db:5432` from root `.env`. Loopback binding
keeps it off the LAN.

### D16 — Universe is UI-managed with a two-person promotion rule (2026-06-12)
**Context:** Cam wanted stocks added/researched/promoted through the UI, not code commits.
**Decision:** `UniverseMember` lifecycle CANDIDATE → ACTIVE → RETIRED; anyone adds
candidates (researched, signal-tracked, never tradeable; cap 20); **promotion to ACTIVE
requires both members** + an automated screen; demotion/retirement is single-member
(reducing the robot's reach should never be blocked on a second person — kill-switch
precedent); the benchmark (XIC) is not demotable; history is never deleted. Research model
is tiered for cost (signals daily for everything; ~3 rotating deep dossiers/day + 5/day
on-demand) rather than "all stocks daily by LLM," which would blow the Max budget.
**Consequences:** supersedes the earlier "universe is code" stance from the same day;
`lib/universe.ts` became async/DB-backed with a 60s cache; sells and exits never depend on
membership status.

### D15 — Zero-dependency markdown renderer *(superseded 2026-06-12)*
Original: hand-rolled ~40-line renderer since agent output was simple. Superseded the day
real game plans and reports arrived using headers, lists, and links — `Md.tsx` now wraps
react-markdown + remark-gfm with teal-themed component overrides. The "revisit when reports
need more" clause triggered in under 24 hours, which is its own lesson about D-numbered
optimism.

### D17 — Decision model: Opus 4.8 after Fable 5 access broke (2026-06-13)
**Context:** The decision tier ran `claude-fable-5` (D6 / AGENT-SPEC). On 2026-06-13 every
decision-tier session began failing — the Max token returned "model may not exist or you may
not have access" — though it had worked the day before. **Decision:** Point `MODELS.decision`
at `claude-opus-4-8` (the flagship the Max token reaches); `GRQ_MODEL_DECISION` overrides
per-env, triage stays on Haiku 4.5. **Consequences:** Research, EOD/weekly reports, dossiers,
and chat run on Opus 4.8; marginal cost stays ≈$0 on the Max plan (D6). Surfaced a latent bug
— failed sessions were silently marked DONE — fixed the same day (the research queue now marks
FAILED honestly and requeues orphaned RUNNING on boot).

### D18 — Conviction gate, take-profit, penny=research-only, paid data (Graham + Cam, 2026-06-14)
From Graham's system review, decided with Cam:
- **Conviction gate:** the agent may not BUY below **75% thesis confidence**
  (`HARD.minBuyConfidence`, validator). A *quality* bar, not a cadence change — buy/sell timing
  still follows the existing §6 rules; this only blocks low-conviction entries.
- **Take-profit exits:** every position now carries a deterministic **take-profit** alongside the
  stop-loss — sell to claim the gain at +15/25/40% over ACB by dial (`DialPolicy.takeProfitPct`,
  enforced in the runner next to the stop). Both rest in code like a broker bracket.
- **Penny / high-growth = research-and-surface ONLY.** The research tool may hunt under-the-radar,
  high-upside small-caps and show their expected %, but the hard guardrails (price ≥ $2,
  ADV ≥ 100k, no OTC/warrants) are unchanged — moonshots are surfaced, never auto-traded.
  Loosening the floors stays a deliberate future human decision (likely a separate small
  high-risk sleeve, not the $5k).
- **Paid data approved.** Members fund one data API; recommendation is **FMP Professional
  (~$69 USD/mo)** for analyst price targets + fundamentals + insider/13F with TSX coverage
  (`docs/DATA-PROCUREMENT.md`), wired analyst-targets-first. *(Provisioned 2026-06-15 on FMP
  **Ultimate** — Cam's key. Use the `stable` API; v3/v4 are dead for newly-issued keys.
  Analyst targets key to the US/primary listing, so strip `.TO`/`.V` — `% upside` is
  currency-invariant. See `web/lib/fmp.ts`.)*

### D19 — IBKR headless gateway: 2FA solved, blocked on account provisioning (2026-06-15)
**Context:** First live bring-up of the IBeam gateway against both members' brand-new accounts
(applied 2026-06-12). **Findings:**
- **Headless 2FA works via IB Key push** — IBeam submits the login, IBKR pushes to the member's
  **IB Key app**, the member taps **Approve** → SSO login succeeds. No code/TOTP injection
  (IBeam has no 2FA handler wired). The IB Key app must be *activated*, not just installed; a
  newly-added device can sit in an activation hold; `IBEAM_OAUTH_TIMEOUT=180` leaves time to tap.
- **`env_file` values must be UNQUOTED** — a single-quoted `IBEAM_PASSWORD` made the gateway see
  the quotes literally → `Invalid username password combination` (same docker-compose v1 trap as
  the FMP key; CLAUDE.md rule 5). Cost the most time this session.
- **A separate API username is not required to authenticate** — the member's own username + the
  paper toggle (`IBEAM_USE_PAPER_ACCOUNT=True`) logs in, `competing:false` even sharing it (a
  dedicated username is still recommended for steady-state session isolation).
- **Blocked:** SSO succeeds but the brokerage **`iserver`** session won't connect
  (`authenticated:false`; `invalid challenge` on `ssodh/init`), with 2FA *and* competing-sessions
  both ruled out. On a 3-day-old account this is account provisioning — **pending approval /
  unsigned agreements** (market-data, disclosures) on interactivebrokers.com.

**Decision:** Park Phase 3 bring-up on the **account-setup** step (member completes pending
agreements / confirms trading approval); the gateway + 2FA path is proven and reusable. Kept
`IBEAM_MAX_FAILED_AUTH=1` (lockout-safe) while iterating; `BROKER` stays `sim`. The validated
procedure + gotchas are in `docs/IBKR-PHASE3.md` (the "⚠️ Validated 2026-06-15" block).
**Consequences:** Phase 3 stays blocked **only externally** — now on IBKR account provisioning,
not our plumbing — and the sim soak continues uninterrupted.

### D20 — IA restructure: Universe + Market, watch = candidate, agent focus renamed (Cam, 2026-06-15)
**Context:** Four overlapping stock tabs (Stocks/Market/Ideas/Research) plus two conflated
"watch" systems — a flat `Watchlist` table AND `UniverseMember` CANDIDATE status — produced
incoherent UI: a "watchlist" that overlapped the universe, and a dead "also watching" stub
with no page/signals/call. **Decisions (with Cam):**
- **Two tabs, one funnel.** Collapse to **Universe** (what's ours: the investable ACTIVE set +
  the watchlist) and **Market** (the world: Ideas / Browse / Research sub-tabs). A stock is in
  exactly one state — **watchlist** (CANDIDATE) → promote → **universe** (ACTIVE) → or nothing.
- **Watch = candidate.** One "Watch" action everywhere creates a CANDIDATE (the agent dossiers
  it); the standalone flat watchlist and the separate "+research" button are gone. Promotion to
  tradeable still needs **both members + the liquidity screen**; non-Canadian listings are
  research-only until multi-currency.
- **The `Watchlist` table was the agent's working memory, not redundant** — its rows are the
  agent's entry-trigger setups on ACTIVE names, injected into every decision session. Renamed
  the Prisma model **`Watchlist` → `AgentFocus`** (kept the physical table via `@@map`, so
  zero migration / no downtime); agent tools `get/set_watchlist` → `get/set_focus`; the agent's
  vocabulary "watchlist" → "focus". The human-facing "watchlist" is now candidates.
- **Nav trimmed 10 → 7:** Stocks/Ideas/Research folded in; **Activity** removed — its order
  feed folds into the **Journal** as an "Order ledger." Journal stays top-level (it's the
  *receipts*, a product pillar — not a setting). Redirects preserve every old URL.
- **PINNED** redefined as a pure priority flag (sorts to top, agent keeps it front-of-mind),
  decoupled from the focus table. Candidate cap lifted 20 → 200 (a guard, not a budget).
**Consequences:** `/stocks`→`/universe`, `/ideas`→`/market`, `/research`→`/market/research`,
`/activity`→`/journal`. Verified live end-to-end. The agent loop behaviour is unchanged (the
focus tool was renamed, same logic). Deferred: physical table rename off `@@map`. (Investigated
the suspected "AAPL artifact" — it's **not** one: AAPL is the **AAPL.TO CDR**, a real
CAD-denominated Apple depositary receipt on a Canadian exchange, correctly ACTIVE. CDRs
(`.TO`/`.NE`) are a path to trade US megacaps in CAD *without* multi-currency — a future
product call; NVDA/COST currently resolved to their USD listings, so they sit as research-only
candidates, but their CDRs would be promotable.)

### D21 — Data layer built on FMP Ultimate + BoC; real-time ticker; insider via dossier (2026-06-15)
**Context:** With **FMP Ultimate** (Cam, ~$250 — the paid backbone) + free Bank-of-Canada feeds,
most of the 10-tier taxonomy (`docs/DATA-SOURCES.md`) went from "not started" to live, feeding
both the stock pages AND the agent's decision context (so the data moves calls, not just
displays). **Built:**
- **Tiers 2/6/7 + analyst grades** on the stock page; an honest 10-tier **coverage map** replaced
  the placeholder (green/amber/grey + *why* each dark one is dark).
- **Tier 5 (13F)** — FMP institutional summary (US-listed; empty for pure-TSX issuers).
- **Tier 9 (macro)** — structured **BoC Valet** feed (overnight / 5y GoC / CPI / USD-CAD,
  `lib/macro.ts`) injected into the agent context + an Overview strip. Earnings dates also
  injected — the agent now *uses* catalysts.
- **Tier 4 (insider)** — the agent web-researches it per dossier (clusters of buying). The free
  structured path is walled (canadianinsider = Cloudflare, Yahoo = crumb, SEDI = fragile
  multi-POST CSRF form); a structured universe-wide feed needs a **paid** source (INK) — Cam's
  call, deferred (task #15).
- **Real-time quotes** — FMP Ultimate covers TSX (`.TO`); built `/api/quotes` (batch-quote-short,
  micro-cached, our-symbol→`.TO` mapping) + `<LiveQuote>` (polls ~2.5s, flashes on a move) on the
  stock-page price. **OPEN:** whether FMP serves real-time TSX or ~15-min delayed (exchange
  entitlement) — verify at market open; truly-real-time TSX otherwise rides IBKR L1 at go-live (#16).

**IA refinements (same session):** "the agent's call" → **"GRQ's call"** everywhere; the hunt
renders 2-up compact; smart money leads Market▸Ideas; the **Watchlist moved to Market▸Watchlist**
(Universe = just the investable set); Today's researched ideas now show GRQ's call.
**Confirmed (not a change):** the risk dial (CAUTIOUS/BALANCED/AGGRESSIVE) is fully functional —
it drives position size, cash floor, stop/take-profit distance, weekly-trade cap and buyable
tiers in the validator + runner (`agent/policy.ts` DIALS).
**Consequences:** FMP Ultimate is the paid data backbone. The two open data threads (structured
insider, real-time-TSX) are both gated on external decisions — INK feed, and the market-open check.

### D22 — IBKR paper gateway CONNECTED: loopback proxy + adapter fixes; blocked on paper-account permission sync (2026-06-16)
**Context:** Resuming D19 during market hours. The D19 "account provisioning" wall resolved into a
concrete cause: **no real paper account existed** — the "paper toggle" view was a half-provisioned
dead-end. Cam created a proper one (Client Portal → Account Settings → **Create Paper Trading
Account**) → **`DUQ774890`** with its OWN username **`cwiaiu983`** + password (a paper account is a
separate login, not the live creds — that was the missing piece).
**Two integration walls found & fixed (the "VERIFY-LIVE" shake-out):**
- **Gateway is loopback-only.** The CP gateway (Build 10.46.1l) only accepts `127.0.0.1` and
  *ignores* its `conf.yaml ips.allow` for any network IP (proven: ibeam's own IP is denied while
  `localhost` works). So the agent — a separate container — got `Access Denied` at `ibeam:5000`.
  **Fix:** a **socat sidecar** (`grq-ibeam-proxy`, `network_mode: "service:ibeam"`) forwarding
  `:5002 → 127.0.0.1:5000`, so the gateway sees a loopback connection; the agent uses
  `IBKR_GATEWAY_URL=https://ibeam:5002`. Internal docker network only (no host port) — an authorized,
  scoped relaxation of the loopback guard. (`ibeam/conf.yaml` is mounted but its allowlist is
  vestigial given the loopback-only behaviour.)
- **No-User-Agent → 403.** The gateway 403s requests lacking a `User-Agent`; the adapter already
  sends `grq/1.0`, so no code change (raw `node -e` probes were the red herring).
- **Adapter bugs (`web/lib/broker/ibkr.ts`), found via a 1-share XIC test order through the §6 gate:**
  `conidFor` returned the conid as a **string** (secdef/search) → IBKR 400 "parameter with incorrect
  type" → coerce `Number()`; and IBKR refusals come back as a **bare `{error}` object** (not an
  array) → the cascade now surfaces `resp.error` instead of "reply cascade unresolved".
**Verified:** gateway `authenticated:true, connected:true` to `DUQ774890` (`isPaper:true`);
`reconcile()` mirrors **CAD 5,000 / 0 positions** into the DB; the test order reaches IBKR and
returns a clean **"No trading permissions."**
**Remaining blocker:** Stocks-Canada trading permission was enabled on the **live** account, but IBKR
paper accounts sync permissions on the **nightly reset** → it won't reach `DUQ774890` until ~next day.
(Market-data agreements + the Market-Data API-cert were also required and are done.)
**Status:** reverted to `BROKER=sim` (agent healthy on the sim, soak uninterrupted). **Re-test next
market day:** restart `ibeam` (one IB Key tap), re-run the test order; if it fills + reconciles, flip
`BROKER=ibkr-paper` → the ≥2-week IBKR-paper soak clock starts. **Security:** Cam set the paper
password = his live password, so `.env` holds the live password — recommend rotating the paper login
to a unique password. Runbook: `docs/IBKR-PHASE3.md`.

### D23 — GRQ call unified to a 7-point scale; rating consistency; IA polish; SPCX is a CDR (Graham, 2026-06-16)
**Context:** Two rounds of web feedback from Graham (relayed by Cam).
**Rating unified (Cam's pick: 7-point):** the "GRQ call" was free words (Buy/Accumulate/Hold/Watch/
Trim/Avoid/Sell) that read inconsistently next to the deterministic signal. Unified to a **7-point
scale — Strong Buy / Buy / Weak Buy / Hold / Weak Sell / Sell / Strong Sell** — the SAME vocabulary
the signal already used (`agent/signals.ts gradeLabel`). `stance` is a free Prisma `String` (no
migration); `lib/stance.ts` rewritten with a back-compat map for the retired words + slider `pos`;
new `components/RatingBar.tsx` slider; agent `write_journal` enum + dossier prompt updated.
**Rating consistency:** the stock page no longer shows a competing technical "lean X" verdict —
**GRQ's call is the only rating**, technicals render as labeled indicators; the Watchlist slider is
driven by the call (never contradicts it).
**IA:** top-nav "Market" lands on **Watchlist**; **Universe** demoted to a background sub-tab;
**"Ideas"→"Discoveries"**; the **Research tab** is now a **human research desk** (your notes; the
agent's auto-research queue stays behind the scenes on the Watchlist); Universe rows got a
**Demote/remove** control; Watchlist rows are **condensed→expand** (native `<details>`).
**Today/Brief:** news **Headlines** moved to the top; an **industry (sector-performance) breakdown**;
**GRQ's call on movers**; the **game plan is full-width + uncondensed**.
**Search:** fixed **name search** (was ticker-only) — `fmpSearch` now queries `search-name` too,
merges/dedupes, and ranks North-American exchanges first; the multi-listing picker (ANET→NYSE,
Shopify→SHOP.TO+SHOP) + Browse country/exchange/sector/cap filters already existed.
**Guardrail audit (Graham's "double-check"), all PASS in code:** no margin / negative balance
(validator cash-floor + `sim.ts` "no margin borrowing"); no shorting; fee/cap-gains/Canadian-tax
aware; **no transfer/withdraw/FX/password/account tool exists** — the only money action is
`propose_order` through the §6 gate + kill switch; the agent never logs into IBKR.
**SPCX = a CDR, not a feed bug:** `SPCX.TO` is the **SpaceX CDR (CAD-hedged)** — a fractional
depositary receipt (~CAD 36) of the Nasdaq underlying `SPCX` (~USD 213); the ~5.5× gap is the CDR
ratio. For a CAD-only fund the **CDR is the correct tradeable instrument**; relabeled the entry, and
the agent must re-dossier on the **CDR's $36 basis**. **Multi-currency stays deferred** — CDRs already
give CAD access to most US megacaps; the money model is single-currency (CAD cents) and USD trading
would need currency-aware NAV/sizing + an FX leg + the FX-approval guardrail. Only US names *without*
a CDR force that decision.
**iOS (parallel):** the app + `shared/contract.ts`/`web/lib/feed.ts` updated to mirror the IA
(Universe→**Watchlist** + search, `leadTitle`, dossier `lastCents`).

### D24 — US research first-class: listing-aware identity + native-labelled currency (Cam, 2026-06-16)
**Context:** Graham has US names to research. Triggered by a concrete bug — Cam searched `SPCX`, picked
the **Nasdaq·USD** listing, and the app re-added the **`SPCX.TO` CDR** (D23) instead. Root cause was
threefold: (1) `UniverseMember` is keyed by the **bare ticker**, so a US listing and its CDR collide on
one PK; (2) the add flow POSTed only `{symbol}` — **the listing the user picked (exchange/currency) was
thrown away**; (3) the route then matched the bare ticker and revived the stale (CDR) row. The
disambiguation UI was cosmetic. (Aside found in the data: `TSM` had slipped into the universe as
**ACTIVE + USD** — a tradeable name the single-currency sim would have booked at a USD price as CAD.)
**Scope chosen (3-way fork, Cam):** **US research, first-class** — watch/dossier/compare US names,
currency-aware — but they stay **research-only**. US *trading* (multi-currency NAV/ACB/sizing + FX leg)
stays deferred per D23; CDRs remain the CAD-tradeable path for megacaps.
**Layer 0 — listing-aware identity (the fix):** `lib/universe.ts` gains `yahooForListing` (exchange→Yahoo
suffix), `bareTicker`, `isCadTradeable`. `POST /api/universe` `add` now resolves the **exact picked
listing** (probes only it), stores `currency`/`exchange`/`country` on add, and uses **collision-safe
keying** — bare ticker if free, else the exchange-qualified symbol — so a US listing and its CDR coexist.
`AddTicker`/`WatchButton`/Browse transmit the chosen `exchange`+`currency`. **Promotion is now gated on
currency** (`isCadTradeable`), not the `.TO` suffix — CDRs stay promotable, true-USD stays research-only.
No schema migration (the columns already existed).
**Data reconcile:** moved the SpaceX CDR `SPCX`→`SPCX.TO` (freeing the bare ticker for the US listing,
carrying its quote/bars/journal/research), and **demoted `TSM` USD ACTIVE→CANDIDATE** (no USD name is
tradeable). Verified live: adding `SPCX`/Nasdaq/USD now creates a bare `SPCX` (USD) row, distinct from
`SPCX.TO`.
**Layer 1 — native, labelled currency (Cam's pick over CAD-normalize):** `lib/money.ts` `money(cents,
currency)` — CAD stays a bare `$`, non-CAD renders its own symbol (`en-CA` ⇒ **`US$170.50`**), so a US
name can't be misread as CAD. Wired across Browse / Watchlist / Discoveries / stock page (+ `LiveQuote`,
currency chip). `shared/contract.ts` gains `currency` on `MarketName`/`Mover`/`Idea`/`Dossier`;
`web/lib/feed.ts` populates it; iOS mirrors — `Fmt.money(cents, currency)` + `MoneyText` currency-aware,
Models gain `currency`, Market/Today/Ideas/Dossier pass it (NAV/cash/fees stay CAD). *iOS compiled in
Xcode by the user — not buildable on the Linux host.*
**Deferred:** US macro for the agent context (FRED feed — Fed funds/UST/US CPI alongside BoC) needs a
free FRED key; and full US *trading* (multi-currency) remains a Phase-3+ decision, unchanged from D23.

### D25 — Market/Discover restructure + Today/Universe/stock UI overhaul (Cam, 2026-06-16)
A large UI/IA pass on the Market section and the dashboards, built in verified chunks.
**Navigation:** Market sub-tabs reordered to **Watchlist · Universe · Discover · Browse**; "Discoveries"
→ **Discover**. The **Research desk tab is removed** — human notes now live per-stock (`/market/research`
+ `/research` redirect to Watchlist).
**Watchlist:** rows render Universe-style (condensed: ticker → stock page · name · currency · signals ·
price/day · **RatingBar** call) and **expand into the researched-ideas card**. That card was extracted to
a single shared **`components/IdeaCard.tsx`** (`Idea` type + `SourceChips` ride along); Discover's old
local copy was consolidated into it (one source of truth).
**Universe:** GRQ's call column → the **RatingBar** slider; a **"Demoted" shelf** below the active table
lists CANDIDATEs that carry a demote journal (back on the watchlist; the agent won't buy them).
**Discover:** trimmed to **the hunt + smart money** (researched-ideas + market-pulse sections removed).
The hunt asks for **8–12** names (was 3–6); a **↻ refresh** button sets `AgentState.huntRequestedAt`
that the agent's tick loop picks up and runs the hunt **off-schedule** (the web/alpine container can't run
a Claude session — only the agent/debian can — so a flag is the bridge); a per-card **✕ dismiss** marks a
name **RETIRED** (`/api/universe` `dismiss` — creates the retired record since hunt names aren't members
yet) so the hunt skips it and it lands in Retired research.
**Stock page:** the journal section is renamed **"The record"** with an **"+ add note"** control; notes
save as a new **`JournalKind.NOTE`** entry (`/api/note`) inline with the agent's. Also rearranged: Signals
sits **beside Valuation vs peers**, Institutional moved **into the panel row** (where Signals was), the
**Scoreboard got a header**, and the four panels are **equal height** (`flex-1`). Non-universe researched
names (hunt finds) now render a **dossier preview + "Watch to add"** instead of 404; the hunt's once/day
guard was fixed (`"Hunt —"`→`"Hunt dossier"`).
**Today:** a **live market-indices strip** (TSX/S&P/DJIA/NASDAQ/Gold/Oil via `fmpIndices` → `/api/indices`
→ `MarketIndices`, polling 15s **until the 4pm close** then frozen); **biggest movers beside the industry
breakdown**, movers **expandable** (sector/industry/cap via `fmpProfile`); and the **Market pulse** (3×3
headlines) moved here from Discover, under Headlines. Money renders native+labelled (US$ vs C$, D24).
**Universe** also gained a **"Researched"** (last-completed-research) timestamp column.
**Schema (additive, pushed):** `AgentState.huntRequestedAt`/`huntRequestedBy`; `JournalKind.NOTE`.
**New:** `components/{IdeaCard,MarketIndices,AddNote,DismissButton,RefreshHuntButton}.tsx`; routes
`/api/{indices,note,hunt/refresh}`. **Open:** the "Demoted" shelf is empty until a name is actually
demoted; FRED US-macro (D24) still pending.

### D26 — Market nav into the header + Discover/Browse polish (Cam, 2026-06-16)
Follow-on UI pass after D25, built in verified chunks. **Navigation:** the four market destinations
**Watchlist · Universe · Discover · Browse** are surfaced **directly in the header** (`NavBar`); the
`MarketTabs` sub-nav component is **deleted** (no double navigation). Active-state uses an `exact` flag so
**Discover** (`/market`) doesn't light up on `/market/watchlist` or `/market/browse`. The two pages that
read "Market" were retitled to **Watchlist** and **Browse**.
**Research now:** the **"Research now"** button is **removed from the Watchlist + Universe list tables**
(and the Demoted shelf) — it belongs on the stock page, where it stays. Done via a `hideResearch` prop on
the shared `UniverseActions` (default still shows it, so the stock page is untouched).
**Discover / the hunt:** hunt cards no longer show a Buy/Hold/Sell **verdict** — a "Hold" on a name you
don't own is contradictory, and these are *leads*, not positions. New `IdeaCard` `discovery` prop drops
the call and **leads with the 12-mo upside + GRQ's conviction (confidence)**. This also fixes the "why so
many Holds" report: half the tiles were either genuine low-conviction Holds or legacy `WATCH→Hold`
back-compat mappings — both gone now. (Hunt *entry* criteria unchanged: the daily `runDiscoveryHunt`
session web-searches 8–12 under-the-radar Canadian-listed names — it's the agent's judgment, not a screener.)
**Browse:** replaced the add-to-watchlist box with an **inline "Name or ticker" field in the screener
form** that **narrows the result set** (it does not add to the watchlist). `fmpSearch` finds listings,
`fmpProfile` fills the sector/cap/price columns so search rows match the table; the dropdown filters
further narrow; you **Watch from the row**.
**Ops correction (bit us this session):** Docker's data-root is **`/var/lib/docker` on `/dev/sda5`
(`/var`, ~95–100% full)** — NOT on `/` as CLAUDE.md claimed (sda2 is roomy). **A full `/var` makes a build
silently bake STALE code** (`COPY . .` can't write a new layer; the image keeps old pages) — a
"successful" deploy served old code until caught by diffing the compiled page inside the image. Always
verify a fresh image before trusting a deploy. Reclaim with `container prune -f` + `image prune -f`
(dangling only — shared host, never `-a`/`system prune`). CLAUDE.md updated.
**Files:** `components/{NavBar,IdeaCard,UniverseActions,StockTable}.tsx` (StockTable = the shared
Universe/Watchlist table from the D25 line), `app/market/{page,browse/page,watchlist/page}.tsx`,
`app/universe/page.tsx`, `CLAUDE.md`; **deleted** `components/MarketTabs.tsx`. No schema change.

### D27 — Today/Reports/Journal IA refresh + per-member chat threads (Cam, 2026-06-16)
Follow-on UI pass (parallel to D26). **Today** is leaner and date-aware. Viewing a **past date** now
**hides the live data** (the indices ticker, Headlines, Market pulse, both movers blocks + the industry
breakdown) instead of showing today's numbers against an old date — only date-scoped historical sections
remain. **Top Hitters / On the Radar moved above Market Movers**; the **date nav** moved into the masthead
(right-aligned under the NAV, beside the quote); the **"Did you know?" fun fact** tucked under the masthead
quote; the **"day as it happened"** timeline removed (it's the Journal's job). The morning plan + EOD and
the midday review all **left** the Today page (see below).
**Reports → a hub:** tabbed (URL-param, SSR, with counts) over **Daily** (each day's morning game plan
beside the EOD close, paired by ET day), **Weekly**, **Smart Money** (the agent's "Smart money" roundups,
ex-Discover), **Retros**, and **Lessons**. Bodies read in-page (collapsible) — the per-report "full report
→" links were dropped (the `/reports/[id]` detail route stays, just unlinked).
**Journal → Settings:** the Journal (scoreboard + kind filters + entries + order ledger) is now a section
at the **bottom of Settings** (`JournalSection`, anchor `#journal`); the top-level "Journal" nav item is
gone and `/journal` (+`?kind=`) and `/activity` **redirect** to `/settings#journal`.
**Overview:** gained the **Midday Review** card (the afternoon read, moved off Today).
**Chat — per-member threads (the one schema change):** `ChatMessage.owner` (the member whose thread it is;
`email` stays the author) + `@@index([owner, at])`, pushed and **backfilled** (the 26 shared messages split
into Cam's 17 / Graham's 9 — user turns to their author, agent replies inherit the turn they answered).
Clicking Chat opens **your** thread; a **Cam | Graham toggle** switches the active thread for both reading
and sending (you post into the active thread, authored as you). `/api/chat` GET/POST resolve a
member-validated owner; `chat-server` persists + reads history per-owner. Still read-only — chat trades
nothing. Reports + Settings also moved to the **right** of the header (landed in the D26 `NavBar`).
**Ops:** the deploy hit the full `/var` again (db push: "No space left on device") — cleared with
`container/image prune -f` (dangling only) and verified the running web+chat serve fresh code (the new
`owner` field + owner-aware chat-server source), since a full-`/var` build can silently bake stale (D26).
**Files:** `app/{today,page,reports,settings,journal,activity,layout}.tsx`, `app/api/chat/route.ts`,
`agent/chat-server.ts`, `components/{JournalSection,ChatDrawer,ChatClient}.tsx`,
`prisma/{schema.prisma,backfill-chat-owner.ts}`. **Schema (additive, pushed):** `ChatMessage.owner`.

### D28 — Smart Money is its own data-driven page (Cam, 2026-06-17)
Promoted "smart money" from a single **weekly LLM web-search** card on Discover to a **first-class,
structured destination** at `/market/smart-money` (top-level header nav — no sub-nav; Cam). The old prose
card is **gone** from `/market`; the data now comes from **FMP Ultimate's structured feeds** (already paid)
**+ a nightly OpenInsider scrape** as a cross-check — not the model.
**What the page shows (Cam's priority order):** (1) **Tracked-portfolio cards** — a curated roster of 13F
filers (Buffett/Berkshire, Burry/Scion, Ackman/Pershing, Wood/ARK, **Aschenbrenner/Situational Awareness**)
+ a tracked member of Congress (Pelosi), each an avatar/monogram header that expands into a Watchlist-style
holdings table (weight · NEW/ADD/TRIM action diffed vs the prior quarter · **PUT/CALL flag** · universe
overlap). Aschenbrenner's & Burry's bearish semis **puts** are explicitly labelled so a put never reads as a
long. (2) **Congress's most-bought** leaderboard (senate+house, aggregated by distinct members). (3)
**Biggest insider buys** (open-market Form 4 only — `P-Purchase`, not option exercises) + a **cluster-buys**
strip. (4) The agent's **"GRQ's read"** narrative — `runSmartMoneyScan()` rewritten to *synthesize the
ingested tables* (not free web search), still titled "Smart money — <date>" so the Reports tab still works.
**Cadence:** congress + insider ingest **daily** (they file continuously); 13Fs only re-pull when a **new
filing date** appears (quarterly, ~45-day lag, idempotent skip). A once-per-ET-day `runSmartMoneyIngest()`
runs in the runner tick.
**Honesty baked in:** 13F = longs+options only, ~45-day lag, no true shorts; congress amounts are ranges;
most names are US-listed (we trade TSX) → leads/colour, not trade instructions. The **universe-overlap
badge** is the tie-back to the fund.
**Schema (additive, pushed):** `PortfolioSnapshot`/`PortfolioHolding` (13F by holder; USD **BigInt** —
reference data, not fund cents), `PoliticalTrade`, `InsiderTrade`. **FMP wrappers** (`lib/fmp.ts`):
`fmp13FDates`/`fmp13FHoldings`/`fmp13FSummary` (by CIK), `fmpSenateLatest`/`fmpHouseLatest`,
`fmpInsiderLatest`. **Files:** `lib/smart-money/{portfolios,openinsider,ingest,queries,types}.ts`,
`app/market/smart-money/page.tsx`, `components/smart-money/{PortfolioCard,CongressCard,Leaderboard,SmartMoneyAvatar}.tsx`,
`components/NavBar.tsx`, `agent/{runner,sessions}.ts`, `app/market/page.tsx` (card removed). Roster CIKs +
endpoint shapes verified live against FMP before wiring; `scripts/ingest-smart-money.ts` is the manual
re-pull/spot-check. **NB:** FMP key lives only in root `.env` (container), not `web/.env` — host-side ingest
needs it injected.

**Follow-up (2026-06-17, same day) — integrated into the stock page + the agent's decisions (Cam):** Smart
money is no longer a standalone page only. (1) `getSmartMoneyForSymbol(symbol)` (`lib/smart-money/queries.ts`)
is the one shared per-symbol read — tracked roster funds that hold/short it (face + weight/action + PUT/CALL),
roster members of Congress who traded it, plus aggregate congress-buyers (180d) / insider-buys (90d). Matches
on `bareTicker` so cross-listings line up; skips negligible (~0.0%) common lines. (2) **Stock page**: a
`StockSmartMoney` panel (`components/smart-money/StockSmartMoney.tsx`) renders those **faces + positions** on
`/stocks/[symbol]` (above the data-panel row), nothing when there's no activity. (3) **The agent weighs it**:
`buildContext()` gained a `## Smart money on your names` section for holdings + focus (verified live), and
`runStockDossier()` injects the per-symbol summary into the dossier prompt — both framed *"an INPUT you weigh,
NEVER the gate."* The deterministic gate in `sim.ts` still never sees it; copy-trading stays out. Literacy:
the page's "How to read this" blurb was replaced by `<Term>` tooltips (glossary keys `13f`/`form-4`/`insider`/
`put-option`/`call-option`/`cluster-buying`/`congress-trade`). **Not yet done:** grading smart-money-influenced
theses via the source scoreboard (the "did following them work?" loop).

### D29 — Stock-page logos · Today movers clickable+auto-researched · expandable Universe/Watchlist rows (Cam, 2026-06-17)
Three fills from Cam & Graham's review.
**(1) Company logo on the stock page.** `<StockLogo>` (logo + monogram fallback, already on the lists) now
sits beside the title on `/stocks/[symbol]` — `logoUrl` was already loaded, just never rendered; untracked
names get the monogram.
**(2) Today's "biggest movers" are clickable + auto-researched.** The whole-market FMP gainers were dead
text unless already tracked. Now every mover links to `/stocks/<sym>`, and the Today render queues a dossier
(`ResearchRequest`, `requestedBy:"movers"`, idempotent) for any it doesn't already track/research. The stock
page's not-tracked branch no longer 404s when a quote or a queued request exists — it shows a "GRQ is
researching this" state that fills in once the dossier lands. The runner suppresses the "Dossier ready"
Discord ping for `movers` requests (treated like `rotation`). Also moved **The Tape** (NAV sparkline) above
the headlines on Today.
**(3) Click-to-expand Universe/Watchlist rows.** Both tables (shared `StockTable`) expand a row on click to
show **GRQ's call (large) + its one-line blurb**, the dossier's plain-English **"why"** (`bottomLine`),
near/12-mo targets + confidence, a **full dossier →** link, AND — **lazily, on expand** — **earnings +
analyst ratings** (the same FMP data as the stock page). `StockTable` stays a server component: a small client
`ExpandableRow` owns only open/closed state, with the cells + the server-rendered detail panel passed in as
props; clicks on links/buttons/`[data-no-expand]` don't toggle. The earnings/analyst half is a client
`RowExtras` that fetches `GET /api/stock-extras/[symbol]` only when the row opens (cached per session), so the
tables never pay ~2 FMP calls per name on load. `StockFilters` hides an open detail row in lockstep with its
parent. Universe now fetches the latest dossier per name (bottomLine + targets), as the Watchlist already did.
Supersedes the D26 "Watchlist expands into the IdeaCard" plan — the expansion is now the lighter in-table
panel, on both pages.
**Files:** `app/stocks/[symbol]/page.tsx`, `app/today/page.tsx`, `app/universe/page.tsx`,
`app/market/watchlist/page.tsx`, `app/api/stock-extras/[symbol]/route.ts` (new),
`components/{StockTable,StockFilters,ExpandableRow,RowExtras}.tsx`, `agent/runner.ts` (movers-alert
suppression). No schema change.

### D30 — Hunt finds get a full dossier queued (researched, NOT added to the Watchlist); Discover renamed "The Hunt" (Cam, 2026-06-17)
The discovery hunt writes a lightweight "Hunt dossier" lead per name. Now, after the session, **each surfaced
name also gets a FULL dossier queued** (`lib/hunt.ts` `queueHuntDossier` → `ResearchRequest requestedBy:"hunt"` →
`runStockDossier` writes "Dossier — TICKER"), so the stock page is **researched and ready when a member clicks
it** instead of the thin agent-flagged page. **Deliberately NOT added to the universe/Watchlist** (Cam: don't
want every find cluttering the Watchlist) — the not-tracked stock page just shows the full dossier; **watching a
find** is what tracks it (adds the CANDIDATE, with live quotes/signals from then on). The full dossier is
web-research-driven, so it's useful for a bare TSX/TSXV ticker we don't yet track (no live quote/signals until
watched). `queueHuntDossier` skips names already tracked, already researched, or with a dossier in flight; the
runner suppresses the "Dossier ready" Discord ping for `requestedBy:"hunt"`. **Guardrails unchanged:** the agent
adds nothing to the universe and trades nothing. **Also:** the **Discover** destination is renamed **The Hunt**
(nav, page, back-links). **Files:** `lib/hunt.ts` (new), `agent/{sessions,runner}.ts`, `components/NavBar.tsx`,
`app/market/page.tsx`, `app/market/watchlist/page.tsx`, `app/stocks/[symbol]/page.tsx`. Agent-only — inert until
the agent image is rebuilt.

### D31 — Sim fund bumped $5,000 → $25,000 (Cam, 2026-06-17)
Cam raised the simulated fund from $5k to $25k. Changed: `prisma/seed.ts` (account cash + initial contribution
now `2_500_000` cents; init journal reads $25,000), the agent PERSONA (`agent/sessions.ts` — "$25,000 CAD
fund"), and the Settings roadmap label. **Takes effect only on a destructive reseed** (`npx tsx prisma/seed.ts`
wipes ALL fund data and resets the soak clock running since 2026-06-12) — until then the live sim still holds
$5k and the PERSONA figure runs ahead of reality. **Guardrails (`agent/policy.ts`) unchanged:** if any hard
limit is absolute-dollar rather than % of NAV, revisit it for the 5×-larger account before relying on it. Also
`.gitignore` now ignores `.env.*`.

### D32 — Agent self-investing: it builds its own tradeable universe (Cam, 2026-06-17)
**Context:** the goal is a *self-investing* agent. Until now the agent could only PROPOSE — promotion
CANDIDATE→ACTIVE required two members + the liquidity screen (D16). Cam wanted the agent to expand its
own universe, while keeping the real safety. **Decision (a two-gate distinction):** the **§6 order gate**
(kill switch, no-short/no-margin, position caps, fee budget, daily-loss) is the hard safety and **never
moves** — house rule #1 stands. The **universe/promotion** human-gate (D16, 2b) is *relaxed* into a new,
code-gated **agent path** that sits ALONGSIDE the unchanged human watchlist→universe flow.
**Built:** `agent/promote.ts` — `agentSelfPromote()` (CANDIDATE→ACTIVE) + `addCandidate()` (track a
researched hunt find as a CANDIDATE). Tools `add_candidate` + `promote_to_universe` (`agent/tools.ts`,
decision toolset). The **liquidity screen** moved to `lib/screen.ts` (shared by the human route + the agent,
one bar). **Rules** (`agent/policy.ts → SELF_INVEST`, humans-only per D11): must be a researched CANDIDATE ·
latest dossier ≥ Buy & confidence ≥75 · the screen (≥$2 · 20d ADV ≥100k · ≥30 bars) · CAD-tradeable · not
BLOCKED · ≤2 self-promotions/rolling-week · ≤60 ACTIVE. Flag `GRQ_AGENT_SELF_PROMOTE` (default on).
**Startup review** (`runStartupUniverseReview`, fired once per boot from the runner, 6h-guarded): the members
demote the whole universe to the watchlist (done — 57 candidates), and on boot the agent reviews them,
self-promotes the names it would genuinely invest in, journals a "Startup universe review — <date>", then
sets focus / places entries. Runs in a **bootstrap window** (`setBootstrapMode`) that lifts ONLY the weekly
cap — every quality gate still applies. **Alerting:** each self-promotion fires a distinct `🤖 GRQ
self-promoted {symbol}` Discord (+ `🤖 GRQ is tracking` for new candidates); the human `🟢 joined the
universe` alert is untouched and persists. **Loop is now closed:** hunt → dossier → add_candidate →
promote_to_universe → trade, all agent-driven, with block/demote/kill + the order gate as the human brakes.
**Chat persona** updated so the read-only chat agent can explain the new capability. Default-on, on `ibkr-paper`.

### D33 — IBKR paper LIVE + the slow-fill ledger finaliser (Cam, 2026-06-17)
**Context:** gameday. The D22 connection's last blocker was the Stocks-Canada trading permission not yet
synced to the paper twin (paper inherits perms only on IBKR's nightly reset). On 2026-06-17 the reset
cleared it — and **re-provisioned the paper account** to **`DUQ779121`** (login `yzfrmq515`, CAD ~25k, the
paper default), replacing `DUQ774890`/5k; `.env` updated. **Decision:** today counts as **day 1 of the
≥2-week IBKR-paper soak** (Cam's call); `BROKER=ibkr-paper` stays live. The soak gate (§9: ≥2 clean weeks
on IBKR paper, ≥4 total incl. sim) and the §6 order gate are unchanged.
**Verified end-to-end:** (1) gateway `authenticated:true,connected:true`; (2) `reconcile()` mirrors the
gateway ledger (CAD 25k / flat) into the DB `Account`; (3) a 1-share XIC market order via
`getBroker().placeOrder` (the manual `/api/sim/order` route is hard-blocked off-sim, by design) was
**accepted (no "No trading permissions") and FILLED @ CAD 56.98**, then reconciled. We now hold 1 paper
share of XIC.
**Bug found + fixed (the gameday work):** a fill that lands AFTER the adapter's synchronous ~12s poll
returns `PENDING`, and nothing finalised it — `reconcile()` only mirrors position/cash and
`sweepPendingOrders()` is a no-op for IBKR → the `Order` stayed `PENDING` forever with **no `Trade` and no
journal entry**. Holdings/NAV stayed correct, but the **trade ledger silently missed the trade** — wrong
for a clean soak record (and a "shows it but can't explain it" literacy bug). **Fix** (`web/lib/broker/
ibkr.ts`, `web/agent/runner.ts`, `web/prisma/schema.prisma`): added **`Order.brokerOrderId`** (stored on
the PENDING row); new **`IBKRBroker.finalizePending()`** runs each market tick *before* `reconcile()` (so a
sell's realized P&L reads the pre-fill ACB), polls each PENDING ibkr order's
`/iserver/account/order/status/{id}`, and on `filled` writes the Trade + journal via a shared
**`settleFill()`** (refactored out of `recordFill`) and flips the order `FILLED` (cancelled/rejected →
`REJECTED`). The first test order (#15, a legacy row with no `brokerOrderId`) was **backfilled** directly.
tsc clean; agent rebuilt + deployed (`--no-deps`), stale-build-checked against the fresh image,
`finalizePending()` exercised live (returned 0 — nothing left pending). **Ops note:** the deploy hit
`/var` `ENOSPC` (host disk 94–95%; agent bounced ~2×) and recovered after `docker image prune -f` freed
4.5 GB — recurring disk pressure, minimise rebuilds. **Open follow-ups:** rotate the paper login to a
unique password (the bot must not hold live-account creds); the gateway needs a daily ~midnight-ET IB Key
re-approval. Runbook: `docs/IBKR-PHASE3.md` top block.

**Follow-up same day — fill alerts + a market-order price bug (deployed + pushed).** Cam noticed the
agent's 53-share XIC buy fired no Discord alert. Root cause: the discretionary order path
(`validator.placeAndJournal`) journals a DECISION but **never called `alert()`** — only deterministic
stops/take-profits, risk events, self-promotions and session summaries ping. **Added per-fill pings, exactly
one per fill:** `placeAndJournal` alerts on a synchronous `FILLED` (`Bought/Sold {qty} {symbol} @ $x`, info
→ 💹 Discord); `finalizePending()` now **returns the filled orders** (type `FinalizedFill`) and the runner
pings each, **skipping `system-stop`/`system-takeprofit`** (they alert at trigger → no double-ping). A
PENDING order is announced only when it actually fills, so fast fills ping from the validator and slow fills
from the runner — never both. **Verifying this surfaced a real bug:** the per-order status endpoint reports
the fill price as **`average_price`** (snake_case), NOT `avgPrice` (that's the orders-LIST field). The code
read only `avgPrice`/`avg_price`, so a MARKET order (no `limit_price` fallback) computed `priceCents=0` and
was **skipped forever** by BOTH the synchronous ~12s poll in `placeOrder` AND `finalizePending` — the
53-share order only finalised because it was a LIMIT (it had a limit price to fall back on). Fixed both
reads to prefer `average_price`. Verified live: a 1-share XIC **market** test went PENDING→finalised @
$56.89, Trade/journal written, the "Bought 1 XIC @ $56.89" alert delivered. Files: `web/agent/validator.ts`,
`web/agent/runner.ts`, `web/lib/broker/ibkr.ts`.

**Follow-up — performance referenced to the paper inception, not the sim.** Cam: "vs XIC −$630.51" looked
wrong because the benchmark was anchored to the **sim seed** (2026-06-12, XIC $55.51), giving XIC a 5-day
head start before we deployed a dollar. The fund's real track record starts at the **IBKR-paper open
(2026-06-17 9:30 ET = 13:30 UTC)**. Fixes: (1) **re-anchored the single $25k `Contribution`** to that open
(`xicPriceCents` $55.51→**$56.75** = XIC at 9:33 ET, derived from the all-cash open snapshot; `at`→06-17
13:30; today's already-written `NavSnapshot.benchmarkCents` rescaled ×5551/5675 since benchmark ∝ 1/anchor)
→ "vs XIC" went −$630→~−$80. (2) Added **`PAPER_INCEPTION`** (`lib/portfolio.ts`) and windowed the
performance VIEWS to it (non-destructive — sim snapshots stay in the DB): `getNavHistory` (Portfolio NAV
chart) and the Today page's day-open baseline (`app/page.tsx` `dayOpenSnap`) now filter `at >=
PAPER_INCEPTION`. The latter also fixed a phantom **+$20k "today" gain** (the Today baseline had been the
last *sim* 5k snapshot → `25k − 5k`). Drawdown HWM unaffected (today's 25k was already the max).

**Follow-up — reconcile-wipe fix + guardrail/baseline hardening (Cam, 2026-06-17, day 1).** Root cause of a
false daily-loss pause on day 1: a restart/re-auth left the `iserver` session momentarily down, a
`reconcile()` positions read came back empty, reconcile treated "empty" as "account flat" → **deleted the
position mirror** → NAV read cash-only (−12.5% vs the $25k baseline) → daily-loss pause fired. The next
reconcile (~60s later) restored it. Three fixes: (1) **`reconcile()` no longer wipes on an untrustworthy
read** (`ibkr.ts`, shipped in D34's commit `e87e4da`): `getPositions()` returns **`null`** on a failed or
non-array ("still loading") read, reconcile **bails when the `iserver` session isn't authenticated/connected**,
and it **never deletes positions on a `null` read** — only a successful array syncs (a genuine empty array =
a real flat account still clears; cash was already null-guarded). Verified live: a stubbed null read AND a
session-down reconcile both leave the mirror intact. (2) **the drawdown kill switch is now two-tick-confirmed** (`runner.ts` `checkDrawdown`) — the
threshold (`HARD.drawdownKillBps`) must breach for **two consecutive ticks** before the severe, sticky kill
switch engages (a "confirming" warning fires on the first breach). A single transient NAV misread — e.g. a
`reconcile()` blip that briefly drops a position — no longer halts the fund; a real drawdown persists and
still trips it. The counter resets on restart (errs toward not-halting). (3) The **daily-loss-pause baseline**
(`validator.ts` `dayPnlBps`) now anchors its day-open snapshot to `PAPER_INCEPTION` (never a pre-inception
sim 5k snapshot), matching the NAV-chart/Today windowing from the inception fix above. Guardrail changes are
humans-only by rule — both are Cam's.

### D34 — USD multi-currency: the fund holds USD, mirroring IBKR (Cam, 2026-06-17)
**Context:** GRQ now researches US names (10 USD candidates) but could only *trade* CAD — `isCadTradeable`
blocked USD listings from promotion, and the whole valuation/gate stack implicitly assumed one currency.
With `BROKER=ibkr-paper`, the IBKR account natively holds CAD **and** USD. **Decision (Cam):** the fund
holds USD, **mirroring IBKR** (option b — true multi-currency balances, NOT FX-at-execution), and US
trading is **enabled now**, mid-soak (Cam's call; materially changes the soaked system, so the clean-soak
clock may restart). **The §6 order gate + kill switch are unchanged and humans-only — only *valuation*
learned to convert.**
**What shipped:** (1) schema — `Account.usdCashCents` + `Position.currency` (additive, default CAD →
existing rows byte-identical). (2) **`lib/fx.ts`** — `toCadCents(cents, ccy, fx)` + `usdCadRate()` (the BoC
USD/CAD already in the macro feed); CAD passes through untouched. (3) **Valuation in CAD** — `portfolio.ts`
+ `sim.writeNavSnapshot` compute NAV = CAD cash + USD cash×fx + Σ positions(native ccy)×fx; `PortfolioView`
gains `cadCashCents`/`usdCashCents`/`fxUsdCad`, `cashCents` is now the CAD **total**, `PositionView` gains
`currency` + `marketValueCadCents`. (4) **Gate** — `validator.ts` converts the order's native value→CAD
before the position-size % and cash-floor checks (CAD names unchanged). (5) **Mirror** — `ibkr.ts`
`getCashByCurrency()` reads CAD+USD ledger, `getPositions()` tags currency, `reconcile()` writes both +
per-position currency, and **`conidFor()` picks the listing in the name's own currency** (USD→NYSE/NASDAQ,
CAD→Toronto). (6) **Unblock** — `isCadTradeable`→**`isTradeable`** (CAD or USD); promotion gate updated in
`promote.ts`, `sessions.ts`, `api/universe/route.ts`; agent self-invest/research/chat prompts updated so it
knows USD is tradeable. **Verified:** tsc clean; live NAV unchanged at **$25,010** (CAD-only backward-compat,
fresh images stale-checked). **Known follow-ups (cosmetic / paper-soak-OK):** the realized-P&L journal line
hardcodes "CAD" (a USD sell shows USD P&L mislabeled); the commission *estimate* in the validator uses the
CAD per-share model for US names (the real commission still comes from IBKR's fill); >2 currencies would
warrant a `CashBalance` table instead of a `usdCashCents` column. FX source = BoC; benchmark stays XIC (CAD).

### D35 — Intraday trading check-ins + agent self-scheduling (Cam, 2026-06-17)
**Context:** the agent wrote a detailed conditional morning plan ("deploy XIC core after the 2pm dot plot",
"buy ATD on a quiet down-day") but had **no way to act on it intraday**. The only trading-capable scheduled
session was boot-only (`runStartupUniverseReview`); the time-scheduled sessions (9:00 morning brief, 10:00
hunt, 12:30 midday brief, 16:15 EOD) are all research/report-only — the 12:30 brief is literally
`withTools:false`. The one decision session that can `propose_order` (`runMiddayCheckIn`) is gated behind
`evaluateTriggers`, which only fires on a **held position** moving ≥4% — dead while all-cash. Net: the plan's
afternoon entries could never execute on their own. **Decision (Cam):**
1. **Fixed intraday trading check-ins at 10:00 / 12:30 / 15:00 ET** (`CHECKIN_TIMES_ET`, `policy.ts`) — a new
   decision-capable session `runScheduledCheckin` (`sessions.ts`) that re-reads the standing game plan +
   focus + fresh quotes and acts on any live entry/exit condition (through the unchanged §6 gate), or stands
   down with a one-line note. Wired in `maybeScheduledSessions` (`runner.ts`) in a 60-min window so a
   same-slot research/brief runs first and the check-in falls through on a later tick (so 12:30 runs **after**
   the midday brief, 10:00 **after** the hunt). Restart-safe via a SYSTEM journal marker. **EXEMPT from the
   decision budget** (a short fixed list).
2. **Agent self-scheduling** — `schedule_checkin(at, reason)` / `list_scheduled` / `cancel_checkin` tools
   (`tools.ts`), backed by a new `AgentWakeup` model (`PENDING|FIRED|CANCELLED`). The morning plan can queue
   its own wake-up ("wake me 14:05 for the Fed"); the 12:30 check-in can revise it. `fireDueWakeups`
   (`runner.ts`) fires due PENDING wakeups during market hours, **drawing on the ad-hoc decision budget**,
   expiring any missed by >30 min (no stale fossil firings). Same-day + market-hours (9:30–16:00 ET) only for
   now; PENDING capped at `MAX_PENDING_WAKEUPS=6`. Pending wakeups surface in `buildContext` so each
   stateless cold-start session sees what it queued.
3. **Budget:** `maxDecisionSessionsPerDay` **4 → 6** — now the *ad-hoc* pool (held-position trigger
   escalations + self-scheduled wakeups); the 3 fixed check-ins don't draw on it.
**Guardrails unchanged & humans-only:** every order still clears the deterministic gate + kill switch +
daily-loss pause + warmup + first/last-15-min; check-ins only *propose*. **Verified:** tsc clean, Prisma
client regenerated. **Deploy:** `prisma db push` (additive: new `AgentWakeup` table + `WakeupStatus` enum) +
rebuild the `agent` container. **Follow-up (deferred, its own phase):** a "watcher" that notices a *non-held*
name starting to run (momentum/breakout/volume) and surfaces or auto-researches it — discussed, not built.

### D36 — Member identity: photos, career bios, and bull/bear mascots (Cam, 2026-06-17)
**Context:** the app referred to members only by first name ("Watched by Cam", a `name` string in the nav).
Cam supplied headshots + CVs for himself and Graham and wanted the fund to feel like *theirs* — faces, not
labels — plus an "about us." **Decision:** a single source of truth, **`lib/people.ts`** — each member's
photo (`/public/people/{cam,graham}.png`, 800×800) + a **plain-markdown career bio** (kept as text on
purpose — "AI-readable", reusable by the agent later) + `personByName()` to map a recorded name
(`addedBy`/`displayName`) back to their photo/bio. A reusable **`components/Avatar.tsx`** (circular photo,
initial-chip fallback) now renders identity everywhere:
- **Watchlist** — the "Watched by {name}" text became a **"Watched by" column** of circular headshots
  (`StockTable` `watcher` column); system/seed watchers show a dash (the `watchedBy()` sentinel filter).
- **NavBar** + **chat bubbles** (`ChatClient`) show the signed-in / authoring member's headshot.
- **Reports header** — a client **`PeopleBadges`** ("About us"): two avatars that open a career-summary
  dialog (theme-aware, bio rendered server-side via `<Md>` and passed in as a node).
- **Bull/bear mascots** — `RatingBar` gained `size="lg"` + `mascots` for the stock-page hero, flanking the
  7-point track with the bull (buy end) and **new `bear-splash` asset** (sell end); `bull-splash` pre-existed.
All photos sit behind the SSO middleware (not public). Web-only; no schema.

### D37 — The agent's observability + learning loop: conviction tally, durable lessons, live brief (Cam, 2026-06-17)
**Context:** on Fed day the 3pm check-in proposed FTS/CP and the **75% conviction gate** rejected both — its
*per-trade* thesis confidence (60–62%) sat well below its *standing dossier* confidence on the same names
(76–78%). We wanted to know: systematic under-confidence at the trigger, or a one-day Fed thing? Two gaps
surfaced: (1) conviction-gate rejections `refuse()` **before** the DECISION journal is written
(`validator.ts:104`), so the most interesting proposals weren't recorded anywhere structured; (2) the
check-in "banked a lesson" in prose but never wrote a real `LESSON`, so it wouldn't compound. **Decision —
three parts, all humans-curated, none touching the §6 gate:**
1. **Conviction tally** — new **`TradeProposal`** model + logging at the `propose_order` boundary
   (`tools.ts`, best-effort/try-catch so it never blocks a trade) capturing **every** proposal incl.
   conviction-gate rejections: per-trade confidence beside the latest **dossier** confidence/stance, the gate
   verdict + reason, and the **price at proposal** (to retro later whether waiting paid off). Surfaced on a new
   **Reports → Conviction** tab (table + summary: BUY count, % clearing the 75% gate, avg gap). Empty until
   the next proposal — pre-existing rejections predate the logging.
2. **Durable lesson banking** — the scheduled + triggered check-in prompts (`sessions.ts`) now also
   `write_journal(kind:"LESSON")` **when** a genuinely durable, reusable pattern emerges (gated: "most
   check-ins won't earn one"). A real LESSON shows on **Reports → Lessons** *and* is re-read before every
   future decision (`context.ts` "Lessons learned" block) — so it compounds, unlike prose. (Prior LESSON
   count: 0 — the system existed but only retros/weekly were prompted to use it.)
3. **Live brief rollforward** — the **Portfolio** page's "latest briefing" slot now includes the intraday
   **check-in** notes (titled `Check-in — …`), so the tab shows the agent's *current* read (morning plan →
   check-ins → EOD), not just the morning Game plan.
**Verified:** tsc clean; `TradeProposal` table pushed; web + agent rebuilt, fresh images stale-checked.
**Watching:** if the per-trade-vs-dossier gap stays persistently negative, it's a calibration issue (the
fund's real risk is under-deployment vs XIC, not bad picks) — the tally is how we'll tell.
