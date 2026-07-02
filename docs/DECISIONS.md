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
> **Superseded by D78 (2026-06-25):** promotion is now SINGLE-ACTOR — any member or the
> agent may promote, gated only by the automated screen. The rest of D16 stands.

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
  tradeable needs the liquidity screen (single-actor since D78 — any member or the agent; was
  two-person); non-Canadian listings are research-only until multi-currency.
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

### D38 — The Hunt goes two-way: directed (briefed) hunts + surfaced obscurity (Cam, 2026-06-18)
**Context:** The Hunt was push-only — the agent picked the theme and members could only `↻ refresh`
(broad) or `✕ dismiss`. Cam wanted **pull**: keep the general dashboard, but be able to *brief* the hunt
in plain English ("emerging medical names about to post trial data"). Second ask: **surface obscurity** —
the page computed an `obscurity` number per card but never showed or sorted by it, and derived it from
`tier` (null for ~all hunt finds, so meaningless). **Decision — research-only, touches no order path:**
1. **Directed hunt** — a member's brief flows to the agent via a new `AgentState.huntBrief` (same
   flag-on-state pattern as `huntRequestedAt`; web/alpine can't run a Claude session). The `HuntBar`
   component POSTs `{brief}` to `/api/hunt/refresh`; the runner reads it and calls `runDiscoveryHunt(brief)`,
   which prepends a FOCUS block making the brief the primary filter while keeping the under-the-radar,
   leads-not-verdicts framing. `huntBrief` persists as the record powering the page's "🎯 Directed hunt"
   banner; a blank refresh and the daily 10:00 broad hunt clear it. Latest submit wins.
2. **Reach correction** — the hunt prompt said "Canadian-listed only," but the fund holds **CAD + USD**
   (D34) and trades CA (TSX/TSX-V/CSE/NEO) + US (NYSE/Nasdaq). Reframed to range across **North America**,
   prefer tradeable names, allow ~2 clearly-flagged foreign leads. (The "CAD-only" rule is just the agent's
   narrow self-promotion path in `agent/promote.ts` — not a fund-wide constraint.)
3. **Agent-scored obscurity** — new `JournalEntry.obscurity` (1–5; 5 = a deep cut almost nobody covers),
   emitted via `write_journal` on each hunt find. Shown as an amber obscurity badge on the `IdeaCard`
   (discovery mode) and used to **sort finds obscure-first** (stable, recency tiebreak), replacing the
   defunct tier proxy.
**Verified:** tsc clean; `huntBrief`/`obscurity` columns pushed; web + agent rebuilt + fresh-image
stale-checked (new strings confirmed in both images); API write-path tested end-to-end (brief stored →
read back → cleared, no session triggered). The two earlier UI tweaks shipped in the same build: the new
red **bear** on the bull/bear `RatingBar` (`IMG_9624.png` → transparent `bear-splash.png`) and the
Watchlist "Watched by" → **"Added by"** column moved to the far right with the Retire action as a bare ✕.
**Out of scope (v1):** saved/named hunt "channels", per-find brief tagging in the DB (the banner covers
provenance), market-cap/coverage enrichment for obscurity (the agent score is the source of truth).

### D39 — Agent active-deployment mandate + IBKR reconcile/snapshot fixes (Cam, 2026-06-18)
**Context:** The agent was chronically under-deploying — ~87% cash, re-chewing the same ~5 rate-sensitive
blue chips, defaulting to an XIC ballast add, and standing down whenever nothing cleared. Cam's framing:
day-to-day performance is NOT the goal, month-over-month is; the fund can't learn without taking real
positions, and making a trade and being wrong is acceptable. The risk dial was already AGGRESSIVE (0% cash
floor) — so the dial was never the constraint; the dial is a *ceiling, not a floor*, and nothing forces
deployment. The brakes were (a) the agent's cash-praising disposition in the prompts and (b) it only ever
looking at its short focus list. **Decision — prompts only; the §6 gate and the 75% conviction bar are
UNCHANGED** (Cam, explicitly: keep the bar honest — if the few watched names don't clear it, research MORE
names until something does; there's almost always a setup that passes; cash is earned after a wide look or
a clear risk-off tape, not as a reflex):
1. **PERSONA flipped** to active-manager / "put the fund to work": month-over-month is the scorecard,
   day-to-day P&L is noise, a wrong trade is tuition, chronic under-deployment is the failure mode, "ahead
   of XIC while in cash" is not a win. Never inflate conviction to clear a gate.
2. **Morning research — "WIDEN IF THIN":** when the ACTIVE universe + watchlist don't offer enough ≥75
   setups, hunt market-wide (WebSearch) and self-promote, instead of re-chewing the same names.
3. **Both check-ins** (scheduled + event): the game plan is a HYPOTHESIS, not a contract — the agent may
   revise or scrap it intraday on new information, not just execute the morning plan ("markets change").
4. **`SELF_INVEST.maxPerRollingWeek` 2 → 5 → 25** (same-day: 5 was still too tight once the wider hunt
   started surfacing more real ≥75 ideas than that — AC/COST/DAL got blocked) so names it researches
   actually reach its tradeable universe. Still bounded by `maxUniverseSize` (60) and the dial's
   `maxNewTradesPerWeek` BUY cap (the next ceiling).
**Result same day:** the boot review self-promoted SLF/NVDA/TSM (a regime barbell), bought SLF + IFC,
passed NVDA honestly (conviction 72 < 75, up not at its dip entry) and passed the XIC ballast add (68 < 75)
— deploying *with* discipline, exactly the intent.

**Reconcile bug the soak caught (+ two fixes).** A name self-promoted mid-session (SLF) was bought and
**filled at IBKR but never mirrored into the `Position` table** → NAV understated by the purchase amount →
a phantom −5.8% day → a **FALSE daily-loss pause** that blocked the rest of the plan. Root cause, two
compounding issues: **(a)** `getBroker()` returns a NEW `IBKRBroker` per call, so the order path
(`validator.ts`) and the runner's per-tick reconcile (`runner.ts`) hold *separate* conid caches; **(b)**
`reconcile()` warmed the conid→symbol map only once (`if size===0`), so a symbol promoted AFTER boot never
entered the long-lived runner instance's map and `getPositions()` silently skipped its real IBKR position
(ibkr.ts "not one of ours"). Compounded by the post-fill `writeNavSnapshot` running before IBKR's positions
ledger caught up (~a few-second lag) → every fill left a transient cash-only dip in the NAV tape.
- **Fix 1:** `reconcile()` now warms conids for EVERY active symbol each tick (resolving only the missing
  ones — `conidFor` short-circuits on cached, so it's cheap), so post-boot promotions mirror on the next tick.
- **Fix 2:** the synchronous fill path reconciles in a short retry loop until the bought position actually
  appears in the mirror, THEN snapshots — so the ledger and the tape reflect the trade, not a transient
  understated state (sells skip the wait — they never understate NAV).
- **Cleanup:** deleted the two glitch `NavSnapshot` rows (the cash-only cliff + the IFC-unmarked dip). The
  fund was ~flat all day; the "drop" was never real money, just a marking artifact.
**Verified:** tsc clean; agent rebuilt + fresh-image stale-checked (new strings confirmed in the image);
live — XIC/SLF/IFC all mirrored, NAV ~$24,950, dayPnlBps −5, the false pause cleared.
**Follow-ups (not done):** make `getBroker()` a singleton so the order + tick paths share one conid cache
(the reconcile fix neutralizes the impact, but the duplicate-instance smell remains); slow PENDING fills
still wait for an idle reconcile tick (the synchronous path is now self-correcting).

**Same-day hardening (2026-06-18, after the above shipped):**
- **Daily-loss pause → 2-tick confirm.** The reconcile gap above also tripped the daily-loss pause: the BUY
  gate evaluated `isDailyLossPaused()` live on each order, so a single transiently-understated NAV (cash out
  for a fill, position not yet mirrored) read ≤ −3% and BLOCKED trading — hit twice (SLF, then AC as a
  resting-limit slow-fill resolved via `finalizePending`, a path the synchronous retry-fix above didn't
  cover). Fix: the pause is now a CONFIRMED, sticky-for-the-day flag set only after the loss persists across
  TWO consecutive ticks (mirrors the drawdown kill's existing 2-tick confirm). `validator.isDailyLossPaused()`
  reads the flag (`setDailyLossPauseConfirmed`), not a live recompute; `runner.checkDailyLossPause` counts
  consecutive breaching ticks, resets on a healthy reading, scoped to the ET day. A real −3% day persists and
  still pauses; a one-tick marking blip never does. In-memory, resets-on-restart toward not-halting (same as
  the drawdown counter). Commit `2873feb`.
- **PERSONA — research is always on tap.** Standing principle added: the agent may research / write a dossier
  / `add_candidate` to the watchlist anytime, in any session; and when it wants to act but the dossier isn't
  ready, `add_candidate` + `schedule_checkin` a return rather than dropping the idea or rushing a thesis.
  Commit `f0949a1`.
- **Self-promotion cap 5 → 25** — the wider hunt out-produced 5/wk (AC/COST/DAL got blocked). Commit `70545b4`.
- **Stale lesson deleted** — the agent had banked "pace the 5/week promotion cap, don't spend it early"; its
  scarcity premise died with the cap raise and it fought the deployment mandate, so it was removed.

**Incident (2026-06-18) — repeated agent rebuilds filled `/var` → db crash.** Iterating with many
`docker-compose build agent` cycles in one session pushed `/var` to 100%; postgres crash-looped on a
checkpoint write ("No space left on device"). Recovered via `docker image prune -f` (no data loss); positions
intact. Lesson: the `agent`/`chat` images are ~3.57GB each (no multi-stage trim, unlike `web` at 266MB), so
rapid rebuilds are disk-expensive on this chronically-full shared host. BATCH changes into ONE build; after a
build always swap (`up -d`) then `docker image prune -f` BEFORE the next build; never run two builds against a
tight `/var`. See the CLAUDE.md disk gotcha.

### D40 — Daily session cadence: hourly check-ins + noon midday brief (Cam, 2026-06-18)
**Change:** Intraday trading check-ins go from 10:00/12:30/15:00 to **hourly** — but noon is reserved for the
**midday brief**, not a check-in. Full day: **9:00 morning plan** ("open") → **10:00 / 11:00 check-ins** →
**12:00 midday brief** (the readable lunch summary, `runMiddayReport`) → **13:00 / 14:00 / 15:00 check-ins**
→ **16:15 EOD brief** ("close"). `CHECKIN_TIMES_ET = [10,11,13,14,15]`; the standalone 12:30 midday brief
moved to noon. **Why:** denser intraday coverage so the agent reacts to the tape more often, while keeping a
human-readable midday digest at lunch rather than a 6th decision session. Check-ins stay EXEMPT from
`maxDecisionSessionsPerDay`, and the existing 60-min check-in windows already yield to same-slot research
(the 10:00 hunt, 11:00 smart-money) so nothing collides. **Verified:** tsc clean; agent rebuilt + new
`CHECKIN_TIMES_ET` + noon-brief block confirmed in the image; deployed (one careful build, `/var` watched —
no db crash). Takes effect next market day.

### D41 — Per-day report page: the full daily narrative (Cam, 2026-06-18)
**Context:** Intraday check-ins and the midday brief are `JournalEntry` rows that only ever surfaced as
the single latest "live brief" on the Portfolio page — once superseded they vanished from the UI. The
Reports **Daily** tab paired only the morning Game plan + EOD close (each behind an inline "read all")
and omitted the intraday narrative entirely. **Change:** new route **`/reports/day/[date]`** that
aggregates the whole day — **Morning plan** (open), **Intraday updates** (all check-ins + the midday
brief, chronological, each its own collapsible `<details>`), and **The close** (open, with stats).
Reached via a **"View report →"** button: the Daily tab cards are now compact (day label + an
intraday-count chip + one-line plan/close previews) instead of inline read-all, and the Portfolio brief
gained a **"View full day →"** link (to the day of the current brief). `Stats`/`parseStats` lifted to
`components/ReportStats.tsx` (shared by both). Date-keyed (not `/reports/[id]`) because a day spans
JournalEntries + the EOD `Report`; SSR `<details>` (no JS); reuses the `?d=` day-window pattern
(`startOfEtDay`). **Verified:** tsc clean; web rebuilt + deployed (one careful build, `/var` watched, no
crash); `/reports/day/2026-06-18` renders all three sections with 14 check-ins + the midday brief; the
Daily tab shows the View-report buttons.

### D42 — iOS IA-v5 rebuild + mobile API expansion + Bearer-skips-SSO at the edge (Cam, 2026-06-19)
**Context:** The native app was frozen at IA-v2 (tabs Today · Watchlist · Portfolio · Ideas · Settings;
the retired word-stance; mock actions) while the web moved to IA-v5 (The Hunt · Smart Money · Chat · the
7-point rating · rich dossiers · new branding). The mobile API served only 6 read endpoints, and nginx's
mobile bypass forwarded only those 6 — so any new route fell through to the SSO `location /`, which wants
the oauth2 *cookie*; the app sends a *Bearer*, so new routes 302'd to login (the "hunt is quiet" bug).
**Change (three layers):**
- **iOS (client, blind-authored on Linux; builds on the Mac):** full rebuild to a 5-tab shell with **The
  Hunt dead-center as the default tab** ("scrollable Instagram of stocks"), a **Markets hub** (Watchlist ·
  Universe · Browse · Smart Money), the rich **dossier** (RatingBar + bull/bear mascots, status, bottom
  line, fundamentals, lazy earnings/grades, member controls), streaming **Chat** (SSE over
  `URLSession.bytes`), Face-ID-gated member writes, and a **top-right chat button on every screen** (the
  bottom FAB was undiscoverable). Rebrand: real logo/mascots/photos bundled; the **app icon is now the
  teal bull** (`AppIcon-1024.png` composited from `bull-splash.png`). New fields are Optional so the app
  keeps decoding today's payloads. Docs: `IOS-REBUILD-PLAN.md` (the plan + Appendix A), `IOS-BUILD-LOG.md`.
- **Mobile API (web):** `lib/feed.ts` gained `rating` (7-point, from `stance.ts`) + `logoUrl` across
  market/ideas/portfolio/today/dossier, folded the live **indices** strip into `todayResponse`, enriched
  the dossier (status/watch/recLabel+pos/bottomLine/researching/directive/peRatio), and added builders +
  routes for **`/api/hunt`, `/api/smart-money`, `/api/reports`(+`/day/[date]`)**. `middleware.ts` now
  admits the mobile reads **and** member writes (chat, killswitch, universe, stocks/directive, note) for
  a Bearer (they self-guard via `memberFromRequest`; the §6 order gate is unchanged).
- **Edge (infra `nginx/conf.d/29-grq.conf`):** a `map $http_authorization $grq_has_bearer` + a one-line
  `if ($grq_has_bearer) { return 200; }` in grq's internal `= /oauth2/auth` lets **any Bearer-bearing
  request skip the SSO subrequest** — the app server then *cryptographically verifies* the GRQ-JWT and
  rejects bad ones, so this fixes EVERY mobile route at once without enumerating each, and **without
  weakening the browser cookie path** (no Bearer → full SSO). Scoped to grq's server block; other apps on
  the shared proxy are untouched. (This was the long-pending P0.5 nginx step; it touches the shared auth
  gate, so a human applies it — the agent's auto-mode classifier blocks it by design.)
**Verified:** `tsc --noEmit` clean; `web` rebuilt (image checked fresh, not a stale bake), deployed,
`/var` steady at 73%, agent/ibeam untouched. Live smoke (header path): hunt 12 finds + brief, smart-money
5 portfolios + leaderboards, today 6 indices + logos, market `rating`+`logoUrl`, dossier enrichment,
extras (earnings/grades), reports, chat history. After the nginx reload, the **fake-Bearer probe flipped
`/api/hunt` 302→403** (reaches the app, rejects the bad token) while `/` no-auth stayed 302 and `/`
fake-Bearer returned 403 — fix confirmed, no SSO regression. The hunt populates on the *existing* installed
build (server-side fix); the bull icon + top-right chat button need a Mac rebuild.

### D43 — Stock-page + watchlist UI pass: the held-position bracket, interactive price chart, analyst targets (Cam, 2026-06-19)
**Context:** A run of read-the-data-we-already-have refinements — the stock page surfaced an upside % but
never the analyst *target prices*; the deterministic stop/take-profit were enforced in code (`enforceExits`)
but invisible; the price history was a static 1-line squiggle; the watchlist showed today's % but not the
dollar move. **Change (all UI; no schema, no agent-logic):**
- **Held-position row** now shows the full "what happens next" as one dense single-line strip (4–8 equal
  columns via `grid-flow-col`/`auto-cols-fr`, 2-up phones / 4-up tablets): qty · ACB · market value ·
  unrealized P&L · **Auto-stop** (`ACB×(1−stopPct)`) · **Take-profit** (`ACB×(1+takeProfitPct)`, pulled from
  `DIALS[riskLevel]` so they're the *real* enforced levels) · **near + 12-mo targets** (dossier). New
  `StatCard compact` variant (tighter pad + `text-base`) so 8 fit one line.
- **Interactive price chart** (`components/PriceChart.tsx`, client): timeframe picker **1M/3M/6M/YTD/1Y**
  (client-side slice of the already-loaded ~1y of daily closes — no refetch; multi-year would need a one-time
  `refreshBars(all,"max")`), a **hover tooltip + crosshair** snapping to the nearest session (price + date),
  and a **round HTML dot** — the dot is *not* an SVG `<circle>` because the chart's `preserveAspectRatio="none"`
  stretch ovals a circle (`non-scaling-stroke` only fixes strokes). The lightweight `Sparkline` (with a new
  `className` prop) still backs the **stock-header "tape" backdrop**.
- **Analyst card:** the buy/hold/sell distribution bar **flipped to sell→hold→buy** (bearish→bullish L→R) +
  matching legend, and now surfaces the captured **price target** (`fmpAnalystTarget` already returns
  consensus/high/low) as a **range bar with a "now" marker** — "now" derived from `consensus/(1+upside)` so it
  shares the analyst's currency (US$ targets on a CA name stay self-consistent); domain stretches to fit "now"
  if it sits outside low–high.
- **Bottom line:** the bull/bear `RatingBar` moved from the action row down under the GRQ's-call word.
- **Layout:** institutional/scoreboard/earnings/analyst row hoisted above Valuation-vs-peers.
- **Watchlist/Universe:** the shared `StockTable` **Day** column now shows the **$ move beside the %**
  (derived: `last − last/(1+day%)`).
- **Smart Money:** every ticker now links to its stock page (was: only universe overlaps) and the page
  **auto-research-queues** the names it surfaces (`lib/hunt.ts` `queueDossiers`, `requestedBy:"smart-money"`,
  capped 12/render so it can't flood the queue; added to the runner's alert-exclusion list).
- **LiveQuote:** a `live` marker now shows **"live · Ns ago"** ticking from the last successful fetch, going
  amber/"stale" past ~8s so the badge can't claim live while a poll has silently frozen.
- **Portfolio tab:** positions above the agent brief; brief defaults open (`CollapsibleMd defaultOpen`).
- **Settings:** the IBKR-paper roadmap step crossed out ("plumbing proven & live-firing"; the soak is the
  gate to the Live step, unchanged).
**Verified:** `tsc --noEmit` clean throughout; `web` rebuilt (image checked fresh), deployed, `/var` steady
at 73%, agent/ibeam untouched. Shipped together with D42's iOS-API tree in one web image (Cam's call).

### D44 — Web UI polish pass + smart-money auto-research-on-publish (Cam, 2026-06-19)
**Context:** A rapid review round of small, surgical fixes to the live web app, plus one feature. All
verified live (LAN member-header curls) and shipped across three commits (`d45446b`, `2ee86c2`, `ba13bba`).
**Change:**
- **Stock page** (`app/stocks/[symbol]/page.tsx` + `DirectiveButtons`/`AskGrq`): the `live · Ns ago`
  freshness marker now stacks **below** the price (`flex-col`); a held name's **position bracket + the
  agent note** moved **above** the institutional/scoreboard row (then valuation vs peers); the hunt-find
  (not-tracked) dossier **defaults open** (`CollapsibleMd defaultOpen`); pin / block / Ask GRQ resized to
  match research-now / demote (`px-2 py-1 text-[11px] font-semibold`) so the action row is one size.
- **Universe/Watchlist** (`StockTable` + the two pages): **column headers centered**; the **Signals** and
  **Journal** columns removed (row data kept — `StockTable` still uses signals for the call-rating
  fallback + expand panel), and the now-orphaned Signals legend trimmed from both footnotes.
- **Today / GRQ Daily** (`app/page.tsx`): dropped the redundant inline **bull** beside "GRQ Daily" (the
  NavBar already carries the logo), the **top rule** above the masthead, the **💡** on "Did you know?",
  and the **NAV figure** (kept the day-move). **The Tape bug:** it showed "Flat line — parked in cash"
  whenever there were `< 2` NAV snapshots today (sparse on a closed-market day) **even while the fund holds
  positions** — now the tape **closes on the live NAV** so it always draws open→now when there's an open
  snapshot, and the rare empty-state copy is honest about held positions (no false "cash").
- **Smart Money auto-research** (`agent/sessions.ts` `runSmartMoneyScan`): once the daily scan **publishes
  its report**, it now `queueDossiers(...)` a **full dossier for every surfaced name** (congress + funds +
  insiders + every tracked-portfolio holding), idempotent (skips tracked/queued/researched), cap 100 so the
  whole board gets researched, not a 12-name sample. Complements the existing page-visit queueing.
**Verified:** `tsc --noEmit` clean; `web` + `agent` rebuilt one at a time (`/var` watched, 73→77%, ibeam
untouched, agent rebooted clean and working the research queue). Live: centered headers, no Signals/Journal
columns, tape renders an `<svg>` (no "parked in cash"), masthead cleaned, buttons one size.

### D45 — "The Hunt" redesign: heat-ranked feed, three layouts, real logos (Cam, 2026-06-19)
**Context:** A design handoff (`design_handoff_the_hunt/`) reimagined The Hunt (`/market`) from a flat
2-column `IdeaCard` grid into a higher-energy, **heat-ranked** discovery feed with live data-viz. Cam's
direction: use GRQ's **existing styling system** (teal Tailwind v4 tokens, current fonts, light+dark — no
new web fonts, no dark-only island) but adopt the **design's architecture**; surface that a briefed hunt
**takes time** (the agent runs it async over a minute or two) by marking current results stale and checking
for fresh ones; add **real company logos + links**; and ship **all three** prototype layouts behind a real
switcher. Web-only — heat is *derived*, so no schema field, no `write_journal`/agent-prompt change, no agent
image rebuild (avoids the tight-`/var` agent-rebuild hazard).
**Change:**
- **Heat** (`lib/heat.ts`) — a derived 0–100 "ready to pop" score (`computeHeat`): blends the agent's
  conviction (`confidence`), 30-day price momentum (from daily bars), and `obscurity`, renormalizing when an
  input is missing. `heatColor(h)` is a theme-agnostic oklch hue-sweep (teal→amber) that drives the rank
  number, meter fill, and left rail. Explained on screen via a "how heat is scored" tooltip (literacy
  pillar). Heat ranks the board; #1 gets the HOTTEST badge.
- **Three layouts behind a persisted switcher** (`components/hunt/HuntResults.tsx`, client,
  `localStorage` `grq-hunt-view`): **A Heat Board** (`HuntRow` — ranked rows: rank, identity, thesis
  clamp+read-all, sparkline, heat meter, confidence gauge, watch/dismiss), **B Top Pick** (`HuntHero` big
  #1 card + big 30-day area chart + 92px gauge, over a `HuntGridCard` 3-col grid), **C Scanner**
  (`ScannerTable` dense terminal table). Shared SVG pieces: `ConfidenceGauge`, `HeatMeter` (theme tokens).
- **Hero hunt bar** (`HuntBar.tsx`) — gradient-bordered panel, ⌖ tile, big input, ⚡ HUNT, in teal tokens;
  copy sets the "lands in a minute or two — we check automatically" expectation.
- **Pending / stale-results** (`components/hunt/HuntStatus.tsx` + `GET /api/hunt/status`) — a briefed/
  refreshed hunt fires a `grq-hunt-submitted` event; HuntStatus shows a working banner, flags the current
  results as "from your previous run," and **auto-polls** anchored on the newest "Hunt dossier" timestamp
  (NOT the `huntRequestedAt` flag — the runner clears that at the *start* of the multi-minute run), then
  `router.refresh()`es when fresh names land. `sessionStorage` survives reloads; gives up after 5 min;
  honors reduced-motion.
- **Real logos + links** (`lib/logos.ts` `fmpLogo`) — FMP's ticker-keyed image (US + CA listings, no key,
  404→monogram fallback) for untracked finds; logo, ticker, and name all link to the dossier.
- **`toYahoo()` fix** (`lib/universe.ts`) — the untracked-symbol fallback was forcing every ticker onto
  `.TO` and mangling already-suffixed ones (`VCM.TO`→`VCM-TO.TO`), so US small-caps + CA finds got no
  bars/quotes/logos. Now: an already-qualified listing is trusted as-is, a bare ticker is treated as US.
  Took the feed's sparkline coverage from **1/12 → 12/12**. Only the untracked path changed (tracked names
  carry `.yahoo` and skip the fallback), so quotes/bars/`/api/quotes` are unaffected for tracked names.
- Reusable additions: `Sparkline` gained an `area` fill (hero chart); `WatchButton` an `iconOnly` mode
  (dense grid/table).
**Verified:** `tsc --noEmit` clean; local `next build` + `docker-compose build web` clean, fresh image
checked for new code before swap (CLAUDE.md stale-bake guard), `/var` steady at 73%. Live (member-header
curls, light theme): heat-ranked rows, HOTTEST badge, 12 sparklines, 36 FMP logos, all three switcher tabs;
`/api/hunt/status` returns the brief/latest. **Caveat:** layouts B/C mount client-side on tab click and
weren't driven in a live browser here — worth a click-through.

### D46 — On-demand hunt dossiers + stock-page panel consistency + Browse "Research" (Cam, 2026-06-19)
**Context:** A long UI-iteration session over the stock page, Universe/Watchlist tables, and Browse, plus a
question about hunt cost. The hunt was researching every find **twice**: the hunt session writes a lead
("Hunt dossier — TICKER") *and* `runDiscoveryHunt` auto-queued a separate full "Dossier — TICKER" for all
8–12 finds (D30). Cam: run the hunt's lead pass all at once (as now), but make the **full dossier on-demand** —
"clicking a find kicks off the dossier."
**Change:**
- **On-demand hunt dossiers.** `runDiscoveryHunt` no longer loops `queueHuntDossier` over its finds (the
  per-find auto-queue + its `startedAt`/import were removed). Instead the **not-in-universe stock page**
  (`app/stocks/[symbol]/page.tsx`) auto-creates the `researchRequest` when a **member** opens a find that has a
  lead but no full "Dossier —" and nothing in flight (idempotent; viewers just read). New `fullDossierPending`
  state → a "full dossier researching…" chip + CTA copy. Mirrors the existing Today-queues-movers precedent.
  Saves ~8–12 redundant Opus passes per hunt. (Agent + web change → both images rebuilt.)
- **Browse = Research, not just Watch** (`components/ResearchButton.tsx`, `/api/universe` `research` action now
  handles **untracked** names by keying on `bareTicker`, ahead of the not-tracked guard). Per row: **Research**
  (kicks a dossier without adding it anywhere) → **Researching…** → **View dossier** (the same pattern for any
  already-researched name). Watch stays as the secondary action.
- **Stock-page panel consistency** — every data panel renders on every page (CA/US, held/not); dark FMP feeds
  show an honest "no data because…" (`PanelEmpty`) instead of vanishing. Panels row is **5-wide**: Analyst
  ratings · **Price targets** (split out, larger then re-sized to match the held-row StatCards) · Institutional
  · **Signals** (swapped up from below; fonts shrunk to match the row; "as of" date dropped) · Earnings. The
  **Scoreboard** moved down beside Valuation-vs-peers, whose title moved **out** of the card to an `<h2>` like
  the rest. **Last-researched timestamp** under the price in the header.
- **Price targets re-anchored** for CDRs/cross-listings (`AAPL.NE`, `TD.TO`): FMP returns the **US** target in
  USD off the bare ticker; the upside % is scale-invariant, so targets are rescaled to **this listing's own
  live price + currency** with a footnote — fixes a USD target shown against a CAD page.
- **Universe "Researched"** column falls back to the dossier's own `at` when there's no DONE `researchRequest`
  (AC showed "—"). **Day column** on Universe/Watchlist stacked to match the design: ↗/↘ + $ change over (%).
**Verified:** `tsc --noEmit` clean; web + agent images built, fresh-image string-checked before swap, pruned;
`/var` ~74%. Live curls: Browse Research/View-dossier/Watch buttons, TD targets in CA$, header timestamp,
Valuation `<h2>`, Day arrows; agent rebooted clean. **Caveat:** didn't fire a live on-demand dossier (spends an
Opus session) — path is render-verified only.

