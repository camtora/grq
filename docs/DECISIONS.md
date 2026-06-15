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
