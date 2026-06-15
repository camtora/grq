# GRQ — Autonomous AI Investing Fund

*"Get rich quick, slowly, with receipts."*

**Project:** GRQ (Get Rich Quick) — Claude-powered autonomous investing agent + dashboard
**Domain:** grq.camerontora.ca (live, SSO-protected, routed to port 3012)
**Users:** Cam & Graham — equal access, both hold the kill switch
**Initial contribution:** $5,000 CAD (Cam's money; a learning project for both)
**Status:** Phases 0–2.7 shipped — agent live-fire on the sim since 2026-06-12 (soak running), plus backups, per-member themes, stocks one-pagers, signals v1, source scoreboard, member directives, UI-managed universe + research dossiers, read-only viewer tier, FMP Ultimate data (analyst targets/peers/news), literacy explainers, the IA restructure (Market/Ideas/Research tabs), and the read-only agent chat. **Phase 3 (IBKR paper) gateway is proven** — headless 2FA via IB Key push logs in (D19) — but blocked externally on **IBKR account provisioning** (the brokerage `iserver` session won't establish until both members' brand-new accounts clear pending approval/agreements; applied 2026-06-12).
**Last updated:** 2026-06-15

---

## 1. Executive Summary

GRQ is a self-hosted web app where a Claude agent autonomously manages a real brokerage
account: it researches markets each morning, watches prices and news all session, places and
exits trades through a broker API within hard risk limits, and reports every evening on what
it did and why. The website (teal, naturally) is the window into the fund: balances, P&L,
holdings, trade history with the agent's reasoning, contributions, risk dial, fee budget, and
a kill switch.

**The two headline decisions this plan makes:**

1. **Broker: Interactive Brokers (IBKR) Canada.** Questrade is out — its API allows order
   placement for *approved partners only*; retail customers get read-only account/market data.
   IBKR is effectively the only Canadian retail brokerage with full API trading. It covers
   TSX + US markets, CAD + USD, and has a paper-trading mode we'll use before risking a dollar.
2. **Style: swing trading (multi-day holds), not day trading.** US day-trading rules restrict
   accounts under USD 25,000 to ~3 day trades per 5 days, and a $5K account can't absorb
   day-trading fees anyway. The agent watches constantly but trades deliberately.

**Biggest blocker:** opening the IBKR account (days of lead time — start now).
**Biggest reality check:** operating costs vs. a $5K principal (see §8 — there's a lean mode).

---

## 2. What Already Exists (Infrastructure ✅)

Done in the infrastructure project on 2026-06-11:

| Item | Status |
|------|--------|
| DNS `grq.camerontora.ca` (GoDaddy DDNS RECORDS) | ✅ |
| SSL (on `camerontora-services` cert) | ✅ |
| Nginx `29-grq.conf` → `host.docker.internal:3012`, WebSocket-ready | ✅ |
| OAuth2 SSO (Google), user identity via `X-Forwarded-Email` header | ✅ |
| Port 3012 reserved in the port map | ✅ |

⚠️ **Note:** the SSO allowlist (`oauth2-proxy/authenticated_emails.txt`) currently has **7
people** on it — everyone with wiki/media access could open GRQ. The app therefore enforces
its own member list via `X-Forwarded-Email`:
`GRQ_ALLOWED_EMAILS=cameron.tora@gmail.com,g.j.appleby@gmail.com` (decided 2026-06-11 —
**both admins, both hold the kill switch**). Everyone else on the SSO list gets a polite 403.

---

## 3. Broker Decision

| | Questrade | IBKR Canada | Wealthsimple / TD / banks |
|---|---|---|---|
| API order placement (retail) | ❌ partners only | ✅ | ❌ no public API |
| TSX + US markets | ✅ | ✅ | — |
| Paper trading | ❌ | ✅ separate paper account | — |
| Real-time data via API | ✅ (read) | ✅ (subscriptions) | — |
| Commissions (stocks) | — | ~CAD 1.00 min/order (Fixed tier) | — |

**Recommendation: IBKR Canada, non-registered margin account, CAD base currency.**

- **Non-registered, not TFSA:** CRA treats frequent/active trading inside a TFSA as carrying
  on a business → gains taxed as business income, and they actively audit this. A robot that
  trades weekly is the poster child. Non-registered keeps us in normal capital-gains land.
- **Margin (not cash) account**, but with margin *borrowing* prohibited by our guardrails.
  Margin accounts settle trades more flexibly (no good-faith violations recycling cash under
  T+1); we just never borrow. Alternative: cash account is fine too and dodges day-trade
  rules entirely — flagged in §10.
- **Canadian market first** (user preference): also avoids FX costs (IBKR conversions have a
  ~USD 2 minimum — 20 bps on a $1,000 conversion). US large caps can come later or when USD
  is funded directly.
- (Alpaca — the API-friendly US broker every tutorial uses — does not serve Canadian
  residents; Canadian dealer-registration rules. Mentioned so we don't relitigate it.)

### Known operational pain: headless IBKR auth

Retail accounts must authenticate the Web API through the **Client Portal Gateway** (a local
Java program); IBKR's gateway-free OAuth is institutional-only as of mid-2026. The standard
fix is **IBeam** (dockerized gateway with automated login/keep-alive). Sessions still drop
occasionally (nightly resets, 2FA prompts). Mitigations:

- Dedicated **secondary username** on the IBKR account just for the API (IBKR supports this;
  keeps your interactive login and the bot's session from kicking each other out).
- IBeam health-checked by the existing health-api / status dashboard; alert on session loss.
- **Protective stop orders rest at IBKR**, not in our code — if the server or session dies,
  downside protection still lives at the broker (see §6).
- **IBKR Flex Web Service** (simple token-based HTTPS, no gateway needed) as a second data
  path for statements, trade history, and NAV — the dashboard's history pages work even when
  the gateway is down.

---

## 4. How Money Flows (and what the app can/can't do)

```
TD / CIBC (CAD)  ──EFT (1–3 biz days)──►  IBKR account  ◄──trades──  agent
        ▲                                      │
        └──────────── withdrawals ◄────────────┘
```

- **Bank linking happens at IBKR, once** (Client Portal → link bank via micro-deposits,
  ~5 min). There is no consumer API into TD/CIBC — Canadian open banking still isn't usable
  for this — so our app will **not** hold bank credentials or move bank money in v1.
- **Deposits** ($5,000 initial, top-ups later) are initiated in the IBKR portal (recurring
  deposits can be scheduled there too). The dashboard detects and displays every contribution
  via Flex reports and includes them in return calculations (money-weighted).
- **Security property worth stating:** the app can only trade *inside* the account. IBKR
  withdrawals go to your verified linked bank only, and adding a recipient requires
  interactive 2FA. Worst case for a compromised app = bad trades (bounded by guardrails),
  never exfiltrated funds.

---

## 5. The Agent

### 5.1 "Constantly watching" — the honest architecture

Running an LLM in a literal infinite loop would cost a fortune and add nothing. The design
that gets the same outcome:

- A deterministic **orchestrator** (Node worker) holds IBKR **WebSocket streams** open all
  session — live quotes for holdings + watchlist, order/fill events, account updates. It
  reacts in milliseconds and runs 24/5 for pennies.
- The orchestrator **wakes the Claude agent** on schedule and on triggers:

| Wake reason | Examples |
|---|---|
| Schedule | 9:00 pre-market research · periodic intraday check-ins (e.g. every 30 min) · 16:15 EOD report |
| Price triggers | holding ±4% intraday, stop/target approached, watchlist entry hit |
| Event triggers | order filled/rejected, news headline on a holding, unusual volume |
| Human | risk dial changed, new contribution landed, manual "ask the agent" |

- **Two-tier model use:** Haiku triages cheap/frequent signals ("is this headline material?");
  Fable/Opus runs the morning research and any session that might place an order. Prompt
  caching keeps the repeated context (positions, rules, journal) cheap.

### 5.2 Daily lifecycle (ET) — note: TSX & NYSE close at **4:00 pm**, not 4:30

| Time | Activity |
|---|---|
| 9:00 | Pre-market: review overnight news, holdings, watchlist; write the day's game plan to the journal |
| 9:30–16:00 | Markets open: streams on; triggered + periodic agent sessions; trades only in this window (first/last 15 min restricted — open/close are noisy) |
| 16:15 | EOD report: day P&L, total P&L, each trade with reasoning, fees used vs budget, benchmark vs XIC, tomorrow's watchlist → dashboard + optional Discord webhook |
| Sunday | Weekly deep review: thesis check on every holding, performance attribution, lessons learned, proposed strategy tweaks, **capital recommendation** (contribute / hold / withdraw — §5.6) |

Market-holiday calendars (TSX ≠ NYSE) respected; nothing runs on holidays but the EOD report
still posts a "markets closed" NAV snapshot.

### 5.3 Where real-time data comes from

The data source upgrades with the phases — **the switch to "proper" real-time happens at
go-live (Phase 4)**, because that's the first moment latency can cost real money:

| Phase | Source | Latency | Cost |
|---|---|---|---|
| 2 — Sim | Yahoo Finance (`yahoo-finance2`; feeds the sim only) | ~15 min delayed | $0 |
| 3 — IBKR paper | IBKR delayed feed via the gateway (paper accounts get delayed data) | ~15 min delayed | $0 |
| **4 — Live** | **TSX Level 1 streaming** sub, billed to the account, cancel any month, no pro-rating | real-time | **~CAD 16.50/mo** (historical non-pro rate; budget 15–25 — exact figure shows in Client Portal at subscribe time) |
| 5 — US later | Cboe One (~USD 1/mo) or US Snapshot/Futures bundle (USD 10/mo, waived at USD 30/mo commissions — unreachable under our $20 fee budget) | real-time | optional |

Notes:
- Delayed data is fine for swing *decisions*; the sim charges IBKR-style commissions plus a
  spread haircut so results stay honest. But sim/paper measure **decision quality, not
  execution precision** — that's what Phase 3 on IBKR and real-time at go-live are for.
- **Protective stops rest at IBKR and execute on real-time exchange prices regardless of
  what data we subscribe to** — downside protection is never 15 minutes late.
- **News:** IBKR's bundled news feeds via the same API + the agent's web search tool during
  research sessions; Yahoo headlines fill that role during sim.

### 5.4 Fee-aware trading (a core requirement)

Before any buy, the guardrail engine computes the **full round trip**: commission in + est.
commission out + spread estimate + FX (if any). The trade is rejected unless the agent's
stated price target clears **≥ 3× round-trip costs**, and rejected regardless if the monthly
fee budget is exhausted. Fees used / remaining are always in the agent's context and on the
dashboard.

### 5.5 Memory, learning & accountability — the agent must improve itself

A continuously-learning agent is a first-class requirement (Cam, 2026-06-11):

1. **Thesis at entry.** Every trade is journaled with a falsifiable expectation: why, what
   should happen, by when, what would prove it wrong. Decisions *not* to trade are journaled too.
2. **Retro at exit.** When a position closes (or a passed-on idea resolves), the agent writes
   the post-mortem: outcome vs thesis — was the reasoning right even if the result wasn't,
   and vice versa (luck gets flagged as luck).
3. **Lessons memory.** Durable patterns distilled from retros ("my resource-stock theses
   underperform", "I exit winners too early") are stored and **injected into every future
   session** — the agent reads its own lessons before each decision.
4. **Weekly self-review.** Performance attribution, a grade on every open thesis, and
   **proposed strategy adjustments**. During sim/paper we approve these at the weekly
   tune-up; the agent's prompt/strategy config is versioned in git and stamped on every
   journal entry, so "v3 beats v2" is measurable, not vibes.
5. **Never self-modifiable:** the §6 hard limits. The agent improves its judgment, not its leash.

### 5.6 Capital recommendations (advisory only)

The weekly report ends with a **contribute / hold / withdraw** call, with reasoning: track
record vs XIC, confidence from the lessons base, and **overhead drag** — fixed costs (data
feed, commission minimums) shrink as a percentage on a larger account, so scaling up is
justified by a *proven* edge, not by hope. The agent is required to use the honest framing:
more capital doesn't raise ROI %, it amortizes overhead and adds diversification room.
Money only ever moves when a human moves it in the IBKR portal.

---

## 6. Guardrails (enforced in code — the model cannot override them)

The agent *proposes* orders; a deterministic validator *places* them. Hard limits, all
configurable in Settings, defaults below:

| Guardrail | Default |
|---|---|
| Universe | TSX-listed stocks & ETFs; price ≥ $2; avg daily volume ≥ 100k shares |
| Forbidden | options, shorting (toggle — see note), margin borrowing, crypto, warrants, OTC |
| Max single position | 20% of NAV |
| Max positions | 8 |
| Same-day round trips | prohibited (v1) — sidesteps US PDT limits entirely |
| Daily loss pause | −3% NAV realized+unrealized in a day → no new buys until tomorrow + alert |
| Drawdown kill switch | −15% from high-water mark → ALL trading halts until a human re-enables |
| Monthly fee budget | $20 (≈ 20 IBKR orders) — hard stop |
| Order types | limit orders; native stop-loss resting at IBKR on every position; market only for kill-switch liquidation |
| Rate limits | ≤ 10 orders/day, ≤ 4/hour |
| Manual kill switch | UI button + DB flag checked before every order — instant |

**Shorting is a config toggle, OFF for v1** (Cam, 2026-06-11) — a candidate to enable once
the paper soak proves the model out. Keeping the margin account is what preserves this
option: cash accounts can never short.

### Risk dial (UI Settings → maps to concrete numbers)

| | Cautious | Balanced (default) | Aggressive |
|---|---|---|---|
| Max position | 10% | 15% | 25% |
| Cash floor | 30% | 15% | 0% |
| Universe | broad ETFs + TSX60 | + liquid mid-caps | full whitelist |
| Stop-loss distance | 5% | 8% | 12% |
| Max new trades/week | 2 | 5 | 10 |

Tax-aware behaviours: track the **superficial-loss rule** (no rebuying within 30 days of a
loss sale — CRA denies the loss), and export-friendly records for ACB/T5008 at tax time.

---

## 7. System Architecture & Stack

```
                         INTERNET
                            │
            nginx-proxy (SSL, OAuth2 SSO)  ✅ done
                            │ X-Forwarded-Email
                            ▼ :3012
   ┌──────────────────────────────────────────────────┐
   │ grq-web — Next.js (UI + API routes)              │
   │   dashboard · portfolio · activity/journal ·     │
   │   reports · settings · kill switch               │
   └──────────────┬───────────────────────────────────┘
                  │ Postgres (Prisma)
   ┌──────────────┴───────────────────────────────────┐
   │ grq-db — PostgreSQL                              │
   │   nav_snapshots · orders · trades · positions ·  │
   │   journal · reports · settings · contributions   │
   └──────────────┬───────────────────────────────────┘
                  │
   ┌──────────────┴───────────────────────────────────┐
   │ grq-agent — Node/TS worker                       │
   │   orchestrator (schedule+triggers) · guardrail   │
   │   validator · Claude Agent SDK sessions          │
   │   (Haiku triage → Fable decisions)               │
   └──────┬───────────────────────────┬───────────────┘
          │ REST + WebSocket          │ HTTPS (Flex reports)
   ┌──────┴─────────────────┐         │
   │ ibeam — IB CP Gateway  │         │
   └──────┬─────────────────┘         │
          ▼                           ▼
       Interactive Brokers (paper → live)
```

| Choice | Decision | Why |
|---|---|---|
| Language | TypeScript throughout | matches whosup/shore/camerontora_web house stack |
| Web | Next.js (dark UI, **teal** accent, "Welcome, Cam & Graham" — personalized per `X-Forwarded-Email`) | camerontora_web precedent |
| DB | Postgres + Prisma | whosup precedent |
| Agent | Claude Agent SDK (TS) | tools: quotes, positions, news, web search, journal, propose_order |
| Deploy | Docker Compose in `~/grq` (web 3012, agent, db, ibeam) | house pattern; health endpoint `/api/health` for status dashboard |
| Secrets | `.env` chmod 600, never in git (ANTHROPIC key, IBeam creds, Flex token, allowed emails) | house pattern — remember the `$`-quoting rule |

---

## 8. Operating Costs — the honest math

| Item | Est. monthly |
|---|---|
| IBKR commissions | ≤ fee budget ($20 default) |
| Market data | $0 until go-live; then TSX L1 real-time ~CAD 16.50/mo (§5.3) |
| Claude API (full mode: daily research on Fable + triage on Haiku, with caching) | ~$40–120 |
| Server / domain / SSL | $0 (existing) |
| **Total** | **~$65–165/mo full mode · ~$25–45/mo lean mode** |

**On a $5,000 account, $100/mo of overhead = 24%/yr — the agent would need to beat Buffett
just to break even.** Options, pick one:

- **Lean mode:** Haiku-heavy, one Fable research session/day, delayed data until NAV grows —
  ~$25–45/mo (~6–11%/yr drag). Still steep, but defensible as tuition.
- **Claude Max subscription:** the Agent SDK can run on a Max plan's included usage instead
  of metered API (subject to its rate-limit windows) — marginal Claude cost ≈ $0 if you
  already subscribe. **Biggest single lever.**
- **Reframe:** this is R&D + entertainment that happens to be built properly; judge it
  against the benchmark and scale contributions only if it earns it.

**Decision (2026-06-11): the agent runs on Cam's Claude Max subscription.** The Agent SDK
authenticates with a token minted via `claude setup-token`; marginal Claude cost ≈ $0,
subject to Max rate-limit windows. If a window is exhausted mid-day the agent waits — fine
for swing trading. Lean-mode habits (Haiku triage, prompt caching) still apply to stay well
inside the windows.

Every EOD report shows **"vs. just buying XIC"** so the benchmark argument is always on screen.

---

## 9. Phases

Reordered 2026-06-11 so that **everything is built and exercised before the IBKR account is
even approved**: the broker sits behind an adapter with an env switch
(`BROKER=sim → ibkr-paper → ibkr-live`), so account opening runs in parallel and only
becomes the critical path at Phase 3. The **sim** is a full paper engine — once pointed at
real market data (Phase 2) it *is* the pseudo-IBKR account Cam asked for: **$5,000 of
imaginary money, real prices, real agent decisions, zero dollars at risk** — and the place
where we watch outcomes and tweak the agent before anything is live.

| Phase | What | Needs IBKR? | Exit criteria | Effort |
|---|---|---|---|---|
| **0 — Skeleton** | Repo, Docker, Next.js shell live at grq.camerontora.ca behind SSO: teal theme, "Welcome, Cam & Graham", email allowlist, `/api/health` | No | site loads for the two of us, 403 for anyone else | 1–2 days |
| **1 — Mock fund** | `BrokerAdapter` interface + **SimBroker** paper engine (positions, limit/stop fills, IBKR-style commissions, spread haircut) on synthetic data; full DB schema; every dashboard page working | No | dashboard fully navigable with a realistic fake fund | ~3–4 days |
| **2 — Sim fund, live fire** | SimBroker pointed at **real (delayed) market data**; pseudo-account seeded with **$5,000**; agent runs the full daily loop for real — research, trades, journal, EOD reports; **weekly tune-up reviews** of decisions vs outcomes, tweak and iterate | No | sim trading daily; reports worth reading; agent improving measurably | ~1 wk build, then runs continuously |
| **3 — Paper trading** | IBeam + `IBKRBroker` adapter on the **paper account**; Flex import; flip `BROKER=ibkr-paper` | **Yes** | **≥ 2 clean weeks on IBKR paper, ≥ 4 clean weeks total incl. sim** (defined below) | 2–3 days + soak |
| **4 — Live ($5,000)** | Review soak report together → flip `BROKER=ibkr-live`; Cautious dial week 1; deposit via IBKR portal (app deep-links to it) | Yes | running | small |
| **5 — Later** | US market + FX logic, shorting toggle?, scheduled contributions, tax exports; the sim keeps running forever as the **shadow sandbox** for A/B-testing agent changes before they touch real money | Yes | — | — |

### What "4 clean weeks on paper" means

IBKR gives every account a free **paper twin** — a simulator with fake money that speaks the
exact same API and fills orders against (delayed) real market prices. Phase 3 runs the entire
system for real — research, orders, fills, stops, journals, reports — except no dollars
exist. A week is **clean** when there were zero guardrail violations, zero unexpected orders,
and zero system failures that would have mattered with real money (a dead session while
holding positions counts; a cosmetic UI bug doesn't). Four consecutive clean weeks, with
returns at least in XIC's neighbourhood, and we flip the env var to the live account. Any
incident gets fixed *and* restarts or extends the clock. It's the difference between testing
a robot lawnmower in an empty lot and in your flowerbed.

**Sim weeks count (added 2026-06-11).** Phase 2's simulated fund runs the same agent on real
market data, so it accumulates *strategy* confidence while the IBKR account is still being
opened: clean sim weeks count toward the 4-week total. What the sim cannot test is the real
broker plumbing — gateway sessions, order acks, actual fills — so a minimum of **2 clean
weeks on IBKR paper** is required no matter how well the sim went. If the sim banks ≥ 2
clean weeks during account opening, real money is ~2 weeks after IBKR approval.

Realistic go-live with real money: **mid-July 2026** if the IBKR application starts this
week — the soak is the deliberate bottleneck and it's non-negotiable.

---

## 10. Decisions Log (all resolved 2026-06-11)

| # | Decision | Outcome |
|---|---|---|
| 1 | Broker account | **Open IBKR Canada: non-registered, margin, CAD base.** Borrowing banned by guardrails; margin chosen partly to keep the future shorting toggle possible. Cam starts the application — the only external dependency |
| 2 | Whose money | Revised 2026-06-12: **single-owner — all Cam's OR all Graham's, final call before the IBKR application.** App is ownership-agnostic by design (joint + two-account options also documented & supported): `docs/OWNERSHIP.md`. A learning project for both either way |
| 3 | App access | Exactly `cameron.tora@gmail.com` + `g.j.appleby@gmail.com` — **equal admin, both hold the kill switch** |
| 4 | Guardrails | **Approved as specified in §6.** No shorts in v1 — config toggle, revisit after the paper soak proves the model |
| 5 | Claude cost | **Cam's Claude Max subscription** (token via `claude setup-token`) |
| 6 | Paper gate | **Agreed** — ≥ 4 clean weeks, defined in §9 |
| 7 | Name | Confirmed: **Get Rich Quick.** Tagline adopted: *"Get rich quick, slowly, with receipts."* |
| 8 | Learning & advice | **The agent must continuously learn from its own outcomes** (thesis → retro → lessons → weekly self-review, all versioned — §5.5) and give a weekly contribute/hold/withdraw recommendation (§5.6, advisory only). Gate re-confirmed: no real-money trading until 4 clean weeks build model trust |

## 11. Known Concerns & Blockers (acknowledged in design)

| | Concern | Where handled |
|---|---|---|
| 🟥 Blocker | IBKR account opening lead time | §10.1 — start now |
| 🟥 Risk | No guarantee Claude generates alpha; LLMs are confidently wrong sometimes | paper soak (§9), benchmark on every report (§8), guardrails (§6) |
| 🟧 | Overhead vs. $5K principal | §8 cost modes |
| 🟧 | Headless IBKR session drops | §3 — IBeam + secondary username + broker-side stops + alerts |
| 🟧 | US day-trade limits under USD 25k | §1/§6 — swing design, no same-day round trips |
| 🟧 | TFSA audit risk / tax treatment | §3 non-registered; §6 superficial-loss tracking |
| 🟨 | All 7 SSO users could reach the app | §2 app-level allowlist |
| 🟨 | Home server/power/internet outage mid-position | broker-side stops (§6), existing monitoring + Discord alerts |
| 🟨 | Market close is 16:00 ET, not 16:30 | §5.2 (so EOD report lands ~16:15, not after 16:30) |

---

## 12. Build Runbook — who does what, in order

### Cam & Graham (human steps)

| When | Step |
|---|---|
| **Now** | Start the **IBKR Canada application** (non-registered, margin, CAD base — needs ID, SIN, employment info; approval takes days). Everything else proceeds without it |
| **Now** (5 min) | Mint the agent's Claude Max token: type `! claude setup-token` in this session; the token goes into `.env` |
| **On IBKR approval** | In Client Portal: enable the **paper trading account** (instant) · create a **secondary username** dedicated to the API · hand paper credentials to `.env` |
| **Before go-live** | Link TD/CIBC via EFT (micro-deposits) · subscribe to TSX Level 1 real-time data · generate a **Flex Web Service** token · deposit the $5,000 (app deep-links to IBKR's funding page) |

### Claude (build steps)

| # | Step | Phase |
|---|---|---|
| 1 | `git init`; scaffold: Next.js web + agent worker + Postgres, docker-compose on port 3012; `.env` template (chmod 600, mind the `$`-quoting rule) | 0 |
| 2 | Allowlist middleware on `X-Forwarded-Email` (two emails, both admin); teal dark theme; "Welcome, Cam & Graham" + tagline; `/api/health`; **deploy — site live behind SSO** | 0 |
| 3 | `BrokerAdapter` interface + `SimBroker` paper engine (positions, limit/stop fills, IBKR-style commissions, spread haircut) on synthetic data; Prisma schema: nav_snapshots, orders, trades, positions, journal, reports, settings, contributions | 1 |
| 4 | Dashboard pages: overview (NAV, P&L, contributions), portfolio, activity + agent journal, reports, settings (risk dial, fee budget, **kill switch**) | 1 |
| 5 | Agent worker: orchestrator (market-hours schedule + triggers), guardrail validator (§6, shorts OFF), Agent SDK on the Max token (Haiku triage → Fable decisions), prompt caching | 2 |
| 6 | **Sim goes live-fire:** SimBroker on real delayed quotes (yahoo-finance2); pseudo-account seeded with **$5,000**; full daily loop for real — morning research, trades, journal, EOD report vs XIC; optional Discord webhook; **kill-switch fire drill** | 2 |
| 7 | **Weekly tune-ups:** review every decision vs its outcome; tweak prompts/strategy; agent config is versioned in git and stamped on each journal entry, so "v3 beats v2" is measurable, not vibes | 2+ |
| 8 | IBeam container + `IBKRBroker` adapter + Flex importer; flip `BROKER=ibkr-paper`; register in status dashboard / health-api monitoring | 3 |
| 9 | Paper soak: ≥ 2 clean weeks on IBKR paper (≥ 4 total incl. sim); weekly reviews continue; any incident → fix and extend the clock | 3 |
| 10 | Go-live ceremony: review soak together → flip `BROKER=ibkr-live`, Cautious dial week 1, alerts verified, deposit lands | 4 |

---

## 13. Backlog (fun & someday)

| Added | Item |
|---|---|
| 2026-06-11 (Cam) | **Wealth-aware greetings** — *planned: Phase 2.5e* (`docs/PHASES.md`) |
| 2026-06-11 (Cam) | **Agent chat** — *planned: Phase 2.5c* (`docs/PHASES.md`). Hard rule preserved: chat gets read-only tools, can never place orders. |
| 2026-06-11 (Cam) | **Knowledge base** — camwiki-style browsable KB grown from the agent's research notes, lessons, and source digests. Note: the journal already *is* the proto-KB (searchable, typed, versioned); this item is about giving it a wiki-like browse/organize layer once there's enough content to be worth organizing. Exploratory — revisit after a few weeks of Phase 2 output. |
| 2026-06-11 (Cam) | ~~Curated research sources + per-decision source attribution~~ — **promoted into the Phase 2 spec** (`docs/AGENT-SPEC.md`: research sources + learning loop). Seed list: BNN Bloomberg, CBC, MSNBC, NYT, Toronto Star, WSJ, plus a standing macro sweep (gold, oil, CAD/USD, rates). The agent self-curates the list over time; every decision records which sources fed it, and retros grade whether those sources earned their keep. |
| 2026-06-12 (Cam) | **Light mode + dark mode** — *planned: Phase 2.5b.* Resolved the household dispute in code: theme defaults **per member** (Cam → light, Graham → dark), toggle override persists. |
| 2026-06-12 (Graham) | **Signal generation layer** — deterministic signals from raw data: moving averages, RSI, MACD, volatility, sentiment scores, ML forecasts, factor rankings → Buy / Sell / Hold + confidence. Integration stance (designed in `docs/AGENT-SPEC.md` → "Signals layer"): signals are **inputs the agent weighs, never autonomous deciders** — signals advise → agent decides → gate disposes. Signal families count as sources for attribution, so retros grade their hit-rates exactly like news sources. Phase 2.5 candidate (needs historical bars; start with MA/RSI/MACD/vol). |
| 2026-06-12 (Cam) | **Mobile** — the responsive site already works on phones; next step is a **PWA** (installable, and PWA push notifications pair perfectly with alerting) before considering a native app. |
| 2026-06-12 (Graham) | **AI components** — prediction models (XGBoost, Random Forest, LSTM, Transformers) + LLM uses (news analysis, earnings call summaries, sentiment scoring, trade explanation). Disposition: the LLM uses are mostly already core spec — news analysis/sentiment/trade-explanation are the research sweep, signals sentiment family, and thesis journal; **earnings call summaries promoted into the spec** (research section). Prediction models filed under the Signals layer, last in line: simple signals must earn their keep before ML forecasts get built (walk-forward validated on the sim first). |
| 2026-06-12 (Cam) | ~~Alerting~~ — **promoted into the Phase 2 spec** (`docs/AGENT-SPEC.md` → "Alerting"): severity-tiered events to a Discord webhook first (house standard), health-api integration for criticals, PWA push/email later. |
| 2026-06-12 (Cam) | **Stocks pages** — per-symbol one-pagers (holdings first): position, trade history, every journal entry about the stock with sources, then signals + scoreboard slice + stock-aware chat as those land. *Planned: Phase 2.5f* — also the UI home each new data tier lights up in. |
| 2026-06-12 (lesson from GSY) | **Promotion screen v2: dossier required** — the automated screen checks price/volume, not fundamentals; GSY passed it while its (still-queued) dossier later revealed a credit meltdown. Fix: the promote/approve flow should require a completed dossier and surface its Verdict beside the approve button. Small build; do before the universe pipeline gets real use. |
| 2026-06-12 (Cam & Graham) | **Tiered data sources + source scoring system** — 10-tier taxonomy (price, fundamentals, options flow, insiders, institutional, earnings, news, social, macro, alt-data) with a hit-rate scoreboard that promotes/demotes sources based on retro grades. Full doc: `docs/DATA-SOURCES.md` (includes Canadian equivalents: SEDAR+/SEDI/BoC/StatCan). Tier 1 history + Tier 9 structured macro are the near-term builds; everything enters on probation through the scoreboard. |
| 2026-06-13 (Cam) | **The Daily + financial-literacy pillar** — the Today page reborn as a newspaper (editions by time of day, Market Movers, "The Tape" intraday NAV, daily quote/joke; **Evening Edition MVP shipped**), and financial literacy stated as a product through-line (every number explainable; glossary + agent explainers). Docs: `docs/NEWSPAPER.md`, `docs/LITERACY.md`. Product-not-single-user reframe noted; multi-tenancy deferred. |

---

*Decisions locked (§10). Phases 0–1 shipped. Next: Phase 2 — the agent goes live-fire on the sim.*