### D47 — Thesis-axis diversification promoted to a standing PERSONA rule (Cam, 2026-06-21)
**Context:** The 2026-06-21 weekly review (`Report` id 8) flagged that three of the book's six names
(IFC/SLF/TD) are really *one* macro bet — higher-for-longer rates — and proposed (§4) keeping "a minimum of
2–3 independent thesis axes live as a soft internal rule." It was already banked as LESSON #2 ("diversify the
thesis, not the tickers"); Cam approved promoting it from a re-read lesson to a standing mandate rule.
**Change:** Added an Operating-principles bullet to `PERSONA` in `web/agent/sessions.ts` — count *independent
thesis axes* (rates / secular compounders / idiosyncratic catalysts / index ballast / commodity), not symbols;
keep ≥2–3 live whenever the book holds more than a couple of names; name single-factor concentration out loud
as it drifts. This is **disposition/guidance, not a code-enforced gate** — the §6 validator and the 75%
conviction bar are unchanged; it shapes what the agent *proposes*, never what the gate *allows*. The other §4
proposals: "deploy more cash" already matched config (dial is AGGRESSIVE + D39 mandate — the 75% bar, not
policy, is the brake), L dossier re-research kicked by Cam (the prior dossier had a sign-flipped CPI error),
capital rec HOLD accepted (no contribute/withdraw).
**Verified:** edit string-checked inside `grq_agent:latest` before swap (`grep 'Diversify the THESIS'`); agent
rebuilt (only `agent`, not `chat` — PERSONA is decision-session only), fresh image confirmed, swapped, old
layers pruned (1.7GB); `/var` 77%, 14G free. Agent rebooted clean — `/api/health` heartbeat ticking, mid
startup-universe-review on Opus 4.8.

### D48 — Weekly review moves to Saturday 09:00 + lands on the portfolio page all weekend (Cam, 2026-06-21)
**Context:** Cam wanted the weekly deep review to run Saturday 09:00 ET (was Sunday 10:00) and to surface in the
portfolio page's briefing slot — taking over from Friday's EOD close — and *stay* there across the weekend until
Monday's 9:00 game plan supersedes it.
**Change:**
- **Schedule:** `runner.ts` weekly-review trigger `p.weekday === 0 && m >= 10*60` → `p.weekday === 6 && m >= 9*60`
  (Sat=6). Dedupe switched from a 6-day `createdAt` window to "a WEEKLY already dated today" (`date: dayStart`,
  mirroring the EOD guard) — the 6-day window would have *blocked* the first Saturday run, since the prior weekly
  (Sun, 6 days earlier) still fell inside it. The Saturday 02:00 full-universe dossier refresh now has ~7h (not
  ~32h) to finish before the review; one-at-a-time at ~5–10 min/dossier over ~30 names clears well before 09:00.
- **Portfolio surfacing:** the page's single "latest briefing" slot already shows the newest of
  morning-plan/midday/check-in/EOD by timestamp. Added the latest `WEEKLY` report as a candidate (kicker
  "Weekly Review · the week in receipts", `at = createdAt`, link → `/reports/[id]` with a "View full review" CTA;
  the day-based briefs keep their `/reports/day/[date]` "View full day" link). Newest-wins does the rest: the
  Saturday review is newest through the weekend (no weekend plan/EOD), and Monday's 9:00 game plan naturally
  reclaims the slot. No new schema/flag.
- **Copy/comments:** retired the now-stale "Sunday" references (reports hub page user copy ×3; runner/universe
  refresh comments + the weekly-refresh log/alert; AGENT-SPEC, PHASES, SYSTEM-OVERVIEW docs).
**Verified:** `tsc --noEmit` clean. web + agent images rebuilt one-at-a-time, fresh-image string-checked before
each swap (`week in receipts` in `portfolio/page.js`; `p.weekday === 6` in `runner.ts`), pruned between; `/var`
77%, 14G free; agent rebooted clean (heartbeat ticking). Live curl of `/portfolio` (today, Sun) shows the
weekly review in the slot with the "View full review →" CTA and no competing brief. **Caveat:** the Saturday-09:00
*firing* itself can't be verified until 2026-06-27 — only the schedule predicate + surfacing are tested today. A
later web rebuild shipped the "Sunday"→"Saturday" copy fixes; the agent's internal comment/log text changes ride
the next functional agent build (non-functional, no behavior impact).

### D49 — Dossier-freshness hardening: self-promotion needs a real dossier + gated daily refresh (Cam, 2026-06-21)
**Context:** Investigating why the 2026-06-21 weekly review flagged L's dossier as stale surfaced a real failure,
not staleness. L sat a standing ~62 HOLD on every dossier *except* a thin 1,523-char one the agent dashed off at
04:18 the instant it self-promoted L back after a Cam demote — that one read the BoC CPI feed as "**−2.7%
deflation**" (a sign-flip of the correct **+2.8%** feed), reframed deflation as a grocer-margin tailwind, and
scored **Buy 77** — clearing the 75 self-promotion bar **on bad data**. The next clean pipeline dossier reverted
it to 63. So a thin, un-cross-checked inline dossier poisoned the conviction bar (a guardrail input) and made a
name tradeable. Separately: the weekly review reported L off that *remembered* error even though the 06-20
refresh had already corrected it (it was never actually "parked"), and the universe is only re-researched
**weekly** (Saturday) — so a bad/stale dossier can anchor decisions for up to ~7 days.
**Change (agent-only, one rebuild):**
- **Self-promotion needs a completed pipeline dossier** (`promote.ts agentSelfPromote`). The conviction dossier
  must be backed by a `DONE` researchRequest completing alongside it — an inline same-session note no longer
  counts. No backing pass → it queues a full dossier and **defers** (the agent comes back via `schedule_checkin`).
  Encodes the persona's own "decide with the finished dossier in front of you" rule. (Would've blocked L's 77.)
- **Gated daily refresh** (`runner.ts maybeDailyRefreshEnqueue`, pre-market 05:00–09:00 ET, market days, once/day):
  **held positions re-dossier every day**; other tracked names only when their dossier is **stale >18h AND the
  name moved ≥4%** (`Quote.dayChangeBps`) — so a Tuesday catalyst gets a same-day refresh without burning an Opus
  pass on every quiet name. Deterministic gates, no extra LLM call. The Saturday full refresh stays as the
  every-name backstop. Knobs are tunable consts (`DAILY_REFRESH_*`). Skips weekends/holidays.
- **Weekly-review prompt nudge** (`sessions.ts`): grade open theses against the *current* dossier; don't flag a
  "refresh" without confirming the issue still exists.
- **Lesson #1 corrected** (DB `JournalEntry` id 1216 — re-read before every decision): reframed L's error as a
  *structured-feed sign-flip* (not a web scrape), dropped the false "L is parked," and added the completed-dossier
  rule. Data edit, not code.
- **Dead `rotation` code removed** (the 3/day rotation was killed 2026-06-12; only a vestigial default arg +
  no-alert check remained — the latter now silences the new `daily-refresh` source instead).
**Verified:** `tsc --noEmit` clean; agent image rebuilt, string-checked before swap (`maybeDailyRefreshEnqueue`,
the inline-note reason, the nudge, rotation-default gone), swapped, dangling images + stopped containers pruned;
`/var` 78%, 13G free; agent rebooted clean (heartbeat ticking). Lesson update applied + verified. **Did NOT
`docker volume prune`** — the only unused volumes are other tenants' (haymaker test DB, infra mod-picker, an
anon vol; ~55MB), which a shared-host prune would destroy. **Caveat:** the daily-refresh's first *firing* is
Monday 2026-06-22 pre-market — today only the predicate/build are verified, not a live run.

### D50 — Stale check-in times in the agent's context + documenting the Discord alerting policy (Cam, 2026-06-22)
**Context:** Cam asked why the morning plan / 10:00 check-in didn't ping Discord. Two findings. (1) A real
bug: the hourly-check-in switch (D40, `policy.ts CHECKIN_TIMES_ET = 10/11/13/14/15`) left two agent-read strings
still saying the **old `10:00, 12:30, 15:00`** — `context.ts` (injected into *every* session's context) and the
`cancel_checkin` tool description (`tools.ts`). So the 10:00 check-in was telling *itself* the next one was 12:30
and writing "standing down until 12:30." (2) Not a bug: there is **no "a session ran" Discord alert** for the 09:00
Game plan or the fixed trading check-ins, and there never has been (git-confirmed). Those two are **outcome-only** —
they ping only on a FILLED trade (`validator.ts`), a self-promote/track (`promote.ts`), or a system stop. The
discovery hunt / midday brief / EOD / weekly review *do* each fire a dedicated `info` "posted" alert. On 2026-06-22
the 09:00 plan traded nothing (silent, correct) and the 10:00 check-in **bought 13 MRU @ $90.22 (order #24, FILLED)**
— whose `Bought …` ping Cam *did* receive, confirming webhook delivery is healthy.
**Decision:** Leave Discord alerting **as-is** (outcome-only for plan/check-ins — no per-session summary ping; a
quiet "no trade" check-in stays dashboard/journal-only on purpose). Fix the stale strings and **document** the
alerting policy so the next "why no ping?" is self-serve.
**Change (agent-only, one rebuild):**
- `context.ts` + `tools.ts` now **derive the check-in times from `CHECKIN_TIMES_ET`** (`.join(", ")`) instead of a
  hardcoded list — single source of truth, can't drift again.
- New **"Alerting (Discord)"** section in `docs/OPERATIONS.md`: the fires-vs-silent matrix, the outcome-only rule,
  and an "I expected a ping and didn't get one" troubleshooting note (incl. that `info` alerts leave no journal
  trace, so absence of a journal entry ≠ alert didn't fire).
**Verified:** `tsc --noEmit` clean; agent image rebuilt + string-checked before swap, swapped, pruned. No schema,
no behavior change beyond the corrected times string.

### D51 — Hunt finds carry their exchange (a bare ticker is ambiguous → wrong-company data) (Cam, 2026-06-22)
**Context:** Cam asked why so many logos were missing on The Hunt. Investigation found the logo was the visible
tip of a **data-correctness** bug: hunt finds are stored as BARE tickers (D46, leads-not-tracked, so they skip
the universe add-flow that resolves a listing), and a bare ticker is ambiguous. `toYahoo()` trusts a bare ticker
as a US listing, so the board was pulling whatever US company owns that ticker — for CA finds, a *different
company entirely*. Live on the board: **AII** showed **American Integrity Insurance** ($17.32 USD) instead of
**Almonty Industries** ($27 CAD, the tungsten miner the dossier was about); **LGN** showed **Legence** ($87.52)
instead of **Logan Energy** ($0.84 CAD); **PNG** (Kraken Robotics) showed nothing. The dossier *prose* was right
(the agent researches by company name); only the attached price, 30-day momentum, **heat rank**, and logo were a
same-ticker stranger's — AII even had 63 cached daily bars of the insurer. Reverse-resolving a bare ticker is
collision-prone (AII is a real NYSE listing too), so the fix is to capture the exchange the agent already knew.
**Decision:** Capture the exchange at the source and key everything off the EXACT listing — no guessing.
**Change (schema + agent + web, one db-push + two rebuilds):**
- **Schema:** `JournalEntry.exchange` + `companyName` (the FMP-confirmed name — identity record + display name).
- **Agent** (`tools.ts write_journal`): new `exchange` enum (NYSE/NASDAQ/AMEX/TSX/TSXV/CSE/NEO); on save it
  confirms `(ticker, exchange)` via `fmpProfile(yahooForListing(...))` and stores the canonical company name
  (best-effort — an FMP miss still stores the exchange). Hunt prompt (`sessions.ts`) now REQUIRES the exchange,
  with the AII/LGN ambiguity spelled out.
- **Web** (`app/market/page.tsx`): each find resolves to `yahooForListing(sym, d.exchange)`; that one listing
  drives **quote, bars, AND logo** (was `fmpLogo(bareSym)` + bare-keyed quotes). `companyName` becomes the display
  name; the exchange shows in the tag. Legacy finds with no exchange stay bare (unchanged) — US names already
  resolve correctly bare; only CA names needed the suffix.
- **Backfill** (`scripts/backfill-hunt-exchange.ts`, one-time): name-grounds existing finds — for each, picks the
  `fmpSearch` listing whose company name is best-corroborated (whole-word, multi-token) by the dossier body, so a
  collision resolves to the company the dossier is ABOUT. **48 finds corrected** (AII→Almonty/TSX, LGN→Logan/TSXV,
  PNG→Kraken/TSXV, WUC→Western Uranium/CSE, RECO→Reconnaissance/TSXV, …); stale wrong-company bare Quote/Bar rows
  purged (AII's 63 insurer bars, LGN's 63 Legence bars, etc.). Genuinely-uncovered or US "no-match" names stay
  monogram/bare (safe — bare already resolves US). Lone CA miss: `HPS.A` (class-share ticker; rare edge case).
  NB the FMP key lives in the ROOT `.env`, not `web/.env`, so the host-side script needs it injected
  (`FMP_API_KEY=… npx tsx …`) — Prisma auto-loads `DATABASE_URL` but nothing else.
**Verified:** `tsc --noEmit` clean; `db push` applied; backfill dry-run hand-checked then applied; web rebuilt +
string-checked + swapped; board re-rendered shows Almonty $27.04 CAD / Logan $0.84 / Kraken $7.29 / Propel $24.34
and NO American Integrity or Legence; agent rebuilt + swapped. `/var` 75%, 15G free.

### D52 — Remove the holdings-count cap: breadth is the agent's call (Cam, 2026-06-22)
**Context:** The §6 gate refused a BUY of a NEW name once the book held ≥ `HARD.maxPositions` (8) — `validator.ts`
`Max position count reached`. Cam: "I don't think we should have a cap — it's whatever the agent thinks is best."
A flat count cap is a blunt instrument: with NAV ~25k it was forcing either ≤8 names or none, when the right
breadth is a judgment the agent should make per its theses. The fund was at 7/8 (AC, ATD, IFC, MRU, SLF, TD, XIC),
one name from being unable to open anything new.
**Decision:** No cap on the NUMBER of distinct holdings. Breadth is the agent's call — but the fund is NOT
unbounded: it's still held in by `maxUniverseSize` (≤60 *eligible* names, so ≤60 distinct holdings), the dial's
`maxNewTradesPerWeek` BUY pace + `cashFloorPct`, `maxPositionPct` (per-name size), the `feeEdgeMultiple` floor
(a position too small can't clear 3× round-trip commissions), and the order-rate caps. So removing the count cap
removes an *arbitrary* limit, not the anti-runaway protection. The §6 gate, kill switch, and 75% conviction bar
are all UNCHANGED. Per rule #1, a human made this change; the agent still can't touch the gate.
**Change (agent-only, one rebuild):** dropped `HARD.maxPositions` (`policy.ts`) + its enforcement (`validator.ts`,
keeping `existing` for the size check); updated the hard-limits line the agent reads (`context.ts`) to "no cap on
# of holdings (breadth is your call …)"; refreshed `docs/SYSTEM-OVERVIEW.md` (also corrected a stale
`maxDecisionSessionsPerDay: 4→6` there). Web app + sim engine don't use this gate (`validateAndPlace` is
agent-only), so no web rebuild.
**Verified:** `tsc --noEmit` clean; agent image rebuilt + string-checked + swapped; heartbeat ticking. `/var` 75%.

### D53 — iOS push notifications: wire the Discord stream to APNs, per-user configurable (Cam, 2026-06-22)
**Context:** Everything operationally interesting already fans out to Discord (`alerts.ts`). Cam wants the same on
his phone — "I expect to always have stock buy notifications," with the rest opt-in per user. Build the push infra,
wire what goes to Discord, and make it configurable in Settings for each member. Price-target alerts ("set a target,
get pinged") are explicitly deferred.
**Decision — categories + always-on policy:** Trades + Risk are **non-toggleable** (always-on), and **any
`critical`-severity alert** (agent crash, drawdown kill switch) pushes regardless of toggles — that's the "system
outages" guarantee without forcing the noisy restart/session-error chatter. Everything else is **per-user, default
ON** ("default opt in for all categories"): `dossiers`, `hunt`, `agentMoves`, `reports`, `members`, `system`. The
member who *takes* an action isn't pinged about their own action (actorEmail skip). Mobile is members-only, so only
members register devices — no viewer leak.
**Architecture:** One chokepoint, unchanged on the surface. `alert(sev,title,body,{category,actorEmail,symbol})`
and a new `notifyOut()` (Discord+push, no journal — for routes that journal themselves) both call `pushNotify()`
(`lib/push/notify.ts`), which resolves recipients (DeviceToken × NotificationPreference, with the always-on rules)
and calls `sendApns()` (`lib/push/apns.ts`). APNs is **token-based** (a .p8 Auth Key) over Node's built-in HTTP/2 +
`jsonwebtoken` ES256 — **no new dependency**; the provider JWT is cached ~50 min; a `410`/`BadDeviceToken`/
`Unregistered` reply prunes the dead token. Every `alert()`/`sendDiscord()` call site (~40, across runner/validator/
sessions/promote + the killswitch/universe/directive routes) was tagged with a category. **Configured-or-no-op:** with
no `APNS_*` env, push is silent and Discord is unchanged.
**Schema:** `DeviceToken` (email × token, `apnsEnv` sandbox|production so a token reaches the gateway that minted it)
+ `NotificationPreference` (email PK, 6 toggleable booleans default true; trades/risk aren't stored — force-on in
code). `priceTargets` column reserved for the later feature (no event wired).
**Surfaces:** `GET/PUT /api/notifications/preferences` + `POST/DELETE /api/notifications/register` (members-only,
admitted to the mobile API in `middleware.ts`); web `NotificationSettings.tsx` on the Settings page; iOS
`@UIApplicationDelegateAdaptor` + `PushManager` (permission, register-after-auth, token upload, foreground banners,
tap→stock deep-link), `NotificationSettingsView`, and sign-out unregister (so the next member on the same phone
doesn't inherit tokens). pbxproj wired `CODE_SIGN_ENTITLEMENTS` + `GRQ.entitlements` (`aps-environment`).
**Humans-only remainder:** create the .p8 Auth Key + enable Push on the App ID + add the Xcode capability + set
`APNS_KEY_ID/TEAM_ID/BUNDLE_ID/KEY_B64` in `.env`. Full runbook: `docs/PUSH-NOTIFICATIONS.md`.
**Verified:** `tsc --noEmit` clean (web+agent). iOS can't compile on this host (no macOS SDK) — written against the
existing patterns; needs an Xcode build + a real-device token to light up end-to-end.
**UPDATE 2026-06-23 — LIVE.** All four `APNS_*` are set in `.env` + both the `web` and `agent` containers;
`apnsConfigured()` is true and APNs delivers. Cam's device is registered (sandbox/Xcode build, `DeviceToken`).
A member only no-ops when they have no `DeviceToken` row yet (e.g. Graham hasn't opened the app). The earlier
CLAUDE.md "stubbed/commented" note was stale.

### D54 — Settlement-aware cash mirror: kill the phantom post-buy NAV-tape dip (Cam, 2026-06-22)
**Context:** The Daily Tape (and the live NAV header) showed a small dip *every* time the agent bought, then
recovered a tick later. Root cause: the Tape on **both** web and mobile is purely a render of `NavSnapshot` rows
(`web/app/page.tsx` `todaySnaps`, `lib/feed.ts` `tape`), and on the IBKR path `reconcile()` mirrors **cash and
positions independently**. A BUY drops IBKR's `settledcash` the instant it fills, but the positions ledger grows
the new shares a few seconds later — a reconcile landing in that gap wrote the lower cash with **no offsetting
position** → NAV = cash-out / no-stock-in → the dip. The same phantom NAV is a known false-daily-loss-pause trigger.
The synchronous fast-fill path already guarded this (reconcile-retry-loop *then* snapshot); the gap was the slow-fill
(`finalizePending`) path + the periodic 30-min reconcile catching the lag window.
**Decision:** Fix it at the **data layer, not the chart** — one server-side change covers web + mobile + the
guardrails, since they all read the same `NavSnapshot`/DB. Chose "defer cash in reconcile" (lowest-risk, localized,
preserves the *mirror broker truth* philosophy) over an atomic optimistic-ledger apply or cosmetic chart smoothing.
**Change (agent-only, one rebuild) — `lib/broker/ibkr.ts` `reconcile()`:** the cash mirror is now settlement-aware.
If a freshly-filled BUY (a `Trade` within `CASH_SETTLE_LAG_MS` = 5 min) hasn't yet grown its position in the broker
read (`brokerQty <= dbQty`) **and** the broker's cash for that currency has dropped below ours, **defer the cash
write this tick** — cash + shares then land together on the next tick and NAV stays continuous. Position mirroring
is untouched; only the cash write is gated. Verified state-by-state: steady state never false-defers (settled →
`brokerCash == dbCash`), a sell's cash CREDIT is never deferred (broker cash ≥ ours), and it self-heals (a buy older
than the window falls through, so a genuinely-settled debit is never frozen). Per-currency aware (CAD/USD). No web/
chat rebuild — `reconcile()` only runs in the agent runner.
**Verified:** `tsc --noEmit` clean; agent image rebuilt + swapped; heartbeat ticking. `/var` 75%.
**Follow-on — the tape that made it findable (web):** generalized `components/PriceChart.tsx` (the stock-page chart)
with `mode: "daily" | "intraday"`, `label`, and `bare` props; the Today page (`app/page.tsx`) now renders the day's
NAV with `mode="intraday" bare` instead of the flat `Sparkline` — same crosshair/tooltip, but an HH:MM-ET time axis
and no range picker, so a member can hover any point and read its NAV + minute (this is how Cam pinned the dip to
10:11 ET). Daily (stock-page) behavior is byte-for-byte unchanged. Web-only; iOS keeps its `TapeChart` (the dip fix
reaches iOS through the shared `NavSnapshot` data, not the chart).
**One-time data correction:** the single pre-D54 phantom snapshot already on the books (2026-06-22 14:11:35Z, note
"IBKR fill order #24" — the MRU 13@90.22 buy) was corrected in place from NAV $23,759.86 → $24,932.72, booking the
13 MRU shares at the fill price so `nav = cash + positions` again and the point sits continuously between its
neighbours. An *upward* correction, so it can't manufacture a drawdown; day-P&L is unaffected (it reads live NAV vs
the day-open snapshot). Future fills are covered by the reconcile gate above — this was a one-off cleanup of legacy data.

### D55 — The Wire: a full-screen paged discovery feed (iOS-first prototype) (Cam, 2026-06-22)
**Context:** "The Hunt meets Instagram" — a scrollable, mixed-media discovery surface separate from the Hunt.
**Decisions (locked with Cam):** name **The Wire**; v1 **shared + read-only** (no per-user state, no schema change);
**iOS-first**; push **deferred to Phase 2** (the D53 stack is left untouched); full-screen **vertically-paged**
(Reels/Stories) with the **tab bar + a fixed header (brand + top-right `MemberAvatar`)** kept; **mixed** visual
style (unified dark stock cards · full-bleed article photo · accent-tinted lesson card); cards **go rich**.
**Backend (deployed):** `GET /api/wire` → `wireResponse()` in `lib/feed.ts` reuses the existing Hunt finds, recent
`Dossier` journal entries, recent watchlist adds (attributed via `personByName`/`watcherKey` → the bundled
`cam`/`graham` avatar), `fmpNews`, and `GLOSSARY` — five typed card kinds (`find`/`dossier`/`watch`/`article`/
`lesson`) **woven round-robin** so the feed reads mixed. Flat, mostly-optional `WireItem` in `shared/contract.ts`
(graceful-decode). "Go rich" added `nearBps`/`nearHorizon`/`targetNear|FarCents`/`signals`/`sources` + watch
`spark`. Middleware allowlists `/api/wire`; verify harness covers it.
**iOS:** `Views/Wire.swift` — iOS-17 `.scrollTargetBehavior(.paging)` + `.containerRelativeFrame(.vertical)`; each
kind a purpose-built full-screen `WireCardPage` (find: heat + 12-mo hero + area chart + thesis + sources · dossier:
RatingBar hero + bottom-line + target prices + signals · watch: big member avatar + mini chart · article: full-bleed
photo · lesson: tinted flash card). New **4th tab "Wire"**; Markets re-homed under More (iOS 5-tab limit, reversible).
**Lessons** present the wire-carried term/body directly (the app's bundled glossary is a subset of web's).
**Known gap:** ~4/9 hunt finds lack a live quote (pre-existing hunt coverage) → those find cards degrade to
heat + thesis + sources, no price/upside/chart.
**Verified:** `tsc --noEmit` clean (web); `/api/wire` validates against the contract (verify harness) and serves
live; iOS written against the existing components but **not compiled on this Linux host** — needs an Xcode build.

### D56 — The Wire Phase 2 (part 1): price alerts + push, stock-tied articles, lesson richness (Cam, 2026-06-22)
**Context:** first push on The Wire's Phase 2 backlog (`docs/THE-WIRE.md`). Of the six items, Cam picked three:
**price alerts + push (#2)**, **stock-tied articles (#3)**, and **lesson richness (#6)**. Deferred this round:
per-user "for you" (#1), web rendering (#4), unpriced-finds coverage (#5).
**Price alerts + push:** new `PriceAlert` table (per-user `email` + `symbol`/`direction`/`thresholdCents`/`currency`/
`note`, `active`+`firedAt` for one-shot). `GET/POST/DELETE /api/notifications/price-alerts` (members-only, scoped to
the caller). POST validates against the live quote — it **refuses a level already met** (would fire instantly) and
auto-derives direction if omitted. The agent runner gained **`checkPriceAlerts()`** in the market-hours tick (right
after `enforceExits()`, quotes already fresh): compares active alerts to mid, **one-shots atomically** (`updateMany`
where `active:true` before pushing, so overlapping ticks can't double-fire), then pushes the **owner only**. New push
category **`priceTargets`** (the long-reserved `NotificationPreference.priceTargets` is now wired) + a new
`pushNotify` **`onlyEmail`** option so a personal alert doesn't broadcast. iOS: a **bell** in `StockDetailView`
member controls → `SetPriceAlertSheet` (segmented above/below, auto-suggested from the typed target vs the live
price), and a **More → Price alerts** manager (`PriceAlertsView`, list + delete). The §6 trade gate is untouched —
alerts are notifications, not orders.
**Shared visibility (Cam, 2026-06-22):** notifications + deletes stay strictly per-owner (only you get pinged, only
you can delete yours), but the **stock page shows BOTH members' active alerts** on a name so the fund sees who's
watching what. `GET …/price-alerts?symbol=XYZ` returns every member's active alerts on that symbol with attribution
(`owner`/`ownerKey`/`mine`; resolved via `userForEmail`→`personByName`); the iOS stock page renders an attributed
"Price alerts" card (member avatar + the rule), with a delete affordance only on your own. The personal manager
(no-symbol GET) still lists only your own.
**Stock-tied articles:** `wireResponse()` now pulls `fmpStockNews` for up to 4 names already in the feed (recent
dossiers + watches) and emits article cards carrying `symbol` + `relatedTickers`; iOS renders tappable ticker chips
(→ the dossier) on the full-bleed article card. General market news still flows; stock-tied lead the article lane.
**Lesson richness:** `GlossaryEntry` gained optional `example` + `related[]`; ~14 common terms enriched. The wire
lesson item carries `lessonExample` + a self-contained `lessonRelated` (`{slug,term,def}` so a tapped chip presents
directly — the bundled iOS glossary is only a subset). iOS lesson card shows a "for example" callout + tappable
related-term chips.
**Verified (live):** `tsc --noEmit` clean; `prisma db push` applied; `/api/wire` + `/api/notifications/price-alerts`
+ `/preferences` validated via LAN member curl — CRUD works, the already-met guard fires, `priceTargets` is in prefs,
wire carries `lessonRelated`/`lessonExample` and stock-tied `relatedTickers` (CCA/PEY/BDT). Deployed web + agent
(market closed; chat not rebuilt — additive schema, no chat-logic change). **iOS not compiled on this Linux host —
needs an Xcode build** before a device sees it.
**Honesty:** `checkPriceAlerts()` **no-ops while APNs is unconfigured** (`APNS_*` env unset — the humans-only
Apple-portal step) so it never consumes a one-shot it can't deliver; alerts accumulate and begin firing once push
goes live. Alerts fire **market-hours only** (the runner checks against fresh quotes in the open tick).

### D57 — The Wire goes social: viewer-aware watch lane + richer find/watch cards + full lesson library (Cam, 2026-06-22)
**Context:** Cam: "a good segue into updating the Wire to be user-based — like a social network." First social step + a
content/depth pass. Also caught: the D56 lessons "looked unchanged" — investigated and confirmed the cause.
**Social watch lane:** `wireResponse(viewerEmail?)` is now **viewer-aware** (route passes `session.email`). The watch
lane **HIDES the viewer's own watches and shows what everyone else is tracking** — the other human member first, then
the agent (`ownerKeyFor(addedBy) !== viewerKey`; `viewerKey` via `userForEmail`→`ownerKeyFor`). Verified live: Cam's
feed shows only Graham's watches and vice-versa. (Finds/dossiers/articles/lessons stay shared — only the watch lane
personalizes, for now.)
**Richer watch cards:** each watched name now pulls its latest stock dossier (full or hunt) → GRQ's call, bottom line,
near/12-mo targets + bps, confidence, and live signals — the same substance as a dossier card, kept under the social
"{member} is watching" header. iOS `watchPage` rebuilt: social header + a scrolling body (RatingBar · bottom line ·
targets · signals · sparkline) with the CTA pinned.
**Richer find cards:** hunt finds now carry absolute `targetNearCents`/`targetFarCents` and the **full thesis**
(`thesis` on `WireItem`, server-side markdown-stripped via `cleanThesis`) instead of just the one-line `blurb`
(firstLine). iOS `findPage` shows targets + the full write-up in a bounded, scrolling region (the card stays
fixed-height; the CTA stays pinned). The thesis jumped from ~160 chars to ~2.3k.
**Full lesson library (the "did we update it?" fix):** D56 enriched only ~18 of 55 glossary terms, and the feed rotates
3 deterministically per day — so a given day often landed on un-enriched terms (and iOS renders the new fields only
after an Xcode rebuild), making it *look* unchanged. Fix: **all 55 terms now carry `example` + `related[]`** (every
related slug validated against existing keys), so every daily rotation is rich.
**Verified (live):** `tsc --noEmit` clean; contract verifier green; deployed web only (feed/route/contract/glossary —
agent + chat untouched). `/api/wire` confirmed per-viewer (Cam↔Graham watch split), watch cards rich, find thesis
~2.3k + targets, lessons 3/3 rich today, 55/55 enriched. **iOS not compiled on this Linux host — needs an Xcode build.**
**Open:** "user-based" is now started (watch lane); true "for you" ranking by interests/saved briefs (Phase 2 #1) and
whether to include agent watches in the social lane (currently yes, member-first) remain.

**Follow-up correction (Cam, 2026-06-22) — cards, not text dumps.** The first D57 pass over-corrected the "more
detail" ask: the find card got the FULL ~1.2k-word hunt `body` in a nested ScrollView, and the social header pushed
the watch card into scrolling too — and raw markup (`[[wiki]]`, `~~`, `**`) leaked because the find card used plain
`Text` and `MarkdownText` doesn't strip `[[ ]]`. Cam: the panels are **cards — fixed, non-scrolling, designed for this
UI (like the Stocks page)**; if the dossier has bullets, show a *few* bullets, not 1200 words. Fix:
- **Server shapes the content.** New `toBullets()` + `stripInline()` in `lib/feed.ts`: prefer the dossier's existing
  bullet lines (hunt dossiers already store a clean bulleted `bottomLine`), else split prose into a few sentences;
  strip ALL markup (`[[wiki]]`→text, links, `**`/`*`/`~~`/`` ` ``/`#`), cap to 3–4 bullets × ≤150 chars. Sent as a new
  `bullets: string[]` on `WireItem`; the heavy `thesis` field was removed. Hunt finds now expose `bottomLine`.
- **iOS renders fixed cards.** Removed the ScrollViews; find/dossier/watch use a `bulletList()` of plain Text rows
  (no markdown renderer needed — content is pre-cleaned), with the centered Spacer layout restored so each card fits
  one screen. The watch card's social header collapsed to a single compact line so it fits like a dossier card.
- **`MarkdownText` hardened** (`Components.swift`): strips `[[ ]]` before parsing, so the Stocks page stops showing
  raw wiki-links too.
**Verified (live):** `tsc` clean, contract green, web redeployed; `/api/wire` bullets confirmed clean (find = the
hunt bottom-line bullets, no markup, `thesis` gone). iOS still Xcode-only.

### D58 — Owner tier + admin usage dashboard (Cam, 2026-06-22)
**Context:** Cam wanted an admin view at `/admin`, visible to him alone, to see site traffic by person and section —
which parts of GRQ actually get used. GRQ's auth had only two tiers (`roleForEmail` → **member** | **viewer**); the
`GrqUser.role:"admin"` field is a cosmetic label that gates nothing. And nothing logged usage.
**Decision — a third tier ABOVE member, plus server-side usage logging:**
- **Owner tier.** `isOwner()` in `web/lib/users.ts` (default `cameron.tora@gmail.com`, extend via `OWNER_EMAILS`
  env). `/admin` (`app/admin/page.tsx`) calls `getSession()` → `isOwner` → `notFound()` for everyone else (Graham and
  viewers get a real 404, not just a hidden link); the NavBar link is owner-only. Same defense-in-depth as the member
  write-lock — the route guard is the lock, the hidden link is cosmetic.
- **Traffic logging — page/section views.** New `PageView` model (at/email/role/path/section). A client beacon
  (`web/components/Tracker.tsx`, mounted once in the layout) fires `navigator.sendBeacon('/api/track', {path})` on
  every client navigation. **Only the path is sent — `/api/track` (Node runtime) resolves WHO from the session
  (`sessionFromRequest`), so identity can't be spoofed.** Edge middleware can't reach Postgres, which is why it's a
  beacon-to-route, not middleware logging. Path stored raw (drill into which stocks); `section` is the friendly label
  (`web/lib/sections.ts`, mirrors the nav). ~9 SSO humans → no bot noise to filter.
- **Dashboard.** `web/lib/admin.ts` aggregates (groupBy + JS pivot): 24h/7d/30d/90d window, most-used sections, a
  by-person table (views · role · top section · last seen), a person×section matrix, and a recent feed.
**Scope decisions (Cam):** the new account `cameron@camerontora.ca` stays a **read-only viewer** (it was already in
the infra oauth2-proxy allowlist and isn't a member → already a viewer, no code change needed) so Cam can see the
non-member experience; logging is **page/section level** (not every API call); viewers ARE tracked (the point is
seeing what everyone uses); it is deliberately NOT an owner, so it can't see `/admin`.
**Verified (live):** `tsc --noEmit` clean; deployed web only (agent + chat untouched); Cam→`/admin` 200, Graham &
viewer→404; viewer/owner beacons logged with the correct role + derived section; junk `/api/track` paths rejected
(204, no row); synthetic test rows cleaned out. Committed on its own, isolated from the parallel stock-sharing WIP in
the working tree.

### D59 — Member-to-member stock sharing (one-tap iOS push) + APNs goes live (Cam, 2026-06-23)
**Context:** From any stock page, a member should be able to share the name with the other member and have it land as
a push on their phone. Separately: the D53 push stack was documented as "stubbed/commented" — but the `APNS_*` keys
are in fact set in `.env` + both containers, so `apnsConfigured()` is true and APNs delivers. That note was stale and
is corrected (here, CLAUDE.md, PUSH-NOTIFICATIONS.md).
**Decision — a tiny share path, recipient-only push, deep-links to the dossier:**
- **Route.** `POST /api/stocks/share` (`web/app/api/stocks/share/route.ts`) — `memberFromRequest` guard, body
  `{ symbol, to }` where `to` is a member key ("cam"|"graham") or an email; resolves the recipient
  (`emailForMemberKey` in `web/lib/users.ts`), rejects self-shares, and calls `pushNotify({ category:"members",
  onlyEmail: recipient, symbol })`. The push carries `symbol`, so a tap deep-links straight to the dossier (the iOS
  AppDelegate already routes on `userInfo.symbol`). Works on ANY symbol, not just the tracked universe. Added to
  `middleware.ts` MOBILE_API so the app's Bearer path is admitted.
- **iOS.** A share button (top-right toolbar, members-only) on `StockDetailView` opens `ShareStockSheet` — the OTHER
  member's avatar + a send icon; tap → `APIClient.shareStock(symbol:to:)` → push. `Services.swift` gains `shareStock`.
**Honest:** shares ride the `members` category (default-on, recipient-mutable) — not their own always-on category
(deferred; would need a NotificationPreference column). A share to a member with NO registered device (e.g. Graham
hasn't opened the app) returns ok but lands nowhere — that's the gating factor, not config.
**Verified (live):** `tsc --noEmit` clean; web deployed; route smoke-tested via the LAN header — member share → ok,
self-share → 400, missing symbol → 400, no identity → 403; a live test push (as Graham→Cam) delivered to Cam's device
(token survived, not pruned). iOS needs an Xcode build to surface the button (no macOS SDK on the host).

### D60 — iOS stock page rebuilt to full web parity (the dossier endpoint grows up) (Cam, 2026-06-23)
**Context:** The native stock page was a thin slice of the web `app/stocks/[symbol]/page.tsx` — call, targets,
fundamentals, a compact signal strip, the dossier body, lazy earnings/grades. Most web panels were missing, and the
limiting factor was DATA: `/api/dossier/[symbol]` didn't emit them. Cam asked for full parity + the same section order
(a full rebuild).
**Decision — expand the mobile dossier to carry every panel, then mirror the web layout:**
- **Contract (`shared/contract.ts`).** `Dossier` gains 19 optional/defaulted fields + sub-schemas: `position` (held +
  the deterministic stop/take bracket), `analystBand` (low/now/consensus/high, re-anchored for CDRs + trend), `grades`
  (+ recent analyst actions + trend), `earnings` (next/last beat-miss), `signalFamilies` (per-family rationale),
  `peers`, `institutional` (13F + holders), `scoreboard`, `closes` (the price tape), `news`, `coverage` (the 10-tier
  map), `trades`, `smartMoney` (compact), `currentRead`, plus `tier`/`agentWatching`/`agentNote`/`lastResearchedAt`.
  All defaulted so older payloads keep parsing.
- **Builder (`web/lib/feed.ts` `dossierResponse`).** Lifts the exact computations the web page already does (same
  FMP/Prisma/scoreboard/smart-money sources), so the app sees identical numbers — including the CDR re-anchor.
- **iOS (`Models.swift` + `Stock.swift`).** Mirrored the contract (new structs, all optional) and rebuilt
  `StockDetailView` in the web's order: hero (tier/watching chips + "researched X ago") → the bottom line (call + why)
  → your position → analyst ratings · price-target band · institutional · signals · earnings → peers + scoreboard →
  price chart (`TapeChart`) → smart money → fundamentals → dossier → trades → news → coverage map. "Ask GRQ" moved
  into Member controls; the controls row is now horizontally scrollable.
**Web-parity corrections (Cam, same day):** the technical-lean rating bar shows ONLY as a fallback when there's no GRQ
call (never a second "Buy/Sell technicals" bar beside the call), matching web; and "The record" (journal) is NOT
surfaced on the native page (the data still rides the wire — trim later if payload matters).
**Verified:** `tsc --noEmit` clean; `verify-mobile-api.ts` passes (live dossier matches the new zod contract); web
deployed; live `GET /api/dossier/AC` carries all panels with real data (4 signal families, 5 peers, 180 closes, 10
coverage tiers). iOS compiles in Xcode only (no macOS SDK here) — written against the existing patterns.

### D61 — Member-to-member messaging: a shared Cam↔Graham thread that backs chat + per-panel sharing (Cam, 2026-06-23)
**The insight:** the three asks — (1) the share button = the other person's avatar + a share glyph, (2) long-press
ANY stock panel to share *that section* with a comment, (3) build out Cam↔Graham chat — are ONE system, not three. A
"share a panel with a comment that links to the dossier" is structurally **a direct message with an attachment**. So
instead of bolting a comment onto D59's ephemeral push, everything lands on one messaging spine. (Decisions, with Cam:
unify shares into the chat thread · iOS-only · the full-page avatar opens the composer with an optional note.)
- **Data model — `DirectMessage` (NOT overloaded onto agent-chat `ChatMessage`).** `fromEmail → toEmail`, `body`
  (may be empty for a bare share), optional `symbol` + `panel`, `readAt` (null = unread). One shared two-person
  thread; a bare DM has no attachment, a full-page share carries `symbol`, a panel share carries `symbol`+`panel`.
- **Spine (`web/lib/messages.ts`).** `createDirectMessage()` persists the row and fires ONE push to the recipient
  (new toggleable category **`messages`**, gated by `NotificationPreference.messages`); `serializeMessage()` is the
  wire shape (per-viewer `mine`, author `fromKey`/`fromName`, server-resolved `panelLabel` from `lib/panels.ts`).
  `PushOpts` gained `panel` → the APNs payload carries it for the deep-link.
- **Routes.** `GET /api/messages` (thread + unread; `?since=<id>` for the poll delta) · `POST /api/messages`
  (`{body?,symbol?,panel?}` → the other member, resolved by `otherMemberEmail()`) · `POST /api/messages/read` ·
  `GET /api/messages/unread`. Members-only; added to `middleware.ts` MOBILE_API. **D59's `/api/stocks/share` was
  refactored onto the spine** (a share now lands in the thread, not just a ping) so older app builds keep working.
- **iOS.** Toolbar share button → the other member's avatar + share glyph (`ShareAvatarBadge`); a `.shareable()`
  wrapper puts a "Share with <them>" context menu on every dossier panel AND tags it as a `.id()` scroll anchor.
  `ShareComposerSheet` (recipient + what's attached + a comment box) is the one composer for both entry points. A
  tapped share deep-links into the dossier scrolled to + briefly outlining the panel (`SymbolRoute.panel`). New
  `MessagesView` (poll-based thread; attachment cards → dossier+panel), `MessagesInbox` unread badge on the More tab,
  `MessagesLauncher` + a More row + header button; a no-symbol message push opens the thread (`PushManager.openMessages`).
- **No real-time infra added** — matches the app's polling convention (thread polls every 4s while open; badge every
  30s; push when backgrounded). No new container; DMs are plain CRUD in the web app (the `chat` container stays
  agent-only). Web-parity DMs deferred (iOS-only, per Cam).
**Verified:** `tsc --noEmit` clean; web deployed (fresh image confirmed); live curl proved the full loop —
send→thread→read→unread, per-viewer `mine`, `panelLabel` resolution, and the refactored `/api/stocks/share`; test
rows wiped. iOS compiles in Xcode only (written to the existing patterns) — needs Cam's build + TestFlight.

### D62 — Funding US trades: the FX-approval guardrail (agent requests CAD→USD, a member approves) (Cam, 2026-06-23)
**Context:** D34 enabled US trading and made the fund *value* in CAD+USD, but nothing ever **acquired** USD — the
paper account holds `usdCashCents = 0`, so the agent's promoted US names (GOOG/NVDA/TSM ACTIVE; ~20 USD candidates)
were eligible-but-unbuyable. A US stock settles in USD: the only ways to fund one are hold USD (convert first) or let
the USD balance go negative (a margin loan — banned by guardrail #3). And a latent hole: the validator's cash-floor
check used *combined* CAD-equiv cash, so a USD buy with $0 USD would have passed the gate and silently gone on USD
margin. Full primer in `docs/US-TRADING.md`. **Decision (Cam):** wire a **guarded CAD→USD conversion** — the agent
may **request** any amount (treat a US name like a Canadian one), but a **member approves each conversion** before
money moves (the "FX-approval guardrail" D23 foreshadowed). Limits are **member-set dials**, not hard-coded constants
(every conversion already needs human approval, so the human is the real gate); defaults open, up to 100% USD allowed.
**What shipped:** (1) **broker seam** — `convertCurrency(from,to,amountToCents)` on `BrokerAdapter`: IBKR places a
MKT order on the **USD.CAD IDEALPRO** pair then reconciles + reports the REALIZED rate/fee from the ledger delta
(⚠️ **VERIFY-LIVE** — the CASH secdef search, FX order params, and reply-cascade only shake out on the live gateway);
sim moves the ledger at the BoC rate minus a ~$2 fee. (2) **margin-hole plug** — `validator.ts` now requires a USD buy
be covered by actual `usdCashCents` (native), refusing with a "use request_fx" hint when short; sim `fillNow` is
currency-aware (right cash bucket, `Position.currency`, native P&L label — closes a D34 follow-up). (3) **`FxRequest`
table + `lib/fx-requests.ts`** — create (uncapped, deduped per symbol, ≤8 pending) / approve / reject / manual-convert,
with the cap gate (per-request · per-week · USD-allocation %) biting at APPROVAL; the ONLY caller of
`convertCurrency` — the agent never touches it. (4) **agent tool `request_fx`** (decision/trading server only; not
chat/research) + a persona line: US names are first-class, but a USD buy needs USD cash; ask, don't convert. (5)
**`POST /api/fx`** (approve|reject|convert|dials, members-only, kill-switch-respecting) + the **Settings `FxPanel`**
(CAD/USD balances, USD-allocation %, pending approvals with Approve/Reject, manual convert, the three dials; viewers
read-only). (6) **push** — new always-on `fx` category so an approval request always reaches both members. (7)
Settings gains `fxMaxPerRequestCents` / `fxMaxPerWeekCents` / `usdAllocationCapPct` (additive, defaults 0/0/100). The
**§6 gate + kill switch are unchanged and humans-only** — this adds a human-approved funding path, it does not loosen
any limit. **Soak note:** the first real FX + US fills materially change the soaked system; per D34 the clean-soak
clock may restart — Cam's call. **Verified:** `tsc --noEmit` clean; `prisma db push` applied; web+agent deployed
(fresh images confirmed); non-money paths smoke-tested (auth 403/200, dials, panel, request→reject lifecycle).
**Live-gateway follow-up (2026-06-23):** Cam ran a manual convert → IBKR rejected "BUY 1K **USD.BGN** Forex — No
Trading Permission, Regulatory Restriction" (clean FAIL, $0 moved). Root cause = a **wrong-pair bug**, NOT a permission
wall: `fxConid()` did `secdef/search?symbol=USD&secType=CASH` and `hits[0]` grabbed **USD.BGN** (Bulgarian lev, regulatory-
restricted). **Fixed** to use `/iserver/currency/pairs?currency=USD` matching `ccyPair==="CAD"` → **USD.CAD conid 15016062**,
no wrong-pair fallback (redeployed web). A `whatif` preview of USD.CAD x20 then returned `200 error:null` (28.43 CAD +
2.84 commission) → **Forex permission EXISTS** on DUQ779121, order SHAPE is correct. Caveat: the fund (~$25k CAD) is below
the **USD 25k IDEALPRO minimum → every convert routes as an ODD LOT** (fills slightly off the interbank mid; reply
cascade auto-confirms). Still pending: one actual end-to-end FILL (whatif proves acceptance, not a fill).

### D63 — Web parity for notifications + chat: a header bell (notification center) and an envelope (unified chat) (Cam, 2026-06-23)
**Context:** iOS shipped a notifications experience + a unified member/agent chat (D61), but the web header only had a
plain "Chat" text button → an **agent-only** drawer. The member↔member DM backend (`/api/messages`, `DirectMessage`,
unread badge) existed but had **no web UI**, and there was **no notification feed anywhere** — push (APNs/Discord) was
fire-and-forget, persisted nowhere. Cam: add a **bell** and a **message** icon to the header, between the broker badge
and the avatar, members-only. **Decision (Cam):** (1) a **real notification center** — persist what gets pushed — and
(2) bring the **unified chat** (member DMs + agent) to web. **What shipped:** (1) **`Notification` model** (recipient
email, category, severity, title, body, symbol/panel deep-link, readAt) — one row per recipient member per notifiable
event. (2) **`pushNotify` now persists at the chokepoint** (`lib/push/notify.ts`): recipient eligibility was refactored
to resolve from the **member list** (`memberEmails()`), NOT device tokens, so a phone-less member still gets a web feed;
rows are written *before* the APNs early-return, gated by the same per-user `NotificationPreference`. The **`messages`
category is excluded** from the feed — the envelope/unread badge owns member conversations, the bell owns fund + agent
activity (trades, risk, reports, hunt, dossiers, agent moves, members, fx, system, priceTargets). (3) **Routes** `GET
/api/notifications` (recent + unread) + `POST /api/notifications/read` (members-only, cookie/Bearer via
`memberFromRequest`); `lib/notifications.ts` is the read side. (4) **`NotificationBell`** — bell + unread badge, polls
every 30s, opening marks-read, rows deep-link to the dossier, footer → `/settings#notifications`. (5) **`MessageButton`**
— envelope + unread badge (`/api/messages/unread`), opens the drawer on the Messages tab; clears instantly on the
`grq:messages-read`/`grq:messages-changed` events. (6) **`ChatDrawer` reworked** into a two-tab drawer — **Messages**
(new `MemberChat`: loads/polls `/api/messages`, sends, marks read, renders shared-symbol cards) + **Ask GRQ** (the
existing agent `ChatClient`, with the whose-thread owner toggle preserved); a `grq:chat` with a `symbol` still opens the
Agent tab to discuss that stock (AskGrq unchanged). (7) NavBar drops the "Chat" text button; bell + envelope sit between
the broker badge and the avatar, members-only. The settings notification card gained an `#notifications` anchor.
**Unchanged:** the §6 gate, kill switch, and notification *preferences* (same toggles now gate both push and the bell).
**Verified:** `tsc --noEmit` clean; `prisma db push` applied (table + indexes confirmed). Web-only feature — no
`shared/contract.ts` change yet (iOS already has its own push + chat).

### D64 — Opening the web notification bell clears the iPhone's lock-screen pile (Cam, 2026-06-23)
**Context:** D63 gave the web a notification center, but the web bell and the phone are independent surfaces —
Cam triages on the desktop and the iPhone lock screen stays a graveyard of stale dossier/trade/report pings.
He wants the natural behavior: **open the web drawer → the phone's delivered notifications clear.** **Decision
(Cam):** build the **web → phone clear** path. The only server-initiated way to remove an already-delivered iOS
notification is a **silent (background) push** that wakes the app to call `removeAllDeliveredNotifications()` —
so that's the mechanism, with **clear-all** semantics (no per-notification id mapping). **What shipped:** (1)
**`apns.ts`** grew a silent-push capability — `ApnsPayload.silent`/`badge`; `apsBody` emits
`aps:{ "content-available":1, badge }` (no alert/sound) when silent; headers switch to
`apns-push-type: background` + `apns-priority: 5`. Reuses the existing provider-token/http2/env-retry/dead-token
machinery. (2) **`notify.ts` `pushClear(email)`** — silent push carrying `{ clear:"all" }` to a member's devices,
no preference gating (housekeeping), best-effort. (3) **`/api/notifications/read`** fires `pushClear` after marking
read (the bell already calls this route on open → no UI change). (4) **iOS:** `Info.plist`
`UIBackgroundModes:[remote-notification]`; `AppDelegate.didReceiveRemoteNotification` → on `clear`,
`PushManager.clearDelivered()` (`removeAllDeliveredNotifications` + `setBadgeCount(0)`); a **foreground reconcile**
(`GRQApp` scenePhase→active → `reconcileOnForeground()`: if server `unread==0`, clear locally) as the catch-up net,
with `APIClient.notificationsUnread()` returning `Int?` so a failed fetch never wipes the screen. **The honest
ceiling (Apple's):** silent pushes are throttled and **undelivered to a force-quit app** — reliable when the app is
backgrounded-but-alive, else the foreground reconcile catches up on next open. **Deferred:** per-id precision (clear
only the read ones — needs `Notification.id` in the APNs payload), live badge counts on alert sends, `collapse-id`
grouping. **Division of labor:** web shipped + deployed by the agent; the **iOS half is code-only here** (no Xcode on
the host) — Cam archives → TestFlight → installs, then we verify Phase 3. Plan: `docs/PUSH-CLEAR-PLAN.md`.

### D65 — FX is bidirectional + can't overdraw: USD→CAD path + a source-funds guard (Cam, 2026-06-24)
**Context:** D62 only ever moved money CAD→USD, and `fx-requests.ts` had no sufficient-funds check — so a member
convert of US$8,000 (≈$11.4k CAD) ran the **CAD balance negative** (−$1,647.71) because IBKR paper happily filled it
on margin. Two bugs: one-way only, and no overdraw guard. **Decision (Cam):** money must move **both ways**, and **no
conversion may overdraw the source currency** (no margin — house rule #3). **What shipped (web only):** (1)
**`lib/fx-requests.ts` is now bidirectional** — `createFxRequest`/`manualConvert` take `fromCurrency`/`toCurrency`
(default CAD→USD, so the agent's `request_fx` path is unchanged). `amountUsdCents` is always the **USD leg** (USD
acquired on CAD→USD, USD spent on USD→CAD); `estCadCents` is the CAD leg; the broker gets the **TO-currency** amount
(`toCurrency==="USD" ? amountUsdCents : estCadCents`). Both `SimBroker` and `IBKRBroker` `convertCurrency` already
handled both directions (BUY/SELL on USD.CAD IDEALPRO) — the gap was purely this layer. (2) **`checkFunds` guard** in
`executeRequest` refuses any conversion whose source leg exceeds the **mirrored broker balance** (`Account.cashCents`
/ `usdCashCents`) — marks the request FAILED, never calls the broker. (3) The allocation/size **dials gate only
CAD→USD** (adding USD); USD→CAD de-risks → cap-free (still kill-switch + funds gated). (4) `FxExecuteResult` +
`fxStateResponse` now carry `fromCurrency`/`toCurrency`; the API `convert` action accepts a direction; **`FxPanel`**
gained a CAD→USD / USD→CAD toggle + direction-aware row labels. **Remediation:** converted **US$3,000 → CA$4,259.55
@ 1.41985** (IBKR paper, request #5) → CAD back to **+$2,611.84**, USD $6,000, USD allocation 50%→34%. **Verified:** a
CAD→US$5,000 attempt (over the $2,611 held) was blocked — "Insufficient CAD … No margin" — no money moved. iOS FX
panel still shows one-way copy (ignores the new fields harmlessly) — a later iOS pass can expose USD→CAD.

### D66 — TestFlight push finally lands: the wrong APNs key (and a three-layer signing chase) (Cam, 2026-06-24)
**Context:** D53 declared iOS push "LIVE" on 2026-06-23, but no TestFlight device ever actually received one (Cam
missed the 9:07 alert). Diagnosing it surfaced **three independent bugs stacked**, each masking the next:
**(1) stale TestFlight builds** — `CFBundleVersion` was a hardcoded literal `1` in `ios/GRQ/Info.plist` (it wins over
the `CURRENT_PROJECT_VERSION` build setting), so every re-archive was build `1`; App Store Connect silently rejects a
duplicate build number, so TestFlight kept serving the old binary. **(2) dev `aps-environment` in the archive** — the
Release config pinned `CODE_SIGN_IDENTITY = "iPhone Developer"` (a development identity) with no `CODE_SIGN_STYLE`, so
automatic signing matched the dev profile and baked `aps-environment=development` — a distribution build with a dev
push entitlement mints a token APNs rejects on both gateways. **(3) THE REAL WALL — the server used the wrong APNs
key.** GRQ has **two env-split `.p8` keys** under team `3WR9SN94Q4`: `93LXUPS3V6` delivers to **production** tokens,
`9VAQ4T6CYS` only to **sandbox**. `APNS_KEY_ID` was set to `9VAQ4T6CYS`, so every TestFlight (production) device was
rejected with `403 BadEnvironmentKeyInToken` no matter how perfect the build — invisible until bugs 1–2 were fixed and
a real production token existed to test against. **Decision/fixes:** iOS — bump build number per release; Release
config → `CODE_SIGN_IDENTITY = "Apple Development"` + `CODE_SIGN_STYLE = Automatic` (Xcode upgrades to Apple
Distribution at archive/export). Server — `APNS_KEY_ID=93LXUPS3V6` + matching `APNS_KEY_B64`; env-only change →
`docker-compose up -d --force-recreate web agent chat` (no rebuild). **Diagnostic technique that localized #3:** probe
a known production token with each `.p8` on both gateways; and verify the **exported `.ipa`** entitlements (not the
`.xcarchive`, which automatic signing leaves development-signed until the export re-signs). **Verified:**
`pushNotify({category:"trades"})` landed on Cam's TestFlight phone. The `X95943D6H3` on the signing cert is the
individual cert identifier, NOT a wrong team — a red herring. Full runbook + error-code cheat sheet in
`docs/PUSH-NOTIFICATIONS.md` (Troubleshooting). Graham still gets nothing until he installs + opens the app (no
`DeviceToken` row yet).

### D67 — Token accounting + a once-per-day boot-scan guard: stop the agent from draining Cam's Max quota (Cam, 2026-06-24)
**Context:** Cam's Claude Max 20× quota ran dry by ~11am three days running (2026-06-19/23/24), resetting only at 3pm —
but not before. The agent runs on `CLAUDE_CODE_OAUTH_TOKEN` = **Cam's Max token**, the *same* quota his interactive
Claude Code draws from, and we had **zero token accounting** — `runSession()` discarded the Agent-SDK `usage`/`cost` on
every call, the SDK transcripts live only inside the (volume-less) agent container and die on each recreate, so there
was no durable record to inventory. Reconstructing from the DB localized it: every `grq-agent` **boot** runs
`runStartupUniverseReview()` — a big Opus 4.8 session that fans out to ~12 subagents; one live scan measured **~3.8M
tokens**. Cam was iterating the agent those mornings (8 restarts on 06-24 alone: 10:42…19:29), and each restart that
cleared the old **6h** guard fired a fresh multi-million-token scan — stacked on the day's ~24 daily-refresh dossiers +
9 movers + 5 hourly check-ins + the morning hunt, **and** Cam's own interactive dev usage on the same token. Quota
died mid-morning. **Decision (Cam):** (1) **log every Claude call** so we can inventory burn by session type; (2) tighten
the boot scan to **once per ET day**; (3) document that restarting the agent triggers the scan. The §6 gate, conviction
bar, and model tiers are UNCHANGED — this is observability + a cadence guard, not a capability change.
**What shipped:** **(a)** New **`AgentUsage`** table (int token counts; cost as integer micro-USD per the no-floats
rule — and cost *is* populated even on the Max OAuth token). `runSession()` now sums `modelUsage` across the subagent
fan-out (falls back to the aggregate `usage` shape), writes one row per session, and logs a rich stdout one-liner;
wrapped so logging can never break a trading session (`web/agent/sessions.ts` `recordUsage`). **(b)** Owner-only
dashboard **`/admin/usage`** (`web/lib/usage.ts` + `web/app/admin/usage/page.tsx`, a "Tokens" tab beside Admin·Traffic):
today's totals, a **rolling-5h-window** burn bar (the thing that trips the Max limit — "remaining" is *our* measured
burn vs a configurable `GRQ_MAX_5H_TOKENS` estimate, since Anthropic exposes no true remaining for a subscription),
by-session-type breakdown, and a per-call table. CLI twin: `cd web && npx tsx scripts/token-report.ts [24h|7d]`.
**(c)** Boot-scan guard moved from a **6h window to once per ET day**, and the marker is written **"started" BEFORE the
scan** (not just "completed" after), so even a restart that kills a scan mid-flight can't re-trigger it that day; the
universe persists in the DB, so a skipped boot reuses today's (`web/agent/runner.ts` ~L367). Force a fresh scan by
deleting today's `JournalEntry` rows titled `Startup universe review%`. **(d)** CLAUDE.md gotcha documents the
restart→scan→quota link + the batch-one-rebuild discipline. **Verified:** schema pushed to live DB; web + agent rebuilt
(fresh-image grep confirmed, not stale); the redeploy boot **did not** re-scan (per-day guard saw today's markers — 0
new); a cheap in-container Haiku session wrote a real `AgentUsage` row (`in 517 / out 54 / $0.0388`) end-to-end, then
was deleted. **Bigger lever still open (not done):** give the agent its *own* `ANTHROPIC_API_KEY` so its burn stops
competing with Cam's interactive Max quota (a real-cost decision — deferred to Cam).

### D68 — The Race: a multi-model bake-off (Opus live vs Sonnet shadow) on every session (Cam, 2026-06-24)
**Context:** GRQ runs **Opus 4.8 for every decision and report**. Cam: *"I'd like a second agent on a different
model — see what different models **choose** to do from the same data, without doing it."* The codebase was already
~80% shaped for this: every model call funnels through `runSession()`; `buildContext()` is a portable text blob (the
"same data" artifact); and research already runs on a non-trading toolset (`grqResearchServer`). The one constraint is
that the agent is built on `@anthropic-ai/claude-agent-sdk` and auths via **Cam's Max OAuth token** — Anthropic-native,
so a *Claude* challenger (Sonnet) is a config knob, while non-Claude needs a proxy or a hand-rolled loop (Phase 2+).
**Decision (Cam):** keep **Opus the sole LIVE decision-maker** (it alone trades, through the §6 gate — guardrail #1
unchanged). At each session, hand the challenger(s) the **EXACT same frozen prompt** the champion ran, **one-shot, with
NO tools** (the guarantee of "exact same SEED information" + reproducibility — a tool call would diverge from what the
champion saw), and record what each *would* do. A challenger can never trade: there is no order tool in its path and it
never reaches the gate. Phase 1 = one challenger, **Sonnet 4.6** (a Claude → same Max token, no new auth), across **all
five** decision/report sessions: morning plan, intraday check-in, position check (decision → fenced-JSON proposal) +
midday brief, EOD report (narrative → text). Surfaced on a new **`/race`** page beside Reports. Full design + the
self-hosted Phase 3 roadmap: **`docs/THE-RACE.md`**.
**What shipped:** **(a)** New **`ShadowRun`** table — one row per (session, model), joined by `sessionAt`; the champion
row keeps its written read (its real action lives in `Order`/`Trade`), challenger rows carry the parsed
action/symbol/qty/confidence + reasoning. **(b)** `RACE` config in `web/agent/policy.ts` (`GRQ_RACE_ENABLED` kills it
without a deploy; `GRQ_RACE_CHALLENGERS` comma-separated, default `claude-sonnet-4-6`). **(c)** `runShadow()` +
`parseProposal()` in `web/agent/sessions.ts` — **reuses `runSession`** (same PERSONA, tool-less, `maxTurns:3`) so there's
no new SDK plumbing and per-run token/cost lands in `AgentUsage` under label `race:…` (so The Race doubles as a
cost-per-model comparison). Wired into all five sessions; never throws into the live path, never imports a broker/order
path. **(d)** `web/app/race/page.tsx` + nav — champion vs challenger side-by-side per session, action + a **75%-conviction
badge**, challenger call distribution, honest "hypothesis not track record" framing. **Verified:** `tsc --noEmit` clean;
`ShadowRun` pushed to the live DB (additive, no data loss); web + agent rebuilt (fresh-image grep confirmed `/race` +
`runShadow`, not stale); agent booted clean and did **not** re-trigger the once-per-day startup scan; `/race` returns 200.
Deployed 2026-06-24 ~23:15 ET — first races populate at the next morning's 9:00 ET plan.
**Deferred (Phase 1.5+):** the full deterministic **gate dry-run** (refactor a `validateOnly` path out of
`validateAndPlace` so a shadow BUY gets the *real* verdict, not just the headline 75% bar) → then **outcome scoring** →
a model leaderboard (reusing the retro/scoreboard machinery); **Phase 2** more models via OpenRouter; **Phase 3**
self-hosted open-weight (GLM/Qwen/Gemma) — GPU is the blocker, not disk.

### D69 — Stock-page header + bottom-line/price-targets layout polish (Cam, 2026-06-24)
*(D69 was committed first on the working branch while D68 "The Race" was built on its own `feat/the-race` branch — hence the out-of-order numbering; D68 is the entry directly above.)*
**Context:** Cam walked the `/stocks/[symbol]` page and called out a stack of alignment/hierarchy nits: the live price
floated centred against the whole hero (lower than, then higher than, the ticker), the "watched by" badge was a
different shape/height than the chips beside it, the action buttons weren't anchored, the bottom-line verdict panel was
crowded with targets + technicals + two caveats, the price-targets panel's numbers were oversized, and the
candidate chip used internal jargon ("candidate — not tradeable") instead of the site's own words.
**Decision (Cam):** pure presentation cleanup on the stock page — **no data, schema, or agent change.** Keep the verdict
panel to the *verdict* (call → bar → confidence → date), let analyst numbers live in the price-targets panel, and use
the same status vocabulary as the rest of the site.
**What shipped (`web/app/stocks/[symbol]/page.tsx` + 3 components):**
- **Hero** restructured into a top row (title group left · live price **right-justified onto the ticker's own
  baseline** via `items-baseline` — the ticker isn't moved) and a bottom row (action buttons **bottom-justified** ·
  "researched …" freshness on the bottom-right). The today's $/% move is sized to the **company name** (`text-base`)
  via a new `changeClassName` prop on `<LiveQuote>` (default unchanged, only this call site overrides).
- **Status chip uses site verbiage** (`lib/users`/universe language): CANDIDATE → **"on watchlist"**, ACTIVE →
  **"in universe"**, RETIRED → **"retired"** (was "candidate — not tradeable"). ACTIVE now shows a chip where it didn't
  before.
- **"Watched by" → a pill** matching the adjacent `<Chip>` (new `pill` variant in `components/hunt/WatchedBy.tsx`:
  `rounded-full` teal token, `text-[10px]`, tiny avatar). The chips ride in their own `items-center` sub-group so the
  avatar pill lines up with the text chips instead of floating high.
- **Bottom line** trimmed to the verdict: removed the technical-indicators strip (its disclaimer, trimmed to "An input
  the agent weighs — trend/momentum only.", moved to the **Signals panel**) and the analyst-consensus line (now only in
  the price-targets panel). GRQ's near/12-mo **Target stays in the bottom line**; the "GRQ's call is the judgment"
  caveat stays under **Why**.
- **Price-targets panel:** "Consensus" → **"Analyst consensus"** (glossary `<Term>` underline); the **upside % + source**
  ("+X% upside · US listing/Wall St.") sits **beside the consensus price**, not the title; value sizes dropped
  `text-base`→`text-sm` to match the earnings "next report" date.
- **`UniverseActions`:** the candidate **✕ retire button is now labelled "Retire"** (the `btn` class uppercases →
  "RETIRE"); same confirm + action.
**Verified:** `tsc --noEmit` clean; fresh-image grep confirmed the new strings present + old ones gone (not stale);
web rebuilt + recreated; `/stocks/AMD.US` 200; `/var` steady at 77%. Shipped in three deploys as Cam iterated.

### D70 — The pre-morning read: a 6:00 ET early scan that warms research before the 9:00 plan (Cam, 2026-06-25)
**Context:** Cam wanted *"a pre-morning read — generated at 6am, on the portfolio until the morning brief is published.
A high-level plan for the day, an opportunity to kick off any research it might want refreshed prior to 9."* The daily
cadence already bookends the day with the **9:00 game plan** and **16:15 EOD**, but there was nothing earlier than 9:00 —
so an overnight catalyst (a post-market earnings beat on a holding, an 8:30 macro print) only got picked up when the
heavy 9:00 session ran. The insight: a cheap early pass can *triage* the overnight tape and **queue dossier refreshes** so
the research has landed by the time the 9:00 plan reads it (the off-hours tick loop tightens to a 60s cadence whenever
research is queued, `runner.ts:822` — ~3h is ample to drain a handful).
**Decision (Cam):** add a **6:00–6:30 ET** session (market days, once/day, restart-safe via the dedupe-on-title guard) that
does two jobs: **(1)** WebSearch the overnight/post-market for anything touching holdings or focus names, and
**`request_research`** a fresh dossier on the *few* names a real catalyst changes — selective, **not** the whole book; and
**(2)** write ONE **short** RESEARCH note titled `Pre-morning read — <date>`. It is deliberately **brief and NOT a second
game plan** — a coffee read of what's interesting + the high-level shape of the day; the 9:00 session still does all the
deep work. The cap is **prompt-bounded, not a hard code limit** (Cam: *"I don't want to operate under the impression
we're locked"*) — it runs before the day's heavy load, so the token headroom is there. It owns the **Portfolio briefing
slot** from dawn until the 9:00 game plan (a newer brief) supersedes it, and surfaces **below the morning brief** on
Reports. **No 6am phone push** (deliberate — Discord-only via `sendDiscord`, so it's visible to the members without a
dawn buzz); it still lands on the portfolio + reports for whoever looks.
**What shipped:**
- **New agent tool `request_research`** (`web/agent/tools.ts`, in the full `grqServer` only — NOT the read-only chat
  server, so chat is unchanged): queues a fresh `ResearchRequest{requestedBy:"pre-morning"}` for an **already-tracked**
  name (vs `add_candidate`, which only queues a name with no dossier yet). Idempotent — no-op if a refresh is already
  queued/running.
- **`runPremorningRead()`** (`web/agent/sessions.ts`) — tools-on, Opus, `maxTurns:18`; writes via `write_journal`; posts
  the body to Discord only. Wired into the tick loop at the new 6:00–6:30 window in `runner.ts` (above the 9:00 block).
- **Briefing slot:** added to the `briefs` array on **`web/app/portfolio/page.tsx`** (kicker *"Pre-Morning Read · what
  changed overnight"*) and mirrored in the mobile feed **`web/lib/feed.ts`** — both already pick the newest brief, so the
  6:00 read leads until 9:00 with no extra logic.
- **Reports:** the daily-tab card shows a **Pre-market** preview indented below the Morning brief (`app/reports/page.tsx`),
  and the per-day timeline gets a collapsed **Pre-market read** card at the very bottom — below the Morning plan, matching
  its place in the day (`app/reports/day/[date]/page.tsx`).
**Verified:** `tsc --noEmit` clean; fresh-image grep confirmed the new web + agent strings baked in (not stale); web +
agent rebuilt one-at-a-time with `/var` watched (85%→79% after web prune). First pre-morning read fires at the next
6:00 ET market day.
**Deploy footgun (logged so it doesn't repeat):** the agent recreate **did** re-trigger the once-per-day startup scan,
because I mis-read the guard's day boundary. The guard counts `Startup universe review%` entries with `at >= startOfEtDay()`
= **midnight ET = 04:00Z (EDT)**. The prior scan ran at **23:37Z = 19:37 ET on the *24th*** — the previous ET day — so it
did **not** count for the 25th and the boot correctly fired a fresh scan. My pre-deploy check was fooled by a psql
`at AT TIME ZONE 'America/Toronto'` that shifted a UTC-stored timestamp the WRONG way (showed "03:37 Toronto", a phantom).
Caught it from the boot log, `docker-compose restart agent` to SIGTERM the in-progress session (saving the bulk of the
~3.8M-token burn), and the reboot **skipped** the scan because the "started" marker (written *before* the scan, 06:05:34Z)
now satisfies the guard. Lesson: to check "did today's ET scan run," compare the entry's **raw UTC** `at` against the
**04:00Z** (EDT) / 05:00Z (EST) boundary — never trust `AT TIME ZONE` on a tz-naive UTC column.

### D71 — Reporting voice: stop celebrating small wins, anchor on the rate + the path to scale (Graham via Cam, 2026-06-25)
**Context:** Graham's feedback, relayed by Cam: *"I won't be happy with making 500 bucks and having it tell me it's great.
Oh we're beating the market. Like I can do that myself. So we need economies of scale. I get this is going to take time to
grow and scale — just would rather get off on the right foot."* He's right, and the math backs him: on a $25k base, a
percentage edge is small absolute dollars (beat XIC by 10% ≈ $2.5k/yr), and "we beat the index" is a *floor* anyone clears
with one click — not a brag. The agent's framing was exactly what he reacted to: its persona measured success as *"vs just
buying XIC is the benchmark you must beat"* and the EOD prompt asked for *"how we stand vs XIC"*, inviting chest-thumping
over trivial gains.
**Scope (Cam's call):** **reframe tone/reporting ONLY** — do NOT touch how the agent decides, sizes, or what it's allowed
to do. The goal/strategy logic (the D39 active-deployment mandate, the conviction bar, the §6 gate) is unchanged. The
"economies of scale" levers Cam named — **grow the capital base** + **more aggressive within the guardrails** — inform the
*story the reports tell*, not the trading rules (position sizing / concentration remain a humans-only dial for a later,
separate decision).
**What shipped (`web/agent/sessions.ts`):**
- A new **"Reporting voice"** block in `PERSONA` (inherited by every report/check-in/EOD/weekly session): small money makes
  small dollars — say so flatly, never dress a trivial gain as a win; "we beat XIC" is the floor, not a trophy; **lead with
  the RATE (%/annualized) and the long compounding arc**, show what the rate compounds to / produces on a larger base so the
  focus is the path to scale, not the week's lunch money; the ambition is SCALE (compound the base + earn the right to add
  capital, deployed decisively within the guardrails) and call out timidity/under-deployment as bluntly as a bad trade; no
  self-congratulation — honest receipts over cheerleading.
- The **EOD prompt** line changed from *"how we stand vs XIC"* to *"where we stand — lead with the return RATE and the
  compounding arc (vs XIC is the floor, not the headline; don't dress small dollars up as a win)."*
**Verified:** `tsc --noEmit` clean; today's ET startup scan already on record (06:05Z) so the agent rebuild **skipped** it
(no Max-quota burn); fresh-image grep confirmed the new copy baked in (not stale); `agent` rebuilt alone, pruned, `/var`
steady at 79%; agent booted clean + ticking. First report in the new voice is the 16:15 ET EOD.

### D72 — Capital rotation + a dossier-queue fix: rank the book, swap on opportunity cost, never wait on a dossier nobody queued (Cam, 2026-06-25)
**Context:** Two findings from a working session on "more aggressive." (1) The fund is barely half-invested (~43% cash,
incl. a stranded US$6k = ~33% of NAV with zero US positions), and no position tops ~15% of NAV *only because idle cash
inflates the denominator* — ATD is already 25% of the INVESTED book, so the Aggressive dial (25% cap) is genuinely being
used; under-deployment is the real constraint, not the dial. (2) The agent had **no opportunity-cost / rotation logic**:
selling was only ever triggered by a *broken* thesis, stop, or take-profit — never "I found something better and I'm out of
cash." Worse, it couldn't even *see* its book as theses — holdings were shown as position+P&L only, with conviction
annotated solely on focus names, so it had no ranked view to pick a "weakest holding" from. (3) Separately, an 11:00
check-in correctly reported "DAL full dossier has NOT landed" — the agent saw its own *preliminary inline note*
(Weak Buy/70) and stayed disciplined below the 75 gate, but the full dossier it was waiting on **was never queued**:
`add_candidate` had bailed early ("already tracked", DAL was a CANDIDATE since 6/19) before reaching its queue step, and that
step only fired when NO "Dossier —" entry had *ever* existed (no staleness check). So the agent waited forever on a job
nobody created. Root cause = pipeline/plumbing + an inline-note-vs-full-dossier convention gap, NOT a model failure.
**Scope:** reporting/decision FRAMING + research plumbing — the §6 gate, the 75% conviction bar, dial values, and the
no-margin/shorting/options rules are all UNCHANGED. Rotation must clear the *same* 75% bar and be a clear step up net of
taxes/fees; it's an UPGRADE path, not a loosening. (Deferred, owners' call: actually moving aggression dials — sizing /
conviction bar. We confirmed the dial is already Aggressive and being used.)
**What shipped (one batched `agent` rebuild):**
- **Expose the book (`web/agent/context.ts`):** each Positions line now shows its **weight (% of NAV)** and **GRQ's current
  dossier call/confidence + date** (e.g. `XIC … 12.0% of NAV — GRQ's call Hold/58% (dossier 2026-06-25)`). The "Dossier —"
  lookup was widened from focus-only to **holdings + focus** (shared `bookDossier`/`callOf`; focus line reuses it), and the
  section header tells the agent to rank the book and spot the weakest link.
- **Opportunity-cost instruction:** a `PERSONA` disposition bullet ("Capital is finite — think in OPPORTUNITY COST … when
  heavily deployed and a setup beats your LOWEST-conviction holding, ROTATE: SELL then BUY in the same session, name the
  swap") + a concrete step in the scheduled check-in for the reverse case (strong idea, no cash → rank book → rotate).
- **Dossier-queue fix (`web/agent/promote.ts`):** new `ensureDossierQueued(key)` helper — returns inflight/current/queued
  and queues a fresh `ResearchRequest` when the latest "Dossier —" entry is missing or **older than `DOSSIER_STALE_DAYS=5`**.
  `addCandidate`'s early "already tracked" branch now routes through it (and reports what it did) instead of bailing; the
  new-add path uses it too.
- **`request_research` (`web/agent/tools.ts`)** re-pitched from a pre-morning-only tool to the **any-time** way to queue a
  full dossier on a tracked name (stale dossier, or only a preliminary inline note); `requestedBy` "pre-morning"→"agent".
  A `PERSONA` clause now says an inline note is NOT a full dossier (treat as below-bar) and to fire `request_research` rather
  than wait on a dossier never queued.
**Verified:** `tsc --noEmit` clean; fresh-image grep confirmed all four edits baked in; today's startup scan already on
record (06:05Z) so the rebuild **skipped** it (no Max-quota burn); `agent` rebuilt alone, pruned, `/var` steady at 79%;
booted clean + ticking. Ran `buildContext()` live — Positions block renders weight + conviction per holding correctly.

### D73 — Aggression + scale pass: cadence, forced breadth, hourly rebuild, the cost-of-capital benchmark, per-currency cash ceilings, and the $25k+$25k launch (Cam + Graham, 2026-06-25)
**Context:** Graham's feedback ("I won't be happy making $500 and being told it's great… we need economies of scale… get off on the right foot") drove a working session on making the fund genuinely aggressive and honest about what "good" means. Diagnostics found: the Aggressive dial was set and used (ATD was 25% of the *invested* book) but the fund was ~43% cash — incl. a stranded US$6k (~33% of NAV, zero US positions) — so under-deployment, not the dial, was the constraint; the hourly check-ins talked about hunting but mostly didn't produce (humans were adding the names); and the agent measured success as "beat XIC," which on $25k is a few hundred dollars Graham could index himself.
**Scope discipline:** the §6 gate, the 75% conviction bar, the no-margin/shorting/options rules, and the kill switch are all UNCHANGED. Everything here is cadence, framing, deployment pressure, and dial *values* (humans-only) — not a loosening of the gate.
**What shipped (agent + web, batched builds):**
- **Cadence (`policy.ts`/`runner.ts`):** intraday check-ins are now HOURLY **10/11/12/13/14/15 ET** (noon promoted from brief to a real check-in); the **midday brief moved to 12:30**.
- **Forced breadth (`sessions.ts` check-in):** every check-in MUST advance the pipeline — **research ≥5 genuinely new names** (WebSearch + add_candidate the worthy ones) and/or promote a ready candidate; "I scanned and nothing qualified" is explicitly disallowed. Leans on the ample Claude-Max token headroom.
- **Hourly rebuild (`sessions.ts`):** the check-in is reframed from a trigger-check into a **full hourly re-derivation** of the plan (prior plan + agenda + everything from the last hour → a new plan that supersedes the morning's). Hunts the intraday edge, hardest in the fast-moving mornings.
- **The REAL benchmark = clear operating costs, not beat XIC (`policy.ts` `OPERATING_COST_USD_CENTS_PER_MONTH=49000`, surfaced live in `context.ts`, reframed in the persona):** Claude Max (~$240) + FMP (~$250) ≈ **US$490/mo**. The fund only earns *genuine* return once monthly P&L clears that hurdle; beating XIC while under it is not a win. Shown live as a %/yr of NAV (≈13.7% at the new ~CA$61k NAV) — steep at small size, shrinks with capital, and the answer is scale + compounding, never oversized risk (gate + bar still bind).
- **Per-currency cash floor/ceiling + ballast (`policy.ts` `cashCeilingPct`, `context.ts`, `sessions.ts`; Settings text in `RiskDial.tsx`):** floor/ceiling now apply PER currency-account (each currency's cash ÷ its own sleeve, never summed) — Cautious **30–50%**, Balanced **15–30%**, Aggressive **0–15%**. Over-ceiling legs are flagged in context with a deploy mandate. Enforcement is **SOFT for now** (a check-in mandate; the hard auto-sweep-to-ceiling is deferred — revisit if soft doesn't move it). **Ballast = "deployed cash":** an index ETF (XIC for CAD, a US index for USD; **no FX**) is acceptable only with no conviction pick, counts toward the ceiling, and is the FIRST thing sold to fund a real stock — never preferred over a name the agent would actually back.
- **Opportunity-cost rotation made explicit (`sessions.ts`):** compare the incoming name's expected return vs the OUTGOING name's *remaining* return + the swap's full cost (commission + tax on the realized gain). On this small account commissions are noise; tax and forgone upside are what bite.
- **Weekly new-buy caps raised 2/5/10 → 15/20/25 (`policy.ts`):** the old caps bound the deployment push (fresh US$25k sleeve + rotation). Burst caps (10/day · 4/hour) still bound pace; each dial's cautiousness now comes from size/cash/stops/universe, not the trade count.
- **Settings page restructure (`app/settings/page.tsx`):** removed the standalone Members panel and the manual sim-order ticket; the **System panel** now carries the live **Trading account** (`IBKR_ACCOUNT_ID`, paper) + the Members list; **Road to real money** sits beside it. Risk-dial descriptions corrected (take-profit added; Aggressive "full whitelist" → the real etf+large+mid universe; "trades" → "buys").
**The launch re-baseline — actual trading starts at $25k CAD + $25k USD (Cam):** the soak so far ran on $25k CAD; the real fund launches **$25k CAD + $25k USD**, so the paper config was changed to mirror it. Cam reset the IBKR paper balances directly (CAD cash → CA$11,138.66 with kept positions ≈ CA$25k sleeve; USD cash → US$25k); `reconcile()` mirrored it. GRQ-side fixes: `scripts/relaunch-contributions.ts` wiped the old CA$25k inception row and recorded **CA$25k + US$25k** (CAD-equiv at the day's fx 1.4234, anchored to today's XIC 5570) so Total P&L reads the real **+CA$502** (not a phantom +CA$34k) and the vs-XIC benchmark restarts at launch. Today's NAV tape was inflated by the deposit (CA$35,571.40 added to pre-funding snapshots + the day-P&L baseline) so the deposit doesn't print as a day gain (day-P&L now ~0%, tape continuous at ~CA$61k). Cam chose **keep-positions / no soak-clock restart** (flagged: a 2.4× capital + new-USD-sleeve change is material; restarting the ≥2-wk IBKR clean clock would be the conservative read — owners' call). **Deferred follow-ups:** the hard cash-sweep; the per-currency *floor* in the validator (no-op at Aggressive 0%); making `dayPnlBps`/the chart contribution-aware so future deposits auto-exclude from performance (this one was a manual one-off).
**Verified:** `tsc` clean throughout; fresh-image greps confirmed each batch baked in (not stale); the agent rebuild **skipped the startup scan** (today's 06:05Z marker held — no Max-quota burn); `/var` steady ~79% across builds; the noon check-in fired the new behavior live; the live Settings page renders the restructured panels + corrected dial text (HTTP 200); `getPortfolio()` confirmed NAV CA$61,087 / contributions CA$60,585 / Total P&L +CA$502.

### D74 — "How GRQ works": a plain-English transparency page for the owners (Cam, 2026-06-25)
**Context:** Graham is finance-smart but not technical and felt unclear on how the recent changes actually work. The only record of the machinery was `docs/DECISIONS.md` (engineer-facing) and the code itself — neither readable by a non-technical owner. Extends the financial-literacy pillar from *market data* to *the fund's own governance*.
**Decision (Cam):** a members-only **`/how-it-works`** page — the plain-English operating manual — with the factual parts pulled **LIVE from the same code the agent obeys** so it can't drift out of sync. Two tabs:
- **Manual** — the bar (clear ~US$490/mo costs, shown as a live %/yr hurdle, not beat XIC), the money rules (guardrails in plain English: agent proposes / code disposes / can't change its own limits), the current dials (live from `policy.ts` `DIALS[riskLevel]` + `HARD`, each with a finance-language gloss), the daily rhythm (`CHECKIN_TIMES_ET` + fixed sessions), how it learns, a curated plain-English **changelog** (`web/lib/changelog.ts`), and an **under-the-hood** drill-down (the agent's actual standing instructions + the exact rule constants).
- **Decision log** — the COMPLETE record, parsed live from `docs/DECISIONS.md` (this file), newest-first, each entry collapsible. **Reflected going forward automatically:** we already write every decision here, and the page reads the live file, so new decisions appear with no rebuild and nothing to hand-sync.
**What shipped:**
- `web/app/how-it-works/page.tsx` (member-gated via `getSession().role`, `notFound()` for viewers); `web/lib/changelog.ts` (owner-language change feed); `web/lib/decisions.ts` (`getDecisions()` parses the `### D<n> — title (meta)` headings + bodies).
- **`PERSONA` extracted from `agent/sessions.ts` → `agent/persona.ts`** (verbatim) so the web app can render it read-only WITHOUT importing the Agent SDK (which `sessions.ts` pulls in; the alpine web image can't load it). `sessions.ts` imports `PERSONA` from there now — byte-identical, so the running agent is unaffected (picks up the refactor on its next rebuild).
- **`docs/` bind-mounted read-only into the web container** (`docker-compose.yaml` `web.volumes: ./docs:/app/docs:ro`) — the web build context is `./web`, so a repo-root sibling can't be COPY'd in; the mount bridges it and makes the decision log LIVE (edit the file → page updates, no rebuild).
- **Link placement (Cam):** removed from the header nav; lives **top-right on the Settings page** (`PageHeader right` slot).
**Verified:** member → 200 with all sections + both tabs; viewer → 404; nav link gone, Settings link present; Decision-log tab lists all 74 entries from the live file (this entry included). `tsc` clean; web rebuilt + recreated to pick up the volume; agent untouched.

### D75 — D54 redux: the settlement-aware cash mirror never fired for USD names (Cam, 2026-06-25)
**Context:** Cam saw the exact dip D54 claims to have killed — the Today tape dropped by the full purchase amount when the agent first bought **TSM** (a USD name), then recovered. Confirmed against the books: the 17:10 "IBKR fill order #27" snapshot wrote cash **down** CA$3,141.94 (the USD debit) while `positionsCents` stayed flat (TSM's 5 shares not yet in the broker ledger) → NAV cratered to cash-out/no-stock-in, recovering one snapshot later when the shares landed.
**Root cause — the gap D54 missed:** the deferral guard resolves a recent BUY's currency from its **Position** row (`brokerBy.get(symbol)?.currency ?? dbBy.get(symbol)?.currency ?? "CAD"`). But a *first* buy of a name has **no position row in either map yet** (that's the whole settlement-lag condition), so currency defaulted to `"CAD"`, the guard compared the **untouched CAD bucket** (`brokerCash < dbCash` → false), and never deferred. `Trade` carries no currency, so there was no other signal. Net: D54 worked for CAD first-buys and every USD *add* (the position row already exists → currency resolves → defers), but **silently failed for the first buy of any USD name.** The 2nd TSM buy (19:04) didn't dip — TSM already existed, so currency resolved correctly.
**Fix (agent-only, one rebuild) — `lib/broker/ibkr.ts` `reconcile()`:** make the bucket check **currency-agnostic**. A debit "landed ahead of its shares" iff an unlanded recent buy exists (`brokerQty <= dbQty`) **and EITHER** cash bucket dropped below our mirror (`cadDropped || usdDropped`) — no per-symbol currency needed, so it fires for USD first-buys. Still self-heals (the position-landed check ends the deferral the instant shares appear) and never defers a sell's credit (broker cash ≥ ours). Also **widened `CASH_SETTLE_LAG_MS` 5→15 min**: the real terminator is shares-landed, not the clock; the window is only a backstop against a buy that *never* lands, and TSM's shares took up to ~8 min to mirror here — longer than the old 5-min net.
**One-time data correction:** the dipped snapshot (2026-06-25 17:10:01.559, "IBKR fill order #27") was corrected in place — `positionsCents` 1,435,857 → 1,751,016 (booking the 5 TSM shares at the following snapshot's value) and `navCents` 5,794,029 → 6,109,188 so `nav = cash + positions` again and the tape point sits continuously between its neighbours.
**Verified:** `tsc --noEmit` clean; agent image rebuilt (fresh-image grep confirmed, not stale) + swapped, heartbeat ticking, startup universe scan **skipped** (today's marker present → no Max-quota burn); corrected snapshot makes the 17:06→17:18 tape continuous; `/var` 79% after prune.

### D76 — Decouple the weekly full-refresh from the review: full pool → Sunday night, held-names → Saturday pre-review (Cam, 2026-06-25)
**Context:** Working through the Saturday token budget surfaced that the weekly **review** is a *retrospective* (RETROs on closed positions, performance attribution, lessons, source-hit-rate grades, soak verdict, capital recommendation) — none of which needs fresh research. Its ONLY dossier dependency is grading **open** positions' theses, for which it re-reads each *held* name's current dossier. So it needs ~20 held names fresh, NOT the whole ~80-name pool. The Saturday-02:00 full-pool refresh had been scheduled purely to feed the review — an unnecessary coupling that (a) put a heavy scan on the review's critical path and (b) didn't put the library at its freshest for *Monday*.
**Token math (real, from `AgentUsage` over 72 dossiers):** ~**280k tokens/dossier** (avg; ~60% is cheap cache-reads), ~2.4 min each. Today's 81-name refresh ≈ **~23M tokens / ~3.4h** — fits one 5h window with room (est. ~50–70M/window). But it scales linearly with the candidate pool: at ~220 names it's ~62M / ~8.8h — over a window AND finishing after a 9:00 review. The real fix is bounding the pool (auto-retire), not the scan timing — still open.
**Decision (Cam):**
- **Full-pool refresh → Sunday 02:00 ET** (= Saturday night). Freshest for Monday's open, captures weekend news, and decoupled from the review. (`web/lib/universe.ts` `WEEKLY_REFRESH_WEEKDAY` 6→0.)
- **New Saturday 06:00 ET held-names-only refresh** (`maybeSaturdayHeldRefreshEnqueue` in `runner.ts`, `requestedBy:"saturday-held-refresh"`) — just the open positions (~20, ~6M tokens, ~50 min, ~3h before the review) so the 09:00 review grades open theses on fresh data (Friday's close + weekend news).
- The **weekly review stays Saturday 09:00** (unchanged).
- **Removed the Journal link from the header nav** (Cam) — `/journal` stays reachable from Portfolio + Reports.
**Still open (flagged):** auto-retire stale candidates so the Sunday refresh stays a one-window job as the pool grows.
**Verified:** `tsc` clean; agent rebuilt (`WEEKLY_REFRESH_WEEKDAY = 0` + `saturday-held-refresh` confirmed in the fresh image; startup scan skipped — no quota burn; this build also carried the D75 reconcile fix already in the tree); web rebuilt (Journal gone from nav, page still 200, Reports link intact); `grq-db` recreated benignly on `up -d web` (named volume, data intact — use `--no-deps` next time).

### D77 — `AGENT_VERSION` bumped `v1.0-phase2` → `v1.48-phase4`: give the provenance stamp a real, documented convention (Cam, 2026-06-25)
**Context:** `AGENT_VERSION` (`agent/policy.ts`) is the provenance stamp written onto every agent-authored record — the Settings "— on duty" line, every `Trade`, every `JournalEntry`/report/dossier, every `TradeProposal` — and surfaced as the `· v…` byline on the stock pages, Reports, and the journal feed. It had been the literal string `"v1.0-phase2"` since the Phase-2 bring-up commit (`d7fed65`) and was **never bumped**, despite the agent's behaviour changing enormously across D17→D76 (model swaps, self-investing, the hunt, FX, check-in cadence, The Race, the persona rewrites). So the stamp had stopped distinguishing anything *and* had no recorded rationale — Cam asked why it still read `v1` at Phase 4.
**Convention (now documented in a comment above the constant):** `v<major>.<minor>-phase<N>` —
- **major** = a deliberate full re-architecture of the agent (still **1**; the brain has evolved, not been replaced).
- **minor** = the count of `DECISIONS.md` entries that **changed the agent's behaviour/guardrails** — its prompts/persona, the §6 validator/policy gate, model selection/The Race, the runner cadence/check-ins/scheduling, tools/context/signals, self-investing/promotion, FX requests, the discovery-hunt runner, the learning loop. Counted **48** of D1–D76 (strict: behaviour-changers only, *excluding* ~10 borderline incidental code-touches like push-delivery plumbing tagging an `alert()` call-site or a verbatim persona-file refactor). The git cross-check (D-numbers whose commits modified `web/agent/`) corroborated the floor.
- **phase** = the `PROJECT_PLAN.md` §9 phase (now **phase4**).
- **Going forward (the enforceable rule, in the CLAUDE.md deploy block so it isn't forgotten):** the 48 was just the *seed* — from here the minor bumps **+1 on every agent redeploy** (mechanical, tied to the deploy action, not to whether a decision was logged); a **major re-architecture** promotes the major and resets the minor; a new §9 **phase** updates the `-phaseN` suffix. Edit `AGENT_VERSION` in the same build you ship so the stamp on new trades/journal/Settings stays honest.
**Not backfilled (deliberate):** historical `Trade`/`JournalEntry` rows keep their `v1.0-phase2` stamp — that's correct provenance; those records *were* authored by that version. Only the live Settings "on duty" value (rewritten by `runner.ts` on every boot) and all future stamps move to `v1.48-phase4`.
**Changed:** `agent/policy.ts` (the constant + the explainer comment); the two `@default("v1.48-phase4")` columns in `schema.prisma` (`Settings`, `Trade`) via `prisma db push`; the rarely-hit fallback in `lib/broker/sim.ts`.
**Verified:** no `v1.0-phase2` refs remain in the tree; `tsc --noEmit` clean; `db push` applied; web + agent rebuilt and swapped; agent boot logged `[grq-agent] v1.48-phase4 up`, wrote `v1.48-phase4` to `Settings`, and **skipped the startup universe scan** (today's marker present → no Max-quota burn); Settings page renders `v1.48-phase4 — on duty`; `/var` 84% after prune.

---

### D78 — Watchlist is many-to-many "who's watching"; promotion is single-actor (2026-06-25)
**Context:** The old model overloaded one field — `UniverseMember.status` — to mean both
"who's tracking this" (via a single `addedBy` string) and "is it tradeable" (CANDIDATE vs
ACTIVE). That conflation forced three awkward behaviours: only one person could "watch" a
name, a name couldn't be both watched and in the universe (promotion = `CANDIDATE→ACTIVE`,
which mechanically left the watchlist filter), and there was even a workaround to *hide* the
watcher pill once promoted ("a promoted name isn't being watched anymore"). Cam wanted the
watchlist to be a genuine personal-interest list, and promotion to stop requiring two people.

**Decision:** Split the two axes that were conflated.
- **`StockWatch(symbol, email)` join table** = *personal interest*, per-member, many-to-many.
  Multiple members can watch one name; the UI shows their faces as an overlapping
  `AvatarStack` on the Watchlist, Universe, Browse, the Hunt, and the stock-page banner.
  Watching is **independent of universe status** — a name stays watched after promotion, and
  un-watching (`unwatch` action) removes only *your* watch, never stopping research.
- **Watchers are humans only** — the agent's interest lives in the universe / `AgentFocus`,
  not here (keeps the avatar stack meaningful).
- **Watching still implies tracking** — watching an untracked name still creates a CANDIDATE
  `UniverseMember` + queues a dossier (unchanged), so the agent researches everything watched.
- **The Watchlist page is watch-driven** — it shows names with ≥1 human watcher (per-member
  tabs: All / Cam / Graham, a name can appear under both). Agent-tracked-but-unwatched
  candidates live on the Universe / Hunt / Browse pages, not the personal watchlist.
- **Promotion is single-actor** — any member *or* the agent can promote a researched candidate;
  the automated liquidity screen is the only gate. The old two-person request/approve flow
  (`promotionRequestedBy/At`, `proposedTier`) is retired in code (columns kept for
  expand/contract; drop later).

**Why it's safe:** The agent never reads watch state — it gates buys purely on
`status === "ACTIVE"`, so decoupling watch from universe is invisible to its logic. The real
money guardrail — the **§6 order gate refuses any BUY unless the name is ACTIVE**, enforced in
code — is **unchanged**. Dropping two-person promotion only loosens *who may promote*
(governance), not *what protects money*; it also brings the human path in line with the agent
self-promote path (D30/D32), which has been single-actor since it shipped. Cam (an owner)
authorised it.

**Migration:** `scripts/backfill-watches.ts` seeded `StockWatch` from the legacy `addedBy`
(Cam/Graham only; agent/seed/null skipped) — 35 watches across 81 tracked names.

**Changed (web):** `schema.prisma` (`StockWatch`), `lib/watch.ts`, `lib/people.ts`
(`personByEmail`), `app/api/universe/route.ts` (watch on add, new `unwatch`, single-actor
`promote`), `components/{WatchButton,AvatarStack,UniverseActions,StockTable,WatchlistTabs}.tsx`
(+ hunt components), `app/market/{watchlist,browse}/page.tsx`, `app/universe/page.tsx`,
`app/stocks/[symbol]/page.tsx`, `lib/glossary.ts`, `agent/validator.ts` error copy. Deleted
`components/hunt/WatchedBy.tsx`.

**iOS phase (A12) — SHIPPED 2026-06-26.** Additive contract: a `Watcher {key,name}` shape + a
`watchers: Watcher[]` (`.default([])`) on `MarketName` + `Dossier` in `shared/contract.ts`, populated in
`lib/feed.ts` (`watchersFor()`), verified live (`/api/market`, `/api/dossier`). Native: `Watcher` struct +
`var watchers: [Watcher]? = nil` on both Swift models, a `WatcherStack` view in `Theme/Components.swift`
(overlapping bundled `Image(key)` faces — no new file, so no pbxproj edit) wired into the Market row +
Stock header, and single-actor promote copy. Member photos on iOS are bundled assets keyed by cam/graham,
so the wire carries `key`, not a photo path. Distributed to TestFlight 2026-06-26. The mobile
watchlist/universe split stays status-based for now (watch-driven mobile is a later follow-up).

### D79 — The Race gains scoring + an overview/day-matrix (per-call, mark-to-now) (Cam, 2026-06-25)
**Context:** Phase 1/2 of The Race (D68) produced rows but `/race` was a flat reverse-chron list of
side-by-side lanes — no way to see who's winning, no history, no scoring. It needed a scoreboard.

**Decision:** Score every model's calls and turn `/race` into an overview.
- **Champion races on its parsed PROPOSAL, not its executed trades** — so all lanes are scored on
  identical hypothetical terms (apples-to-apples with shadows that never reach the gate). Its call =
  its strongest `TradeProposal` that session; the real fund NAV stays a separate, honest number.
- **Mark-to-now, PER-CALL** (Cam chose per-call over collapsing repeats into a position): each
  session's BUY/SELL is its own scored bet from an entry snapshot to the live price; a name
  re-called across check-ins counts each time (repeated conviction). SELL scored directionally.
- **A "race" = one ET trading day**; history navigates day-by-day (Today-style).
- **Overview** = one tile per model (the FULL configured roster, not-yet-raced ones faded), tiles
  show paper P&L / hit rate / vs-XIC / activity+conviction; **day detail** = a per-session call
  matrix (scales to 8 models) + day standings + date nav.

**Why it's safe:** Read-only analytics over the existing `ShadowRun` shadow data — the §6 gate, the
kill switch, and the real fund are untouched. Additive schema only (`entryPriceCents`/`entryCurrency`).

**Changed (web):** `ShadowRun.entryPriceCents`+`entryCurrency`; `agent/sessions.ts` (champion-call
capture + entry snapshots, `parseProposal`/suffixes extracted to `agent/race/shadow.ts`);
`lib/race/{score,standings,models}.ts`; `lib/universe.ts currencyForSymbol`; `app/race/page.tsx`
rewrite + `app/race/[date]/page.tsx`; `components/race/*`; `scripts/backfill-shadow-entry.ts`
(one-time; a window-attribution bug in the champion backfill was found + fixed — bound each session
by the next). Deployed agent v1.50→v1.51.

### D80 — Bull Races: each model runs its own isolated paper account (Cam, 2026-06-25)
**Context:** The always-on `/race` measures *judgment* — every model reacts to the champion's book.
Cam wanted a second, richer thing: each model as a "bull" running its OWN account (cash, positions,
P&L), to answer "is Opus the right model?" on a level field and eventually tweak each bull's risk
and run/reset/spin-up configurable competitions ("8 bulls in the bull race").

**Decision:** A new `/bulls` feature that **coexists** with `/race` (Cam).
- **Total isolation:** its own tables (`Race`/`RaceEntrant`/`RacePosition`/`RaceTrade`/`RaceCall`/
  `RaceNavSnapshot`) + a small engine that reuses the sim fill MATH (`ibkrFixedCommissionCents` +
  ACB) but NEVER touches the real `Account`/`Position`/`Trade`, the §6 validator, or the broker.
- **Level field by construction:** every bull runs seed-only/no-tools, so Opus has no tool edge in
  the sandbox; the real tooled fund is a reference line only.
- **Per-bull risk = the goal:** `RaceEntrant.dial` reuses the fund's `DIALS` + a free-text
  `persona`; a LIGHT race gate (position cap, cash floor, weekly-buy cap, no-short — NOT the §6
  gate, and NOT universe-restricted) enforces them. CAD is the book currency, not a CA-only rule —
  bulls can buy any quotable US name (fills at live FX).
- **Menu = the whole RESEARCHED library** (tracked universe, ~81 names, with GRQ's dossier call per
  name), not just the 21 tradeable ACTIVE — the no-tools bulls allocate against the real research.
- **Phase A:** the engine + a standing House Race (8 bulls @ BALANCED, CA$25k) + `/bulls`
  leaderboard/chart/per-bull. **Phase B:** the configurable hub — member-only create / pick bulls /
  set dials+personas / start-pause-reset-delete / multiple concurrent races + versions.

**Why it's safe:** A pure sandbox proven byte-isolated from the real fund (`verify-bull-fill.ts`);
guardrail #1 holds because no model output ever reaches the real gate. Member-only mutations
(viewer → 403). Cost-bounded (daily cadence + the existing OpenRouter cap).

**Changed (web):** `schema.prisma` (6 Race* tables); `agent/race/{engine,context,shadow}.ts`;
`agent/runner.ts` (`runRaceTick` hook); `lib/race/bulls.ts`; `app/bulls/page.tsx`;
`app/api/bulls/{route,[id]/route}.ts`; `components/bulls/*`; `scripts/{seed-house-race,
verify-bull-fill,verify-bull-context}.ts`. Deployed agent v1.51→v1.52 (menu→tracked universe),
then v1.53. **Ops:** `scripts/` isn't in the agent image (`.dockerignore`) — seed/verify host-side
with the roster passed inline from root `.env`.

### D81 — News & events: stop throwing news away, stop flattening macro to one line (Cam, 2026-06-26)
**Context:** A knowledge-graph evaluation surfaced two more fundamental gaps underneath it. (1) FMP
news (`fmpNews` general + `fmpStockNews` per-symbol) is fetched on-demand for display (Today, The Wire,
the stock page) and **never persisted, never summarized, never seen by the agent** — the agent only
learns "what moved" by spending a `WebSearch` on the one name it's researching that hour. (2) Macro
(`lib/macro.ts`) feeds the agent only as a single current-**level** string via `macroLine()`; it never
sees the *event* (rates moved, CPI printed) and has no history or upcoming-event calendar.

**Decision:** Build **one persisted, triaged event layer, fanned out three ways** — agent context, the
existing human pages (Today / The Wire / stock-page news panel, which stop doing live raw-FMP fetches),
and a **news-driven wakeup** (the agent reacts to price ±4% and the clock today, but is blind to news
between sessions; a material headline on a held/watched name should fire a check-in via the existing
held-position trigger). **No new page** — this is plumbing under the two pages that already exist.

**Cost architecture (the load-bearing part):** three layers — **Capture** (deterministic FMP/macro
poll, dedup on URL, no LLM, ~free), **Triage** (a batched **Haiku 4.5** structured call: relevance
0–100, 1-line summary, entity tags, sentiment, category — pennies, only on new rows), **Serve** (Opus
sees only the bounded digest). **Opus never touches raw news**, so the feature stays off Cam's shared
Max quota.

**Cadence/volume/sources:** news ~3×/day (pre-open/midday/close) general + held/watched/focus per-symbol
only; macro keeps the 30-min poll but adds **delta→event** detection (the change is the signal, not the
level) + the FMP economic calendar for *upcoming* events; WebSearch stays the deep-dive layer. Retention
~90d news, indefinite `MarketEvent`. Sources are all FMP-tier we already pay for + BoC/FRED.

**Guardrail posture:** like smart money / The Race, news+events are an **INPUT the agent weighs, NEVER
the gate** — triage output can't place/size/block an order; a wakeup only schedules a check-in; the §6
validator is untouched.

**Two new tables (additive):** `NewsArticle` (captured + Haiku-triaged) and `MarketEvent` (macro deltas
+ calendar). Shipped as **M1 — macro→events** (small, self-contained) then **M2 — news capture+triage+
serve+wakeup**. The relationship **knowledge graph** is the explicit follow-on — the events flowing
through this pipeline are what a `CompanyEdge` set would propagate. Full plan + schema sketch:
`docs/NEWS-AND-EVENTS.md`.

---

### D82 — Daily build diary: a plain-English changelog for Graham (2026-06-26)
**Context:** Cam ships code through the day; Graham (the other owner) is finance-literate but not
technical and wants to stay on the same page about what's changing in the product — without reading
commits. Cam asked for an automatic daily summary, readable by Graham, with a date-changer to look back.

**Decision:** A nightly **"build diary"** — a new `Report` kind **`CHANGE`** (alongside EOD/WEEKLY),
generated by the agent runner at **3am ET every day** (incl. weekends) via `runDailyChangeReport()`.
It pulls the day's git commits from the **GitHub API** (`lib/github.ts`, fine-grained read-only PAT
`GITHUB_TOKEN`, repo `GITHUB_REPO`=camtora/grq, branch **`GITHUB_BRANCH`** — load-bearing: the commits API
defaults to the repo's *default* branch (main), but active dev is on a feature branch, so it must point at
the working branch (`feat/the-race`) or the diary is empty) and has an LLM rewrite them for Graham under a
dedicated non-technical persona (no file names / jargon; group by theme; lead with what matters to the fund). It's
surfaced as a new owner-gated **"Daily report"** tab on `/how-it-works`, reusing the Today page's `?d=`
day-changer + `Md` rendering.

**Window/dating:** covers the **3am→3am ET** window (so a late-night build session lands in ONE report)
and is **dated the day the work belongs to** (yesterday at generation time). The runner guards on a
`CHANGE` report already existing for that day (DB-count, like the EOD guard) so a restart can't re-run it.
Quiet days get a one-line note; a missing token no-ops cleanly (the day stays blank).

### D83 — Paper soak RESTARTED from a clean US$50,000 baseline after an IBKR paper reset (Cam, 2026-06-26)
**Context:** On 2026-06-25 a member balance-reset the IBKR paper account (DUQ779121) to set up a USD sleeve.
IBKR's "balance reset" — despite its *"shares will not be sold"* disclaimer — CLEARED every open position on its
**overnight cycle**: an administrative removal with no sale and no proceeds (cash unchanged, shares gone). The
2026-06-26 morning reconcile mirrored the wipe → NAV cratered → the drawdown guard auto-engaged the kill switch.
Diagnosed as NOT the agent, NOT the Bull Race (simulated), NOT a forced FX liquidation — the reset itself.

**Decision:** Treat it as a clean restart rather than reconstruct the old book (the CAD had been deliberately moved
to USD). TSM sold flat (order #29); account re-funded to 71,050 CAD → converted to **US$50,000.00** (FxRequest #11). Then:
- **Re-anchor:** `PAPER_INCEPTION` → **2026-06-26 noon ET** (now `GRQ_PAPER_INCEPTION`-overridable, no rebuild to retune);
  a fresh NAV baseline snapshot ($71,099.61 CAD-equiv) — a new high-water mark, so the drawdown math self-clears.
- **Reset-detection guard:** `reconcile()` now FREEZES the mirror + alerts (risk) instead of mass-deleting + false-cratering
  NAV when ≥2 positions vanish in one tick with NO sell on record (the reset / bad-read signature).
- **Honesty over erasure:** prior buys stay as real history; each cleared name got a per-stock `SYSTEM` note (why + entry +
  current price; most were UP when cleared — e.g. ATD +13%) + a fund-level `LESSON` so the weekend retro excludes these
  closures from attribution. No fabricated sells, no wiped ledger.
- **Stamp:** agent → **v2.1-phase4**; a `DECISION` journal entry records the restart. Soak day 1 = 2026-06-26.

**Why GitHub API (not a git mount or host cron):** keeps it in the existing runner/agent scheduler with
**no host-filesystem coupling and no git binary in the container** — just one read-only secret. (Considered
a read-only `.git` bind-mount and a standalone host cron; the PAT was the cleanest separation. Cam's call.)

**Cost:** one small Opus summarization session/day (no tools, ≤4 turns) on the Max token — negligible vs the
daily check-ins/EOD. **Changed:** `schema.prisma` (`CHANGE` enum), `lib/github.ts` (new), `agent/sessions.ts`
(`runDailyChangeReport` + diary persona), `agent/runner.ts` (3am task), `app/how-it-works/page.tsx` (tab +
day-changer), `scripts/gen-change-report.ts` (manual regen). Owner-only, same as the rest of How GRQ works.

### D84 — Agent FX is bidirectional AND proactive: fund a gate-clearing buy from the idle sleeve (Cam, 2026-06-26)
**Context:** The fund holds CAD and USD as separate cash (D34/D62). FX was one-directional in the agent's tooling —
`request_fx` only converted **CAD→USD** to fund a US name; the reverse (USD→CAD) existed in `lib/fx-requests.ts`
(D65) but was members-only. So when the post-reset book went ~all-USD (US$39k + CA$79.61), the agent treated an
empty sleeve as a hard wall — "CAD buys need CAD; CAD's empty → skip the CAD name" — and never reached for the
conversion it had no proactive prompt to use.

**Decision (two layers, both code-gated):**
- **Bidirectional tool:** `request_fx` now takes `{direction: CAD_TO_USD | USD_TO_CAD, amountToCents}` and sizes the
  opposite leg at the BoC rate (`agent/tools.ts`). `validator.ts` gained the symmetric native-CAD guard (a CAD buy
  short on native CAD is refused with a pointer to `request_fx USD_TO_CAD`, instead of failing downstream at the
  broker — the combined CAD-equiv floor couldn't catch a CAD shortfall masked by a flush USD sleeve).
- **Proactive, not an escape hatch:** the cash-by-currency context (`context.ts`) + the over-ceiling mandate
  (`sessions.ts`) now say a thin sleeve is NOT a reason to skip a **gate-clearing (≥Buy/75)** name — size a conversion
  to the position you'd open (currency needed + fee/slippage buffer) and `request_fx` to fund it (e.g. "want ~CA$3,000
  of a Canadian name, hold only dust in CAD → request_fx USD_TO_CAD ~CA$3,100, then buy"). Guardrails unchanged: only
  ≥75 names, a **member approves every conversion**, not for trivial/dust amounts, and every order still clears §6.
- **Stamp:** agent v2.1→**v2.2** (bidirectional) → **v2.3** (proactive). NB nothing fires while no CAD name clears 75
  (best was LNR at 74 on 2026-06-26).

### D85 — Parallel dossier research, and the per-session MCP-server bug it exposed (Cam, 2026-06-26)
**Context:** Dossiers drained strictly one-at-a-time (a global `sessionRunning` mutex + one `findFirst` per tick), so a
weekly/daily refresh of dozens of names crawled over ~2h. Each dossier is independent (read data → write ONE
JournalEntry, no trades, no cross-deps), so it's embarrassingly parallel.

**Decision + the bug:** `processResearchQueue()` now grabs up to `RESEARCH_CONCURRENCY` QUEUED rows and runs them via
`Promise.all` under the session lock (so the pool never overlaps a decision/check-in session). BUT the first run at
concurrency 5 **dropped research**: 4 dossiers in one batch (ABBV/MU/NEM/AEM, 2026-06-26 18:04) all failed
"wrote no dossier entry" — the concurrent sessions **shared one module-singleton in-process MCP server**
(`grqResearchServer`), and the SDK's in-process server isn't safe for concurrent sessions, so `write_journal` clobbered.
**Fix:** the research + read-only MCP servers are now **factories** (`makeResearchServer()` / `makeReadOnlyServer()`) —
a FRESH server per session (`agent/tools.ts`, `agent/sessions.ts`, `agent/chat-server.ts`), so parallel dossiers (and
two members chatting at once) never share an instance. Interim safety: `RESEARCH_CONCURRENCY=1` in `.env` keeps it
serial until the fix is verified under load; flip to 5 to re-enable. Agent → **v2.4**.

**Update (2026-06-26 PM):** a re-attempt at concurrency was reverted again ("concurrent broke, changed it back" — Cam),
so the per-session-factory fix is **deployed but still UNVERIFIED under load**, and it may not even be sufficient: the
Agent SDK's `query()` may not support multiple concurrent in-process sessions at all (shared subprocess/transport/auth),
in which case real parallelism needs separate **worker processes**, not just MCP-instance isolation. Honest post-mortem:
the original concurrency=5 was **deployed without ever exercising the concurrent path** (tsc + reasoning only), so it
shipped a silent regression — it failed quietly (FAILED rows + a Discord alert, no crash) and was oversold as "live, 5×".
Cam's call: low-risk on paper, fine to ship unproven code/mistakes — the alerts caught it.
**Key economics (why serial may be RIGHT, not just safe):** parallelism does NOT reduce tokens, only the **burn rate**.
A full-universe refresh is ~**104 names × ~287k ≈ 29M tokens**; serial spreads that across hours / multiple 5h Max
windows, while 5× slams it into ~1/5 the time → 5× the burn against the window → MORE likely to hit the cap and throttle.
So 5×'s only payoff is **intraday wall-clock** (a member kicks N dossiers and waits) — for the **overnight** weekly
full-pool refresh (Sun 02:00 ET) it buys nothing and hurts the quota. **Plan:** keep serial; watch tonight's/this
weekend's run token cost on `/admin/usage` (the 5h-window panel now polls live); revisit concurrency afterward, likely
scoped to intraday on-demand only, and only after a REAL concurrency fix + a verified load test.

### D86 — Chat reaches every researched name; stock-page back link does true browser-back; small web-UX pass (Cam, 2026-06-26)
- **Chat universe roster (`agent/chat-server.ts`):** the read-only chat only carried held/focus dossiers (`buildContext`),
  so it wrongly told members a CANDIDATE name "hasn't been researched" (e.g. BlackBerry — dossiered as both `BB`/USD and
  `BB.TO`/CAD). It now gets a company-grouped roster of every tracked name + a persona rule to read the dossier by exact
  ticker before answering and to **ASK which listing** when a name maps to more than one (BB vs BB.TO).
- **Stock back link (`components/StockBackLink.tsx`):** was hardcoded "← universe"/"← the hunt" regardless of origin.
  Now a client `router.back()` (with a same-origin/history fallback to the section default) — labeled "← back", it
  returns to wherever you actually came from (watchlist→watchlist, etc.) for ALL ~40 entry points. Chose browser-back
  over threading a `?from=` param through every link source.
- **"GRQ's call" mislabel (`page.tsx`, `StockTable.tsx`):** an unresearched name showed the technical-signal fallback
  under a "GRQ's call" header → relabeled "Technical signal" + muted, so nothing reads as GRQ's verdict before it's filed.
- **Token-usage live poll (`lib/usage.ts`, `RollingWindowPanel.tsx`, usage-window route):** the 5h-window burn was a
  one-shot server prop that froze between window-boundary refreshes; now polled (`GET /api/admin/usage-window`) so the
  number tracks the live clock. Also: watchlist search bar made as visible as the cards + "find a stock"; redundant
  watchlist sub-header removed; Universe row dropped from Settings → System.

### D87 — Rebaseline contributions + the TSX benchmark to the soak restart (Cam, 2026-06-26)
**Context:** [D83](#d83) re-anchored `PAPER_INCEPTION` to the 2026-06-26 noon-ET reset and re-funded the paper
account to a clean **US$50,000**, but it did NOT touch the `Contribution` table — the same gap
`relaunch-contributions.ts` patched one reset earlier. So `Contribution` still held the **2026-06-25 launch
baseline (CA$60,585 @ XIC 5570)**. `reconcile()` mirrors broker cash/positions but never writes contributions,
so the US$50k reset capital read as **phantom P&L**. One stale baseline produced three lies on the live dashboard:
- `totalPnl = NAV − contributions = +CA$10,571` of fake gain (the "+10,000");
- the **XIC benchmark was apples-to-oranges** — fund NAV started today, XIC anchored to a pre-reset 5570;
- and because `PAPER_INCEPTION` is *today*, `app/page.tsx` finds no pre-today NAV snapshot for the day-open and
  **falls back to `contributionsCents`** (`dayOpenNav = dayOpenSnap?.navCents ?? pf.contributionsCents`, ~L323),
  so the Today header + `MarketIndices` strip showed a fake **+17.4% "today"** and claimed GRQ was "ahead of every market."

**Decision:** Rebaseline the contributions to the account as it actually sits post-reset, anchored to TODAY's TSX.
`scripts/rebaseline-soak-restart.ts` (sibling of `relaunch-contributions.ts`) wipes the stale rows and writes the
restart capital as **US$50,000 (CAD-equiv @ live fx 1.4186 ≈ CA$70,930) + CA$79.61 CAD residual**, both anchored to
**today's XIC mid (5574)**. NAV history kept (the tape/chart already filter to `PAPER_INCEPTION`). Verified live:
- contributions **CA$60,585 → CA$71,009.61**, XIC anchor **5570 → 5574**;
- total P&L **+$10,571 phantom → +$71.28** (real, since the restart); GRQ vs TSX = **+$71.28 since restart** (both start today);
- `/api/fund-day` `dayPnlPct` **+17.4% → +0.10%**, so the day-vs-all-markets strip now compares GRQ's real move to each index.

**Why a data op, not a code change:** the day-open *fallback* and the benchmark math are both correct — they were
fed a stale baseline. The contributions table is the source of truth for "money in" and only these one-off scripts
(+ `seed.ts`) write it; the agent never does, and `reconcile()` deliberately doesn't. Fixing the rows fixes every
surface at once (`getPortfolio` / `fund-day` / `nav-tape` recompute live; the next `NavSnapshot` stores the corrected
benchmark). **Honesty caveat (unchanged from the USD-sleeve design):** the CAD baseline is fixed at the reset-day fx
(1.4186), so future CAD/USD moves on the US$50k sleeve surface as P&L — same convention as [D34](#d34)/the launch baseline,
not new. **Reversible** — prior values were CA$25k + US$25k @ XIC 5570. **Lesson for the next paper reset: re-run this
after [D83](#d83)'s re-fund, or the new capital reads as phantom gains.**

### D88 — Tier 3 options positioning, self-computed from CBOE's free feed (Graham's ask, Cam, 2026-06-27)
**Context:** Graham wanted options data — the long-dark [tier 3](DATA-SOURCES.md). The fund **never trades options**
(hard guardrail), so the use is purely a *signal about the underlying* (dealer positioning, fear/greed), fed in like
everything else — an INPUT it weighs, never the gate. Timed to the fresh post-[D83](#d83) soak so it's part of the
validated baseline rather than a mid-soak change.

**Sourcing — researched the landscape, chose to self-compute (≈$0):**
- **FMP (our existing feed) has no options** — probed it directly, every options endpoint 404s.
- Vendors compared: FlashAlpha (pre-computed GEX/Greeks; free tier only 5 req/day, Basic **$79/mo**), Polygon/"Massive"
  ($29 but you build GEX yourself + no IV on the cheap tier), ThetaData ($40), Unusual Whales ($250). A premium feed is
  the *only* thing that would have forced rationing options to held names; Cam (cost-conscious vs the operating hurdle)
  chose to **self-compute instead.**
- **Winner: CBOE's free, keyless, exchange-sourced delayed-quotes JSON** (`cdn.cboe.com/.../options/{TICKER}.json`),
  which carries the full chain INCLUDING per-contract **greeks** (gamma/delta) + IV + OI + volume. So even GEX needs no
  vendor — we compute everything. No subscription, no rate limit. Verified live (TSM negative/volatile + put-heavy;
  AAPL positive/pinned + call-heavy; LNR correctly null as a CA name).

**What we compute (`lib/options/signals.ts`):** put/call ratio (OI + volume), net **dealer GEX** + regime, call/put
**walls**, ~30-day ATM **IV**, 25-delta **skew**. **GEX sign convention** is the standard retail one — calls +, puts −,
gamma×OI×100×spot²×0.01 over near-money strikes — so *positive* = dealers dampen (range-bound/pinned), *negative* =
amplify (trendy/volatile). That sign is a modeling **assumption**, not gospel; the regime interpretation hangs on it.

**Architecture:** `lib/options/{cboe,signals,store}.ts`; cache table `OptionsDaily` (one row per name per ET day).
`refreshOptions()` is cache-through with **hourly freshness** (re-fetch a covered row > ~55 min old) and a **day-scoped
persisted negative cache** (`covered=false` — a name with no listed options won't grow one intraday, so we remember the
miss and never re-hit CBOE for it). Wired everywhere it informs a decision: the **dossier prompt** (so the agent weighs
positioning on ANY US name it researches — the research-input use, not just the universe), the **agent context** (held/
focus names), and a compact **stock-page panel** + 6 glossary explainers (legible to a non-options reader — the literacy
pillar). Runner refreshes ~hourly during market hours for held+watched+focus. Coverage map flips tier 3 `none → live`.
Page layout: the options panel (regime left, 4 metrics in one row) sits above a 3-panel equal-height row (Valuation ·
Related · Smart money, the last now always-rendered). Agent → **v2.6**.

**Caveats (honest):** CBOE's endpoint is free/unofficial (could change — same risk class as our Yahoo dependency);
**US-only** (CA single names stay dark — thin/no listed options); ~15-min delayed, daily-to-hourly granularity (OI itself
only settles overnight, so the OI-based signals are inherently daily; hourly captures IV/spot-driven drift). **iOS
parity** (the options panel in the mobile dossier response) is a deferred follow-on.

### D89 — Tier 8 social sentiment (8a), self-aggregated from free Reddit/Stocktwits feeds (Cam, 2026-06-27)
**Context:** With options ([D88](#d88)) live, social sentiment was the last *prioritized* dark tier (tier 10 alt-data is
parked "at scale"). The [data-sources doc's](DATA-SOURCES.md) own steer: ship it as **velocity-of-mentions on holdings —
a crowding/RISK read — before any buy signal**, and put it in the source scoreboard **on probation** (noisy, easily
gamed). Like every tier it informs, it **never gates** a trade; the §6 order gate is unchanged. Timed into the fresh
post-[D83](#d83) soak so it's part of the validated baseline.

**Sourcing — probed the landscape from the host, chose free aggregators (≈$0):**
- **FMP social sentiment is DEAD** — its v4 endpoints 403 as "Legacy" (only for subscriptions before Aug 31 2025; our key
  is from 2026-06-15) and `stable` has no replacement (404). So the free-because-we-already-pay path is gone.
- **X/Twitter rejected on cost** (~$100+/mo basic) — same call as the paid options feeds in D88.
- **Reddit's old unauthenticated `.json` is blocked** (403 from datacenter IPs — needs OAuth now).
- **Winners (both free, keyless, verified live):** **ApeWisdom** (`apewisdom.io/api` — pre-aggregated Reddit mention
  counts + `mentions_24h_ago` velocity + rank deltas; the "CBOE-equivalent" — someone already does the scraping, and it
  even lists SPCX, whose CDR we hold) for the velocity signal, and **Stocktwits** (`api.stocktwits.com/api/2/streams/
  symbol/{T}.json` — each message carries a user-tagged `entities.sentiment.basic` Bullish/Bearish) for crowd mood.

**Two design refinements the real-data prototype (`scripts/social-prototype.ts`) surfaced:**
1. **Mention floor (≥5/day).** At the bottom of a ~1000-name board, a 1-mention name swings rank by 60+; below the floor,
   velocity is pure noise. Sub-floor names are stored (`covered=false`) but never surfaced.
2. **Compute velocity vs OUR stored ≤7-day average, not ApeWisdom's 24h field** — immune to *when* we poll (the vendor's
   rolling window reads "cooling" mid-session for everything). This is the reason to keep our own `SocialDaily` table
   rather than just proxy the feed live; day-1 falls back to the vendor ratio until history banks.

**Architecture:** `lib/social/{sources,store}.ts`; cache table `SocialDaily` (one row per name per ET day). `runSocialRefresh()`
pulls the boards once, joins our tracked set (held+watched+focus — same `newsTargets()` the news/options tiers use), adds
Stocktwits per loud name (concurrency-capped), and upserts mentions/velocity/rank/bull%/a derived **0–100 buzz** score.
Refreshes **~every 6h around the clock** (retail buzz builds nights/weekends — NOT market-gated), self-throttled by a 6h
freshness gate. `refreshSocialOne()` is the on-demand single-name path the stock page uses. Wired into the **agent context**
(held/focus, flagged "ON PROBATION — weigh lightly"), the **dossier prompt** (any researched name), and a **stock-page
`SocialPanel`** + 3 glossary explainers (buzz/velocity/sentiment — the literacy pillar). Coverage map flips tier 8 `none → live`.
Agent → **v2.7**.

**Caveats (honest):** **US/meme-centric** — CA and off-radar names go dark (`covered=false`), though "no crowd to unwind"
is itself a useful read on a holding. Both feeds are free/unofficial (could change — same risk class as Yahoo/CBOE).
Sentiment is self-tagged and gameable → that's exactly why it's on probation. **8b (the planned follow-on):** our own
**Reddit OAuth client** scanning custom subs **including Canadian ones** (r/Canadianinvestor, r/Baystreet, r/Wealthsimple
— closing some of the CA hole no aggregator covers) + Haiku sentiment, layered into the same `SocialDaily` store. Needs a
Reddit script-app `client_id`/`secret` from Cam. **iOS parity** is a deferred follow-on (same as D88's).

**Follow-up (same day) — two bugs the social work surfaced + a quality hardening (Cam):**
- **`stripSuffix` ignored `.US`** (`lib/fmp.ts` regex was `(TO|V|NE|CN)` only). Four US names were stored as `TICKER.US`
  (an inconsistent internal tag — the other 95 US names are bare), so their CBOE/options lookup hit `MU.US` → 404 →
  **options were silently dark for all four** (and any FMP call routed via the stored symbol rather than `yahoo`). Fixed by
  adding `US` to the regex (now matches `bareTicker`). No real FMP ticker carries these suffixes, so it's strictly safe.
- **No URL canonicalization** → `/stocks/MU` (untracked lookup) and `/stocks/MU.US` (the tracked member) rendered as TWO
  pages, each caching options/social and **auto-queuing research under a different symbol** — a split-brain where the agent
  (which reads dossiers by the universe symbol) was blind to half its own research on those names. Fixed with
  `canonicalMember()` (`lib/universe.ts`) + a redirect: a URL that resolves to a member by bare ticker 301s to the canonical.
- **Resolution (Cam chose "bare + merge"):** renamed the 4 universe rows `.US → bare` to match the other 95 US names and
  where the agent naturally writes (0 positions/trades on any, so safe), and **merged** the duplicate data — repointed
  JournalEntry/ResearchRequest/NewsArticle (no symbol-unique) and dedup-renamed Bar/StockWatch; dropped the re-derivable
  Quote/Social/Options caches to rebuild under bare (`scratchpad/migrate-us-to-bare.sql`). Now `symbol == yahoo` for these.
- **Bot/quality hardening (the 8a "on probation" made teeth):** the prototype showed ~38% of a name's Stocktwits sentiment
  came from thin/young/shotgun-cashtag accounts. `fetchStocktwitsSentiment` now **screens** those out; `buzz` takes an
  **upvotes-per-mention quality haircut** (organic discussion gets upvoted, comment-spam doesn't) and `socialLine` flags
  low-engagement. Still never gates — just a less-gameable signal. Agent → **v2.8**.

### D90 — The Race: shadow standings use a bounded $50k virtual book (2026-06-27)

**Bug (Cam):** the `/race` overview showed llama "holding" **659 TSM ≈ $250k** on what's meant to be a $50k account.
Root cause in `lib/race/standings.ts`: the shadow race had **no portfolio at all** — it naively summed `qty` across
*every* BUY call per name (`e.shares += r.qty`). llama made two TSM BUY calls in different check-ins (10 + 649) → 659.
Worse, `score.ts` weights paper P&L by that ungrounded qty (`pnlNativeCents = move × qty`), so the headline number and
leaderboard rank were driven by whatever share-count a model happened to blurt — pure noise. (The $50k/`startingStakeCents`
concept only ever existed in the *separate* Bull Race, `lib/race/bulls.ts`.)

**Fix (read-time only, no schema, web-only deploy):** each mind now **replays its calls through a fixed $50k virtual book**
(`lib/race/book.ts` `replayBook`, stake = `RACE.shadowStakeCents`, CAD board). Rules, Bull-Race-flavoured: a re-proposed BUY
of a held name is a **no-op** (re-stated conviction, not a fresh buy — kills the 10+649 accretion); a new BUY can only spend
the cash on hand (qty capped to fit); SELL closes a held name (no shorting); IBKR commission folded in. **P&L = NAV − stake.**
The per-call **scorecard** (hit rate / avg return / vs-XIC, all size-agnostic via `returnBps`) is unchanged — re-calls still
count each time there. `ModelStanding` shape preserved, so `ModelTile`/`SessionMatrix` are untouched bar copy. Verified
against live data: llama → **10 TSM** (not 659), every model's NAV bounded to ~$50k. Tunable via `GRQ_RACE_SHADOW_STAKE_CENTS`.
**Known limitation:** no per-name position cap, so a model that over-sizes one call can run ~all-in on a single name within
its $50k (honest reflection of its sizing; add a cap later if it muddies the read).

### D91 — The Options Desk: a sandbox A/B for "champion + an options tool" (Graham's ask, Cam & Graham, 2026-06-27)

**Ask (Cam & Graham):** *"We don't understand options — build another test like the Race/Bulls that pits our champion
(Opus 4.8) against a version of itself that ALSO has a tool to trade options, and teach us the concepts along the way."*
First we untangled the misconception baked into the ask: **options are NOT shorting.** A **put** is the defined-risk way to
bet a stock falls; a **call** is a leveraged bet it rises. The live fund can only buy/hold/sell *shares*, so it literally
can't profit from a decline — a put gives Opus that for the first time. Full primer + design: **docs/THE-OPTIONS-DESK.md**.

**Decision (scope locked with Cam/Graham):** a **third sibling** to Second Opinions (`/race`) and Bull Races (`/bulls`),
living at **`/options-desk`** under a new header **"Experiments"** dropdown (Race · Bulls · Options Desk). It's a Bull-style
SANDBOX with **two arms on the same menu/cadence**: a **control** (Opus, stock-only = the live fund) vs a **treatment**
(Opus + the power to **BUY** calls/puts). **Buy-to-open ONLY** — never sell/write, never spreads, no shorting → every
position is defined-risk (max loss = premium). The treatment is a *superset* (stocks + options), so it tests "the champion
*plus* a new power," not a hobbled options bot.

**Build (Phase 1 SHIPPED + deployed 2026-06-27, agent v2.10-phase4):**
- **Isolation (guardrail #1):** new `agent/options-desk/engine.ts` mirrors the Bull engine — `applyDeskFill` writes ONLY to
  the new `OptionsDesk`/`Desk*` tables, NEVER imports `validator.ts`/`placeOrder`/the broker, and never trades a real option
  (guardrail #3 untouched — it bans options on the *real* path; this is a sandbox like the Bulls). `scripts/verify-options-fill.ts`
  proves the real fund is byte-identical after a fill, and that the **control arm is hard-blocked from options**.
- **Pricing (the one real gap):** the D88 CBOE parser dropped bid/ask — `lib/options/cboe.ts` now keeps them, and
  `lib/options/price.ts` marks a contract by **CBOE delayed mid → last → Black-Scholes-from-IV**, settles expiries to
  **intrinsic**, and **deterministically picks** the contract (next 30–60-DTE expiry, ATM/slightly-OTM by delta) so the
  comparison is about judgment, not strike-fiddling (the interpretation-trap control). MODELED, not executable — bannered.
- **Schema (additive):** `OptionsDesk` + `DeskEntrant`(arm) + `DeskPosition`(polymorphic STOCK|CALL|PUT) + `DeskTrade` +
  `DeskCall` + `DeskNavSnapshot`. Books CAD; options US-only, filled USD at live FX.
- **Page + literacy:** `/options-desk` shows both arms (reusing the Bull NAV chart), and every open option renders a
  **plain-English teaching card** (breakeven, max loss, days-to-expiry, "what this bet means") + a five-terms explainer —
  the literacy payoff (`docs/LITERACY.md`). Seeded "House Desk" (CA$50k/arm, daily) via `scripts/seed-options-desk.ts`.
- **Verified live:** the verify priced a real AAPL 2026-07-31 $285 call end-to-end; isolation held; control blocked.
**Deferred (Phase 2/3):** the auto-updating cards + expiry-settlement card, member desk controls, spreads/premium-selling
(re-opens unlimited risk — kept off), feeding the desk the D88 GEX/skew signals. Open Qs (name/cadence) in the design doc.

### D92 — The Options Desk Phase 2: literacy layer + member controls (Cam, 2026-06-28)

Continuation of D91. Scope locked with Cam (two forks decided): the per-session **push nudge** is its own **muteable**
category, **default ON** (not in the always-on tier); and the **per-option decay sparkline** gets built (not deferred).
Four workstreams, all SHIPPED 2026-06-28:
- **A · Punchline cards (web).** Closed/expired option legs (`SELL_TO_CLOSE`/`EXPIRE`, already carrying `realizedPnlCents`)
  now render a plain-English retrospective + realized CAD P&L + return %. `lib/options-desk/desk.ts` `closedCard()` +
  `resolved[]`; `components/desk/DeskRow.tsx` "Resolved options" section. Return % reconstructed cleanly from exit value −
  realized via the loaded FX rate — no engine change.
- **B · Member desk controls (web).** `app/api/desk/route.ts` (create — auto-builds the control+treatment pair) +
  `app/api/desk/[id]/route.ts` (start/pause/end/reset/delete), both `memberFromRequest`-guarded; `DeskControls` +
  `NewDeskForm`; the page resolves the session, shows a desk switcher when >1, and renders controls member-only. Mirrors the
  Bull scaffold. Verified: create/pause/start/reset/delete round-trip + a viewer-create 403 + delete cascades clean.
- **C · Push nudge (agent).** New `optionsDesk` push category (muteable, default ON) across `lib/push/notify.ts`
  (`NotifCategory`/`PREF_FIELD`/`PrefRow`) + `lib/push/categories.ts` + the `NotificationPreference.optionsDesk` column;
  the settings UI/API pick it up from the catalog automatically. `agent/options-desk/engine.ts` fires `notifyOut(...,
  {category:"optionsDesk"})` on a treatment open, a sell-to-close, and an expiry settlement — each best-effort (`.catch`),
  no symbol deep-link (points the reader at the desk, not a dossier).
- **D · Decay sparkline (schema+agent+web).** Additive `DeskPositionMark` table (per-session per-open-option premium,
  cascades on close/expire); `refreshOptionMarks()` appends a row each session; `desk.ts` exposes `decay[]` (mark − entry)
  per open option; `DeskRow` draws a Sparkline ("premium vs entry — drifting below the line is time decay"). The doc's #1
  lesson, made visible.

`AGENT_VERSION` → **v2.13-phase4**. One `prisma db push` (the prefs column + the marks table). Pure sandbox — the §6 gate,
the broker, and guardrail #3 are untouched. The Resolved section + decay sparkline populate as the desk runs live (first
sessions Mon 2026-06-29). Phase 3 (spreads, premium-selling, tooled arms, GEX/skew, member-briefed desk) stays deferred.

### D93 — Confidence levers: "what would change our mind" on every call (Cam, 2026-06-28)

Cam's ask: we rate stocks with a confidence number — can we surface what would make us *more* confident? "If we had this
information, that would reframe my confidence." The bottom-line card showed a bare 0–100 with no decomposition of what's
pinning it below 100. This makes the **epistemic state of each call legible** — and ties straight into the literacy pillar
(a confidence number we can't explain is, by our own standard, a bug). Scope chosen: **Full v1, structured** (not just
markdown), so the data can later power a re-rate-on-resolution loop and a research-queue action.

The model — every call's confidence is held down by **two kinds of unknown**:
- **data-gap** — info that EXISTS but we don't have (read the latest 10-Q, no guidance feed, insider feed dark) →
  *retrievable*, a research action.
- **catalyst** — an EVENT that resolves an uncertainty on a known horizon (earnings, an FDA date, a ruling) → *watched*,
  not retrievable.

Each **lever** is `{gap, direction (up→buy / down→sell / tighten→two-sided), magnitude (small/moderate/large), kind,
trigger, retrievable}`. Two sources feed the panel:
1. **Agent-filed levers** (thesis-specific) — the agent commits 2–4 falsifiable levers per dossier via a new
   `write_journal` field, forced to be specific ("Q3 gross margin > 42%", not "macro clarity"). Stored as
   `JournalEntry.confidenceLeversJson`; parsed/sorted (largest-magnitude first) by `lib/confidence-levers.ts`.
2. **Structural gaps** (deterministic, free, no LLM) — the decision-relevant dark/partial tiers (fundamentals, insider,
   institutional, earnings, news) read straight off the existing 10-tier coverage map.

UI: a new **"What would change our mind"** card (`components/ConfidenceLevers.tsx`) under the bottom line — direction arrow
+ magnitude chip + catalyst/data-gap tag + trigger per lever, then a muted "data we don't have on this name" row. Glossary
term `confidence-levers` added (literacy). **Pure display — it never touches the order gate.**

**SHIPPED + deployed 2026-06-28 (web + agent).** Web went out in its own build (structural gaps render immediately; a
transitional empty-levers message shows until the agent fills them). One `prisma db push` (additive nullable
`confidenceLeversJson` — expand-safe). The **agent half** (tool field + dossier prompt) rode the **same `v2.14-phase4`
agent deploy as D92** (concurrent Options Desk Phase 2 work on this branch — the boot universe-scan was suppressed, so no
Max-quota hit) rather than waiting for a separate Sunday rebuild; v2.14 is the shared stamp for the combined deploy. Levers
populate as names are re-researched (first dossier runs Mon 2026-06-29). **Deferred follow-ons:** wire a per-lever "research
this" action (data-gaps) to the dossier kick; the
**re-rate-on-resolution / calibration loop** (when a catalyst date passes or a gap closes, re-run and log the confidence
delta — "we predicted +15, it moved +18"); and the mobile/contract surface.

### D94 — Chess Moves: thematic / supply-chain reasoning (David Touchette's pitch, Cam, 2026-06-29)

David's experiment: narrow on an industry or an interrelated subset of stocks (a supply chain), *grok* how the pieces
connect, name the **force in motion**, and forecast the **2nd/3rd-order plays** before the market reprices them — "like
Buffett would do" (really: supply-chain / second-order thinking). Cam chose **full feature**, in the **Experiments**
dropdown, **on-demand briefs + a weekly self-picked "board of the week."**

A member briefs a theme/chain in plain English (`ChessBar` → `POST /api/chess` → a PENDING `ChessTheme`); the agent
(`runChessMoves`, Opus, research-only) maps the value chain, writes the thesis + confidence levers, and enumerates 8–12
ripple-effect **plays** (each tagged BENEFICIARY/VICTIM and by effect order, heat-ranked via `lib/heat.ts`), saving it all
through one new `save_chess_board` tool. The runner picks up PENDING themes off-schedule (rate-guarded, off the boot scan)
and enqueues a `WEEKLY` board Sunday ~12:00 ET. `/chess` (list) + `/chess/[id]` (the board: chain lanes + thesis + levers +
plays).

**Honesty bar (load-bearing):** there is **no supply-chain data feed** — the chain is the agent's web-researched
*reasoning*, persisted, framed as probabilistic ripple bets, never imported fact (same leads-not-verdicts discipline as
D46). **Guardrail #1 untouched:** Chess Moves never trades; a play becomes tradeable only via the normal Research →
`runStockDossier` → §6 gate path.

**KG tie-in (Slice 2 persist, delivered here):** `save_chess_board` writes the board's chain LINKS into `KnowledgeEdge`
(new `chain` source, both directions, bare-ticker keyed); `relatedFor` merges them so each play's stock-page **Related
names** panel surfaces the relationship. The deterministic graph scan is taught to never wipe `chain` edges.

New models `ChessTheme`/`ChessPlay` (one expand-safe `prisma db push`). Config in `policy.ts → CHESS`
(`GRQ_CHESS_ENABLED`, 3 boards/day, weekly toggle). `AGENT_VERSION` → **v2.15-phase4**. Full spec: `docs/CHESS-MOVES.md`.
**Deferred:** iOS/contract surface, a force-directed SVG board (v1 is lanes + a links list), a per-stock "in play" badge.

### D95 — Conviction gate lowered 75% → 70% (Cam, 2026-06-29)

Cam dropped the BUY conviction bar from **75% → 70%** (`HARD.minBuyConfidence` in `agent/policy.ts`). A hard
guardrail, changed in code by a human (the only sanctioned path — D11 / guardrail #1; the agent never edits this).
Rationale: open the aperture slightly so genuinely-good 70–74% ideas can act, rather than being filtered out by a
bar that was a round number, not a calibrated one. The fund still acts only on its stronger calls — just one notch
wider.

**Coupled consequence (intentional):** `SELF_INVEST.minConfidence` is defined as `HARD.minBuyConfidence`, so the
**self-promote eligibility bar moves to 70% too** — the agent can now promote a researched candidate into its
tradeable universe at ≥70% conviction (was ≥75%). `SELF_INVEST.allowedStances` is unchanged (still Strong Buy / Buy
only — it must still be a genuine buy call).

**Everything else in the §6 gate is unchanged:** kill switch, daily-loss pause (−3%), drawdown kill (−15%), no-fly /
block-demote-kill, weekly-buy + order-rate caps, position-size cap, per-currency cash floor, no-margin and
no-shorting funding rules, fee-edge gate. This is a single-threshold change, not a posture overhaul. It lands during
the active IBKR-paper soak — a deliberate, member-directed loosening of the conviction bar, logged here for the
record. `AGENT_VERSION` → **v2.26-phase4**.

### D96 — Wider net, denser cadence: 30-min check-ins + 12–18 leads + self-scheduled follow-ups (Cam, 2026-06-29)

The 2026-06-29 EOD was candid about the failure mode: zero trades, the entire focus list (NVDA/GOOG/GEV/VRT/MU)
stuck just under the conviction bar, USD sleeve 77.5% idle. Alfred's own diagnosis — "widen the search." Cam's
direction: research more names per check-in, and don't wait a full hour between checks. Three coordinated changes,
none of which touch the §6 gate (still humans-only; every buy clears it):

1. **Cadence → every 30 min** (`CHECKIN_TIMES_ET`, 10:00→15:30, **12:30 omitted** so the midday brief keeps its
   half-hour). Was hourly 10:00–15:00. The 60-min match window in `runner.ts` is kept wide so a slot still catches
   up if a long session overruns.
2. **Self-scheduled follow-ups, encouraged.** The check-in + position prompts used to say "prefer `add_agenda`; only
   `schedule_checkin` if it genuinely can't wait an hour." Flipped: after queuing a dossier on a name it wants to act
   on, the agent `schedule_checkin`s a ~20–30 min return to decide once the research lands — rather than waiting for
   the next slot. `HARD.maxDecisionSessionsPerDay` 6 → **14** so those follow-ups aren't starved by position-trigger
   escalations (fixed check-ins remain budget-exempt).
3. **Breadth: 12–18 LEADS, not full dossiers.** The check-in mandate went from "research ≥5 new names (each
   `add_candidate` → a full dossier)" to a three-stage shape: **WIDEN** (vet 12–18 fresh names as cheap one-line
   leads, seeded by the Market-Base-Layer screen now injected into the check-in via `huntAvoidAndSeed`), **DEEPEN**
   (only the ~2–4 with a credible path to ≥Buy/70 get the expensive `add_candidate`/`request_research` full Opus
   dossier), **DEPLOY** (promote + put idle sleeves to work). Check-in `maxTurns` 20 → 45 for the room.

**Why the leads/dossiers split is load-bearing:** the literal ask (12–18 full dossiers × 12 slots/day) would queue
~150–200 background Opus dossiers daily ≈ 3× a full universe refresh, every day — it would exhaust Cam's shared
Max quota before noon and the 5-wide research queue couldn't drain it. Casting wide is nearly free (a WebSearch +
a one-liner); the dossier is the cost, so it's reserved for names that earn it. Parallel research
(`RESEARCH_CONCURRENCY=5`) cuts the clock, not the token total, so it isn't the lever for breadth — the funnel is.
This is the same principle behind covering the ~10k-name market: cheap deterministic + Haiku tiers screen everything;
Opus depth is spent only on the survivors. `AGENT_VERSION` → **v2.27-phase4**.

### D97 — Tier 11: the agent SEES members' personal holdings (read-only, can't touch them) (Cam, 2026-06-29)

> **⚠️ REVERSED by [D104](#d104--reversed-agents-are-blind-to-members-personal-holdings-again-cam-2026-07-02) (2026-07-02).** The agent (and the chat agent, which shares the same context) no longer sees members' personal holdings — the Tier 11 block below was removed from `buildContext()`. The rest of this entry is retained for history.

Cam: "we should let the agent SEE what we hold, but it cannot obviously touch the account." The fund manages only
*part* of Cam's & Graham's money; their personal brokerage holdings (TD TFSA etc.) already sync **read-only** via
SnapTrade (`connectionType=read`, `lib/external/*`) for the human-only `/accounts` page — but were deliberately
walled off from the agent. This wires that data into the agent's **decision context** as a new data tier (**Tier 11**,
`docs/DATA-SOURCES.md`), so the agent can weigh **cross-account concentration** when picking — without ever being
able to trade those accounts.

**Implementation:** `agent/context.ts` `personalAccountsBlock()` → a Tier-11 section in `buildContext()` listing each
member's holdings (value + % of their book), flagging any name the FUND also holds ("⚠ FUND ALSO HOLDS — combined
household exposure"). Framed as "an INPUT you weigh, NEVER a gate; their money, their calls." Best-effort (a SnapTrade
hiccup degrades to "(none linked)", never breaks context); values marked live by `accountsForMembers`.

**The hard wall is unchanged and explicit (guardrail #1):** this is a *read into a context string*, not a tool and not
an order path. The agent has **no** tool that touches a personal account; the broker seam, the §6 gate, and every
order route still see only the fund's own IBKR account. Reading external holdings creates no new way for model output
to move money — it cannot trade, rebalance, or place anything in a personal account, by construction. A member kill
switch for the *visibility* itself (not the trading wall, which is structural): `GRQ_AGENT_SEES_EXTERNAL=off`, no
deploy needed. `AGENT_VERSION` → **v2.28-phase4**.

### D98 — Stop the 30-min check-ins colliding: hunt → 8am, fire-window 60 → 25 min (Cam, 2026-06-30)

**Symptom.** Cam: the 10:00 and 10:30 check-ins were running back-to-back. Confirmed live on 2026-06-30 — the
`Scheduled check-in 10:00` marker landed at **10:31 ET** and `Scheduled check-in 10:30` at **10:41 ET**: two
decision-capable Opus sessions ~10 min apart, near-duplicate context, wasted tokens + Max quota.

**Cause.** Two things compounded. (1) D96 (2026-06-29) halved the check-in cadence (hourly → every 30 min,
`CHECKIN_TIMES_ET` = 10:00…15:30) but left the per-slot **fire window at 60 min** (`runner.ts`: `m >= slot &&
m < slot + 60`). With slots 30 min apart, every 60-min window overlapped the *next* slot, so a check-in deferred
by lane contention could fire minutes before the following slot. (2) The agent runs **one session at a time**
(held under `sessionRunning`); the **daily broad hunt ran at 10:00**, monopolizing the single lane exactly when
the first check-in came due — so 10:00 deferred until the hunt freed the lane (~10:31), landing right on top of
10:30.

**Fix (two moves, chosen by Cam).**
- **Hunt → 8:00–8:30 ET** (was 10:00), `runner.ts`. Pre-open, so the heaviest single-lane consumer drains before
  the trading day and the lane is free when the 10:00 check-in comes due.
- **Fire window 60 → 25 min** (`slot + 25`). 25 < the 30-min cadence ⇒ adjacent windows never overlap; a slot
  whose lane stays busy past its window is simply dropped (the next slot covers it) rather than doubling up.

Not chosen: a min-gap coalesce guard (preserves the wide window, suppresses a check-in <N min after the last) and
reverting to hourly — Cam picked the narrow-window + earlier-hunt combination, which removes the *contention* as
well as the *overlap*.

**Unchanged:** the §6 order gate, the conviction bar (70%, D95), the check-in cadence itself (still every 30 min,
D96), and the budget exemption for fixed check-ins. This is purely *when* sessions fire, not *whether* a trade
clears. `AGENT_VERSION` → **v2.30-phase4**. Shipped + deployed 2026-06-30 (web change shipped same session: the
Portfolio personal-lane gained a per-share **Price** column + a **Positions total · CAD** footer row).

**Same-session follow-ups (2026-06-30):**
- **Guardrail-display drift fixed (web).** Confirming the per-name concentration cap surfaced that `RiskDial.tsx`
  carried a *hardcoded* copy of the dial caps — still **10/15/25** — while the gate (`policy.ts` DIALS) enforces
  **25/50/80** since 2026-06-29. So Settings told a member Aggressive = 25% while the §6 gate permitted 80%: a
  money-guardrail the UI under-stated. Fix: the Settings page (a Server Component) now **derives the dial cards
  from `policy.ts` DIALS** and passes them to `RiskDial` as a prop — one source of truth, no second copy to drift.
- **Options Desk cadence daily → hourly.** `OptionsDesk.cadence` flipped in the DB (the engine reads it per tick,
  so no rebuild). The desk now runs ~once/hour per arm during market hours instead of once/day. v1 is all-Opus, so
  this raises the desk's Max-quota draw ~7× (still small relative to dossiers/scans); the metered-$ cap is moot at $0.
- **Agent prompts: stale 75% conviction bar → 70% (agent v2.31).** Same drift as the RiskDial bug, on the OTHER
  side of the gate. D95 lowered `HARD.minBuyConfidence` 75→70 (the gate enforces 70), but the agent's *prompts* still
  hardcoded **75** in the always-on context (`context.ts` ×3), the persona (`persona.ts` ×2), the self-invest tool
  descriptions (`tools.ts` ×4), `sessions.ts` (the self-invest step), and the read-only chat persona
  (`chat-server.ts`). So the agent was *told* the bar was 75 every session — effectively self-censoring at 75 and
  not acting on the 70–74% names D95 was meant to unlock. Fix: every reference now **interpolates
  `${HARD.minBuyConfidence}` / `${SELF_INVEST.minConfidence}`** (plain tool-description strings use inline
  concatenation), so prompt and gate share one number and can't drift again. `AGENT_VERSION` → **v2.31-phase4**.

### D99 — Alfred trades options: buy-to-open long calls/puts, behind a real OFF-by-default guardrail (Cam, 2026-06-30)

**Decision.** Give the LIVE fund agent (Alfred) the ability to **buy-to-open long calls and puts** on US
underlyings it already trades — a defined-risk instrument (max loss = premium) weighed alongside stock, cleared by
the same §6 gate. Scope is **buy-to-open only** (Cam); short/written legs, spreads, margin, and CA options stay out
(rules #3 unchanged). Timing: **build now against IBKR paper, behind an OFF-by-default toggle**; real-money options
remain a *separate, later, humans-only* flip after the soak (rule #6). This is NOT the Options Desk sandbox
(`docs/THE-OPTIONS-DESK.md`), which stays exactly as-is — this is the real money path. Full spec:
**`docs/ALFRED-OPTIONS.md`**.

**Key finding that shaped it.** Options weren't *blocked* in code — they were *unrepresentable*: there is no
`if (option) reject` anywhere (verified across `validator.ts`/`sim.ts`/`guardrails.ts`); `PlaceOrderInput` simply
had no contract field, and CLAUDE.md rule #3's "config toggle that is OFF" **did not exist in code**. So this is
additive engineering across four stock-only layers, and step one is making the guardrail *real*.

**Phase A — foundation (shipped to the branch, soak-safe, verified — `tsc` clean + 50/50 tests):**
- **`Settings.allowOptions Boolean @default(false)`** — the real, enforced, member-only "no options" switch
  (Alfred never writes it — rule #1). Plus a `GRQ_OPTIONS_ENABLED` env hard-kill (DESK/RACE pattern); **both**
  must be true. Enforced at the **broker seam** (`sim.ts` + `ibkr.ts` `placeOrder` now intercept `input.option`
  before any stock fill — so an OPT order can never silently fill as the underlying STOCK).
- **`OptionPosition`** model (one underlying → many contracts; `Position` is keyed by `symbol` and can't hold
  them) + additive nullable option columns on `Order`/`Trade` (`secType @default("STK")` + right/strike/expiry/
  multiplier). Additive ⇒ the entire equities path + every existing row is byte-for-byte unchanged.
- **`PlaceOrderInput.option`** wire field, `OPTIONS` policy block (4% premium-at-risk/NAV cap — tighter than the
  sandbox's 8%; 3 opens/wk; 30–60 DTE; US-only), and `breachesOptionPremiumCap`/`optionPremiumCents` §6 math +
  unit tests.

**Phase B — also shipped to the branch (soak-safe, `tsc` clean + 52/52 tests):** `validateAndPlaceOption` gate
branch (`agent/validator.ts`) + `SimBroker.fillOption` (open/close on the real `OptionPosition` ledger,
USD-funded, no-margin + close-only SELL enforced) + NAV valuation (`getPortfolio`/`writeNavSnapshot` add
held-option premium via `lib/options/order.ts`) + the option commission helper. Reuses the proven Options Desk
path (agent picks right+bias; `pickContract`/`markContractCents` on the live CBOE chain). The tick-level mark
refresh + expiry settlement ride Phase D's runner wiring (not dead-coded mid-soak).

**Phases C–D (next):** IBKR OPT conid/order/reconcile (⚠️ blocked on **Graham** enabling options permission +
OPRA market-data on the paper account `DUQ779121` — until then the ibkr seam cleanly rejects, so sim is the only
fill path) → `propose_option_order` tool + context + the runner mark/expiry tick + UI. Deploy bumps
`AGENT_VERSION` (D77) and respects the check-in window.

**Unchanged:** the §6 order gate, kill switch, no-shorting/no-margin/no-naked-options, integer-cents/whole-units,
and the soak gate before real money. Buy-to-open long calls/puts behind the toggle is the *only* relaxation.

### D100 — Options education portal: learn / play / watch / ask (Cam, 2026-06-30)

A new top-level **`/options`** hub to teach Cam & Graham how options work — the optionsprofitcalculator.com
equivalent, plus lessons, the experiment's live fake positions, and options-aware chat. **Education only,
modeled, never executable** — it touches none of the §6 gate, the broker, or the live fund. Distinct from the
Options Desk experiment (`/options-desk`, D91/D92) it *surfaces* and from Alfred Options (D99, real-fund options).
Full spec: `docs/OPTIONS-PORTAL.md`. **Decisions (Cam):** top-level tab (not the Experiments dropdown) · v1
strategy set of **4** (long call, long put, covered call, cash-secured put — the two short-leg ones taught as
contrast; the fund still only ever *buys* options) · **live CBOE chains in v1**.

**Built + deployed 2026-06-30 (web + chat; agent untouched, no `AGENT_VERSION` bump; not committed).** Four tabs:
- **Learn** — 5 plain-English lessons, every term a `<Term>` (16 new options glossary keys).
- **Calculator** — the centerpiece: pick a strategy, type a real US ticker to prefill a live CBOE contract, read
  an interactive **payoff diagram** (`PayoffChart`, hover crosshair + at-expiry & modeled-"today" curves + break-
  evens), stat cards, live **Greeks**, and a price×date **P/L heat table** with a **probability of profit**.
- **The Experiment** — `loadDesk()` → the treatment Opus's actual open + resolved contracts with the plain-English
  card, break-even/max-loss/days-left, the **value-over-time (decay)** line, and a one-click **"load into calculator."**
- **Ask** — opens the read-only chat, now options-aware (`get_options_desk` tool + an education persona block:
  explain / show the experiment / suggest hypotheticals that deep-link the calculator — still never trades).

**New code (all schema-free):** `lib/options/{payoff,greeks,strategies,probability}.ts` (pure, integer-cents;
greeks + probability are new — we only *read* CBOE greeks before), `app/api/options/chain/[symbol]` (read-only
live-chain feed), `components/options/*`, `app/options/page.tsx`. Reuses the existing `price.ts` Black-Scholes +
the free keyless CBOE feed. **74/74 unit tests, `tsc` clean.**

**Phase 5 (grow) — 2026-06-30 (deployed):** the calculator went **4 → 8 strategies** (added bull call spread,
bear put spread, long straddle, long strangle) via a leg-template model (`strategies.ts`); **saved scenarios**
(`localStorage`); a **greeks-vs-price visualizer** (`GreeksChart`); **deeper per-strategy explanations** (view /
profit-when / lose-when / decay / worked-example / best-for); and **durable per-contract mark history** —
`DeskTrade.markHistory` (additive, pushed to prod), the desk engine (**agent v2.33-phase4**) snapshots each
option's decay curve at close/expire so **closed** contracts keep a value line (surfaced in the Experiment tab).
The agent redeploy suppressed the startup scan (pre-seeded guard marker; markets closed). **Still open: mobile
parity** (iOS). 74/74 tests, `tsc` clean; web+agent+chat redeployed; not committed.

### D101 — The Short Lab: study short selling in a permanent sandbox (Cam, 2026-06-30)

A standalone `/short-lab` (Experiments menu) to **study and learn short selling** — the one bet the fund
can't make and the only one with **unbounded loss**. **Modeled, never executable; the fund never shorts
(rule #3, unchanged)** — a learning surface, not a loosening. Full spec: `docs/SHORT-LAB.md`. **Decisions
(Cam):** both (interactive human lab now, autonomous agent A/B arm later) · **full mechanics** (borrow fee,
margin + forced-cover margin call, short-interest/squeeze context, dividends) · a **standalone** lab, not
folded into the options portal.

**Phase 1 — the interactive human lab — BUILT + DEPLOYED 2026-06-30 (not committed).** You open a modeled
short on a real US name (size by shares or $ notional) → proceeds credit a virtual $100k book + a buy-back
liability. Positions mark to the live quote, accrue a modeled borrow fee, and get **force-covered on a
margin call** (equity < maintenance requirement) — verified end-to-end (short 17 AAPL → equity held at
$100k at open, no false call, cover + reset clean). Reuses the options payoff engine for the unbounded-loss
diagram + a short-vs-put link. Marking is a **no-LLM runner tick** (`runShortLabTick`, throttled ~4 min,
market-hours-gated) → **zero Opus tokens**; only Phase 2's arm spends quota.

**Code:** `lib/short/mechanics.ts` (pure, cents; 12 tests — locks the margin call) · `lib/short/lab.ts`
(engine + read) · 5 `Short*` tables (pushed to prod) · `app/api/short-lab` · `agent/short-lab/tick.ts`
(wired into the runner) · `components/short/*` + `app/short-lab/page.tsx` · nav entry · 5 glossary terms ·
`PayoffChart` gained an `expiryLabel` prop. **86/86 tests, `tsc` clean.** Agent redeploy = `AGENT_VERSION`
v2.33→**v2.34-phase4** (D77); startup scan suppressed (markets closed). **Phase 2 — the agent A/B — BUILT + DEPLOYED 2026-06-30 (OFF, not committed).** A control Opus (long-only)
vs a treatment Opus (long + may short), same $100k stake, mirroring the Options Desk: 6 `ShortDesk*` tables
(pushed to prod) · `agent/short-lab/{desk-engine,desk-context,desk-parse}.ts` (BUY/SELL/SHORT/COVER fills,
mark + force-cover margin call, cadence tick) · `SHORTDESK` policy caps · `lib/short/desk.ts` (auto-seeds a
control+treatment contest, PAUSED) · the `/short-lab` Agent-A/B panel + start/pause/reset · `runShortDeskTick`
wired in the runner. **Behind `GRQ_SHORTLAB_AGENT` (off) AND ships PAUSED** — spends Opus tokens only once a
member Starts it and the flag is on. Agent redeploy: `AGENT_VERSION` v2.34→v2.35-phase4 (D77); scan suppressed.
86/86 tests, `tsc` clean.

**Phase 3 — grow — mostly BUILT + DEPLOYED 2026-06-30 (not committed).** ✅ **Shadow-short-our-sells** (the
centerpiece): every real-fund stock SELL is mirrored as a modeled short at the sell price (`lib/short/shadow.ts`,
idempotent via `ShortPosition.sourceTradeId`), marked over time; a `/short-lab` panel shows "what if we'd shorted
our exits?" (avg return, win-rate), and a one-line lesson feeds the live agent's `buildContext` (an input on
whether exits keep falling — never an action; the fund still can't short). ✅ **Dividend debits** — a short owes
the dividend; `fmpDividends` (cached) folds ex-dates into the carry. ⏸ **Real cost-to-borrow / short-interest /
squeeze: DEFERRED** — FMP short-interest returns empty (no free feed), so borrow stays modeled (honest). Agent
`AGENT_VERSION` v2.35→v2.36-phase4 (D77); scan suppressed. 86/86 tests, `tsc` clean. Guardrails (§6 gate, kill
switch, rule #3, soak) unchanged — the fund never shorts. The Short Lab (Phases 1–3) is a permanent sandbox.

### D102 — Exchange-aware market calendar: trade the US sleeve on TSX-only holidays (Cam, 2026-07-01)

Prompted by Canada Day (TSX closed, NYSE open): the fund holds a USD sleeve, so it should keep trading
US names on a TSX-only holiday (and CA names on a US-only holiday). The calendar was TSX-only, so it (a)
sat the whole fund out on Canada Day and (b) latently mis-treated *US* holidays (July 4, MLK…) as open.

`web/agent/calendar.ts` now carries **both** `CA_HOLIDAYS` (TSX) and `US_HOLIDAYS` (NYSE) — the two share
the 9:30–16:00 ET session, only holidays differ — and `isMarketDay`/`isMarketOpen` take a `market`
param (`"CA"|"US"|"ANY"`, default `ANY` = either exchange open). The **§6 gate** (`validator.ts`) now
checks the ORDER's exchange (by `currencyForSymbol`): a USD name needs NYSE open, a CAD name needs the
TSX open — so on Canada Day a US buy clears and a CA buy is rejected ("Canadian market (TSX) is closed").
`buildContext` adds a ⚠️ note when only one exchange is open so the agent focuses on the tradeable sleeve.
`openExchanges()` exposes the split. Verified: Jul 1 → US open / CA closed; Jul 3 (US Independence
observed) → CA open / US closed; Christmas → both closed. 94/94 tests (8 new calendar tests). Deployed
web+agent (`AGENT_VERSION` v2.36→v2.37-phase4); scan suppressed. Guardrails otherwise unchanged — this
makes the market-hours rail MORE precise (it was TSX-only). Not committed.

### D103 — The Day-Trading Lab: prove it vs. buy-and-hold (Cam, 2026-07-01)

A standalone `/day-lab` (Experiments) to learn how day trading works and prove whether it beats holding.
**Modeled, never executable**; the live fund is code-blocked from same-day round trips (a §6 hard limit)
and that stays. Same family as the Options Desk (D91) + Short Lab (D101). Spec: `docs/DAY-TRADE-LAB.md`.
**Decisions (Cam):** the point is **"prove it vs buy-and-hold"** (a Trader arm vs a Holder arm on the
same name/day/cash) · **live paper** (mark against today's live ~15-min-delayed quotes; no new data).

Two virtual books: the **Trader** (you, churning — every fill crosses the bid/ask spread + pays a
commission) vs the **Holder** (mirrors the Trader's FIRST buy, then sits). A scoreboard shows each book's
P&L, round trips, and the Trader's total fees + spread — making the structural drag visible. Honest
caveat on the page: delayed quotes can't model scalping edge, so it demonstrates the *drag*, not a
winning strategy. Marking is a no-LLM tick (zero tokens).

**Phase 1 — BUILT 2026-07-01.** `lib/day/mechanics.ts` (pure, cents; 8 tests locking the drag — a churner
trails a holder on a flat tape) · `lib/day/lab.ts` (engine + read: start/buy/sell/flatten/mark/reset,
holder-mirrors-first-buy) · 3 `Day*` tables (pushed to prod) · `app/api/day-lab` · `agent/day-lab/tick.ts`
(`runDayLabTick`, wired in runner) · `components/day/*` + `app/day-lab/page.tsx` (Trader-vs-Holder equity
chart + verdict scoreboard + "past rounds" tally + education) · nav entry · 5 glossary terms (day-trading,
bid-ask-spread, slippage, pattern-day-trader, settlement). **102/102 tests, `tsc` clean.** Verified E2E:
start AAPL → buy 50 (Holder mirrors) → buy 10 more (Holder does NOT mirror) → flatten → Trader −$21 vs
Holder −$8.50, churn cost $21. Web DEPLOYED; **agent tick built + verified (v2.38) but swap deferred to a
safe window** (built near the 13:30 check-in with a session in flight — no urgency, the page marks on view).
**Phase 2** (rule-based auto-trader arm, not Opus) optional/later. Guardrails unchanged. Not committed.

### D104 — REVERSED: the agents are BLIND to members' personal holdings again (Cam, 2026-07-02)

Reverses **[D97](#d97--tier-11-the-agent-sees-members-personal-holdings-read-only-cant-touch-them-cam-2026-06-29)**.
Cam caught the **chat** agent (Alfred) reciting Graham's personal book unprompted — Graham asked "why is MU
dropping" and Alfred led with *"MU is 67% of your own book (~$108K)… 2/3 of your personal book."* Cam's ruling:
**"I do not want the chat agent to be aware of Graham's or my positions. Positions are a single metric — not a
decision-making factor."** Since the chat agent and the trading agent share **one** `buildContext()`, the Tier 11
block couldn't be given to only the trader — so, per Cam ("if it's a single context for both agents, then remove
it from both"), it was removed from **both**.

**Why the reversal:** the D97 bet was that seeing a member's holdings would help the agent weigh *cross-account
concentration*. In practice it did the opposite of what we want — it turned members' private money into an active
talking/decision surface for a model that has no business reasoning about it, and the chat agent (unlike the
trader, which never speaks to a human) surfaced it straight to the member. The concentration-awareness upside was
never worth exposing personal positions to the LLM.

**Implementation:** the entire Tier 11 section is **deleted** from `agent/context.ts` — `personalAccountsBlock()`,
its `bareKey` helper, the heading/preamble, the `${personalBlock}` interpolation, and the now-orphaned
`accountsForMembers` / `memberEmails` / `personByEmail` imports. `tsc` clean; both the **agent** and **chat** images
were rebuilt and recreated (verified the baked images contain zero `Tier 11` references — the stale-image guard).
The `GRQ_AGENT_SEES_EXTERNAL` env flag is now **inert** (no code reads it; safe to drop from `.env`). Three leaked
`ChatMessage` rows that the old code had already written were scrubbed from the DB — 2 in Cam's thread, 1 in
Graham's — found only on a broad both-threads sweep (the first pass, Cam-thread-only, missed Graham's).

**"Positions are a single metric" — preserved WEB-ONLY:** the nightly SnapTrade sync still mirrors holdings into
the DB for the human `/accounts` page, the `/portfolio` "Yours" lane, and the `ExternalDailyValue` day-change tile.
None of that ever enters the LLM's context. The app still shows household value; the agents simply can't see it.
The hard no-execution wall (D97/guardrail #1) was already structural and is untouched. `AGENT_VERSION` →
**v2.41-phase4**.
