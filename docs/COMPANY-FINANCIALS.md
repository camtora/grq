# Company financials — implementation plan

**Status:** APPROVED (Cam, 2026-10-22). Backend (ingest, storage, jobs, agent rebuilds that carry them) may ship **at
any point**, Run 3 included; the display goes through the design loop (§5). Decision record: **D140**.

**One line:** wire every company-level feed our FMP plan already pays for (financial statements, forward
estimates, health scores, segments, earnings-call transcripts, float, filings, insider statistics), store it,
derive the trends, and show it on the stock page. **Whether and how any of it becomes an agent signal is a
separate, later decision.** Nothing in this plan changes what Alfred sees, how he decides, or the §6 gate.

---

## 1. Why

Today GRQ's company-level picture is thin and mostly unstructured:

| What we have | Where | Gap |
|---|---|---|
| Last quarter's EPS + revenue vs estimate | `fmpEarningsReport` → stock page | One quarter only, no trend |
| Next report date + EPS estimate | `fmpEarnings` → agent context | No forward revenue, no revisions |
| P/E, P/B vs 4 peers | `fmpPeerComparison` | Valuation only, no growth or quality |
| Sector / industry / cap | `lib/fundamentals.ts` (profile) | Descriptive only |
| "Recent revenue/earnings growth" in every dossier | Alfred **web-searches** it (`agent/sessions.ts:610`) | Unstructured, inconsistent, unscored, not stored, costs tokens |

The signal families (`agent/signals.ts`) are all price-derived (trend, RSI, MACD, volatility). There is no
fundamental family at all.

## 2. Scope: the feeds

Every endpoint below was probed on 2026-10-22 against our key and returned **200 with real data**. NVDA, plus
SHOP.TO / RY where noted. Phase 0 widens that check.

| # | Feed (FMP `stable/…`) | What it gives | Probed |
|---|---|---|---|
| F1 | `income-statement` (quarter + annual) | Revenue, gross/operating/net income, EPS, share count | NVDA, SHOP.TO (reports USD), RY (reports CAD) ✓ |
| F2 | `cash-flow-statement` | Operating cash flow, capex, free cash flow, buybacks, dividends | NVDA ✓ |
| F3 | `balance-sheet-statement` | Cash, debt, equity, total assets | **not yet probed** (Phase 0) |
| F4 | `income-statement-growth`, `key-metrics` | FMP's precomputed growth + per-share metrics | NVDA ✓; used as a **cross-check**, we compute our own (§4.3) |
| F5 | `analyst-estimates` (annual + quarter) | Forward revenue/EPS: avg/low/high, analyst count, years out | NVDA ✓ |
| F6 | `financial-scores` | Piotroski F-score, Altman Z-score, working capital etc. | NVDA, SHOP.TO ✓ |
| F7 | `revenue-product-segmentation` (+ geographic) | Revenue by business line (and by region) | product ✓; **geographic not probed** |
| F8 | `earning-call-transcript` | Full call text per fiscal quarter | NVDA ✓; **labelled by FISCAL year** ("2026 Q2" = the Aug 2025 call) |
| F9 | `shares-float` | Free float %, float shares, shares outstanding | NVDA ✓ |
| F10 | `sec-filings-search/symbol` | 8-K / 10-Q / 10-K / S-1 etc. as filed, with links | NVDA ✓ (US only by nature) |
| F11 | `insider-trading/statistics` | Per-quarter insider buy/sell counts + ratios | NVDA ✓ |
| F12 | `ratings-snapshot`, `discounted-cash-flow` | FMP's own letter grade + DCF fair value | NVDA ✓; **display-only "outside opinion"**: a black box, never a signal candidate |

**Outside FMP (phase 6, lower priority):**

| # | Source | Why | Status |
|---|---|---|---|
| X1 | SEC EDGAR `companyfacts` (free, no key) | The raw XBRL behind FMP's US statements: an independent **cross-check** | ✓ 200, 4 MB for NVDA |
| X2 | FINRA short interest (free) | Crowding / squeeze context, US names | ✗ 403 on the URL tried; needs a research spike |

**Explicitly out of scope** (could be a later Tier 9/10 plan): CFTC Commitments of Traders, EIA inventories,
Statistics Canada (macro/sector, not company-level), FMP ESG disclosures (no current use), SEDAR+ / SEDI (still
walled: pure-TSX filings and insider data stay agent web-research, as in D21).

## 3. Ground rules (apply to every phase)

1. **Display and storage only. No agent change in this plan.** No new lines in `buildContext`, the dossier
   prompt, the scoreboard or the signal families. That's the §9 decision, made separately. The ingest jobs
   live in the runner (like options/social) so they need an agent rebuild, but they change nothing Alfred
   reads. Rebuilds follow the usual rules: bump `AGENT_VERSION`, pre-write the startup-scan skip marker, stay
   10+ minutes clear of a check-in. **Cam, 2026-10-22: the backend may ship at any point, Run 3 included**: the
   jobs change nothing Alfred reads. Host-side backfill scripts let display work start **before** any agent rebuild.
2. **Money is integer.** Statement amounts are stored as `BigInt` minor units (cents) in the **reporting
   currency**. NVDA's $96.2B quarter = 9.6e12 cents, which overflows `Int`. EPS is stored as an `Int` in
   1/10,000ths of a unit (4 dp: small-cap EPS lives at $0.0x). Percentages and margins are `Int` basis points.
   Non-money scores (Piotroski, Altman Z) may be `Float`, as `OptionsDaily` already does.
3. **Reporting currency ≠ listing currency.** SHOP.TO *trades* in CAD but *reports* in USD. Every stored
   statement carries `reportedCurrency` from the feed; the display labels it; **nothing converts implicitly**
   (D113: currency comes from the feed, never a suffix). Growth rates and margins are currency-invariant, so the
   headline numbers are safe either way.
4. **Fiscal, not calendar.** Periods are keyed by `(fiscalYear, fiscalPeriod)` plus the period-end date.
   Year-over-year compares the same fiscal quarter a year earlier, never "the calendar quarter". NVDA's year ends
   in January; FMP labels transcripts by fiscal year.
5. **Symbols go through `lib/universe.ts`** (`canonicalMember`, `memberForListing`, `classDash`; D132). No
   hand-rolled suffix strips. Phase 0 pins which FMP key each cross-listed name answers to (RY bare → CAD
   statements; SHOP.TO → USD statements) in `test/symbol-resolution.test.ts`.
6. **Honest gaps.** A refused or empty feed renders "No info" in a visible panel (the D134 convention), and
   `fmpPlanRefused()` tells a plan refusal apart from "no data". If the plan ever lapses to Starter, `.TO`
   symbols go dark here too, and the panel has to say so rather than look broken.
7. **Restatements win.** Upsert by `(symbol, period, periodEnd)` and keep the latest numbers; record
   `fetchedAt`. (Optional: keep `raw` JSON so a restatement is visible in history.)
8. **Who sees it.** These are research numbers, not the book, so members, viewers **and users** see them (add the
   routes to `lib/access.ts`; `test/access-tiers.test.ts` + `test/route-guards.test.ts` must pass). **The
   AI-written earnings-call summary (F8) is visible to users too (Cam, 2026-10-22):** it's written from the
   transcript only, never with the book in context, so it isn't one of Alfred's write-ups that D122 withholds.
   That only holds while the summary prompt never sees the book; keep it that way.
9. **No quota side doors.** A stock-page view by a non-member may fetch FMP data (cheap, no Claude), but must
   **never** trigger a Claude call. The transcript summary only runs from the scheduled job, for tracked names.
10. **Literacy pillar.** Every new figure ships with its glossary term (free cash flow, margin, Piotroski,
    Altman Z, estimate revision, float, dilution, segment, 8-K, …) or it's a bug. `test/learn-content.test.ts`
    catches dead term refs.
11. **Dollars first for Graham.** Lead with the dollar figure, then the %: "Revenue $96.2B, up $X.XB (+NN%) on
    a year ago", not "+NN% YoY".

## 4. Architecture

### 4.1 Code layout

```
web/lib/financials/
  fmp.ts        fetchers for F1–F12 (typed, via fmpGet; no parsing logic)
  store.ts      cache-through: refresh*(), get*() — the OptionsDaily/SocialDaily pattern
  derive.ts     PURE: growth, margins, TTM, acceleration, revisions, dilution — no I/O
  targets.ts    which names get which feed, at what cadence (§4.4)
  summary.ts    F8 transcript → structured summary (Haiku), job-only
web/test/financials-derive.test.ts   pins every formula + the edge cases in §4.3
web/scripts/financials-backfill.ts   host-side one-shot: 8 quarters + 3 years for every tracked name
web/scripts/financials-probe.ts      Phase 0: the coverage matrix (§6, P0)
web/app/api/financials/[symbol]/route.ts   lazy panel data (identity-resolved, read-only)
```

### 4.2 Schema (draft: Phase 0 may adjust field lists)

```prisma
model FinancialPeriod {          // F1+F2+F3, one row per company per fiscal period
  id               Int      @id @default(autoincrement())
  symbol           String   // stored symbol (canonical member)
  period           String   // "Q1".."Q4" | "FY"
  fiscalYear       Int
  periodEnd        String   // YYYY-MM-DD
  filedAt          String?
  reportedCurrency String
  revenue          BigInt?  // minor units (cents) of reportedCurrency — null when the line doesn't exist (banks: no gross profit)
  grossProfit      BigInt?
  operatingIncome  BigInt?
  netIncome        BigInt?
  epsDiluted4      Int?     // EPS × 10,000
  sharesDiluted    BigInt?
  operatingCashFlow BigInt?
  capex            BigInt?
  freeCashFlow     BigInt?
  cash             BigInt?
  totalDebt        BigInt?
  raw              Json?    // the feed rows as fetched — lets the display iterate without a refetch
  fetchedAt        DateTime @default(now())
  @@unique([symbol, period, periodEnd])
  @@index([symbol, periodEnd])
}

model EstimateSnapshot {         // F5 — one row per name per fiscal target per ET day. THE HISTORY IS THE SIGNAL.
  id          Int    @id @default(autoincrement())
  symbol      String
  asOf        String // ET YYYY-MM-DD we took it
  period      String // "FY" | "Q"
  targetEnd   String // the fiscal period being estimated
  revenueAvg  BigInt?  revenueLow BigInt?  revenueHigh BigInt?
  epsAvg4     Int?     epsLow4    Int?     epsHigh4    Int?
  analysts    Int?
  currency    String
  @@unique([symbol, asOf, period, targetEnd])
}

model CompanyHealth {            // F6 + F9 + F12, one row per name per refresh
  symbol, date, piotroski Int?, altmanZ Float?, freeFloatBps Int?, floatShares BigInt?,
  sharesOutstanding BigInt?, fmpRating String?, fmpDcfCents Int?, fetchedAt
  @@unique([symbol, date])
}

model RevenueSegment {           // F7
  symbol, fiscalYear, period, periodEnd, kind ("product"|"geographic"), currency, data Json /* {name: cents} */
  @@unique([symbol, kind, period, periodEnd])
}

model EarningsCall {             // F8 — SUMMARY stored; raw transcript fetched on demand (disk, §4.5)
  symbol, fiscalYear, fiscalQuarter, callDate, summary Json, model, inputTokens Int, outputTokens Int, createdAt
  @@unique([symbol, fiscalYear, fiscalQuarter])
}

model CompanyFiling {            // F10 — US only
  symbol, form, filedAt, acceptedAt, url, title?
  @@unique([symbol, url])
}

model InsiderQuarter {           // F11
  symbol, year, quarter, buys Int, sells Int, sharesBought BigInt?, sharesSold BigInt?, fetchedAt
  @@unique([symbol, year, quarter])
}
```

Schema push is host-side (`npx prisma db push`), additive only: no column drops (a drop breaks the live client
until redeploy).

### 4.3 Derived metrics (`derive.ts`, pure, fully tested)

| Metric | Definition | Edge cases the tests pin |
|---|---|---|
| Revenue / EPS growth YoY | vs same fiscal quarter prior year | **Negative or zero base → "n/m", never a % (a −$1 → +$1 swing is not "+200%")**; missing prior quarter → null |
| Growth QoQ | vs previous fiscal quarter | Seasonal businesses: show, but label as sequential |
| TTM | sum of last 4 quarters | <4 quarters → null, never annualise |
| **Acceleration** | YoY growth this quarter − YoY growth 2 quarters ago (bps) | Needs 6+ quarters |
| Margins | gross / operating / net / FCF ÷ revenue, bps, + change vs a year ago | Banks/insurers have no gross profit → null, not 0 |
| Free cash flow | OCF − capex (prefer feed's FCF when present; cross-check) | Sign convention of capex varies by feed: pinned |
| Dilution | diluted shares YoY % | Splits: detect a ×N jump and flag rather than report "+900% dilution" |
| Net debt | debt − cash | |
| **Estimate revision** | % change in consensus next-FY EPS / revenue over 30 / 90 days, from **our** snapshots | <30 days of history → "building history (N days)" |
| Surprise streak | beats/misses over last 8 quarters (from the existing earnings endpoint) | |
| FMP cross-check | our growth vs `income-statement-growth` | Divergence > 1 pp → log, don't display |

### 4.4 Which names, how often

Tracked set = ACTIVE (60) + CANDIDATE (202) + held + watched + focus (≈ 270 today).

| Feed | Names | Cadence | Calls/day (approx.) |
|---|---|---|---|
| F1–F3 statements | tracked | **Event-driven:** day +1 and day +3 after each report date (from `fmpEarningsCalendar`; FMP lags filings), + a weekly backstop for anything >100 days stale | ~10–40 in season, ~0 otherwise |
| F5 estimates | tracked | **Daily snapshot** (pre-open) | ~270–540 |
| F6/F9/F12 health, float, rating | tracked | Weekly + after earnings | ~40 |
| F7 segments | ACTIVE + held + watched | After annual/quarterly report | low |
| F8 transcript summary | ACTIVE + held + watched | Once per new call (Haiku, job-only) | ~60 calls / quarter |
| F10 filings | ACTIVE + held + watched (US) | Daily | ~100 |
| F11 insider stats | tracked (US + cross-listed) | Weekly | ~40 |
| Untracked name (stock page view) | that one name | On demand, cached 24h, **FMP only, never Claude** | — |

FMP is well inside the higher plan's rate limit at these volumes. **Start the F5 snapshot job as early as
possible.** Revision history only accrues from the first snapshot, so every week of delay is a week of signal
we can never get back (unless Phase 0 finds FMP serves historical estimates).

### 4.5 Disk and cost

- `/var` is tight (CLAUDE.md). Raw transcripts are ~50–80 KB each; 270 names × 8 quarters ≈ 130 MB. **Store the
  summary, not the transcript**; fetch the raw text on demand when someone opens it.
- Statements + estimates are small: ~270 × 12 periods + 270 snapshot rows/day ≈ 100k rows/year.
- Claude cost is confined to F8: about one Haiku pass per call, ~60/quarter. Which token path (Max vs metered)
  follows whatever news triage uses today, to be confirmed in Phase 5. Every pass is logged to `AgentUsage`.
- FMP cost: $0 extra (already on the plan). If the plan drops to Starter, F1–F12 for `.TO` go dark and the
  panels say so.

## 5. Display (a design loop, not a spec)

The display is deliberately **not decided here**: Cam wants to go back and forth. The process:

1. Each phase ships a **plain, functional first-cut panel** behind a members-only flag, so real data on real
   names is the starting point for the conversation, not a mockup with invented numbers.
2. For each section, I build **2–3 variants**, shoot them with `webshot` on 4 reference names (below), in
   **dark and light** and at **phone width**, and post them side by side. Cam (and Graham) pick and redline.
3. The winner gets folded in per `docs/DESIGN.md` (PanelHeader, tokens, freshness badges, §1.7 link rules).
4. Mobile parity (GRQ Go, D60) follows once the web shape settles: additive fields on `shared/contract.ts`
   only (never drop a field old builds read).

**Reference names for every review:** NVDA (big US grower, odd fiscal year) · RY (CA bank, reports CAD, no gross
profit) · SHOP (cross-listed, reports USD) · a pre-revenue TSX miner from the universe (the "n/m"/no-data case).

**Starting proposals for the conversation** (not decisions):

| Section | First-cut idea | Questions for the loop |
|---|---|---|
| **Financials headline strip** | 4 tiles: Revenue (TTM $ + YoY), EPS, operating margin, free cash flow. $ first | Which 4? Tiles vs one sentence ("Sales $96B a year, up $X B")? |
| **Quarterly trend** | 8-quarter bars for revenue + a line for margin; toggle Revenue / EPS / FCF | Bars vs sparkline? Quarterly vs TTM? Show the estimate as the 9th ghost bar? |
| **What analysts expect** | Next FY revenue/EPS range (low–avg–high) + the revision arrow (30/90d) | Merge into the existing Analyst ratings panel or stand alone? |
| **Financial health** | Piotroski 0–9 + Altman Z with a plain-English verdict ("solid", "watch", "distress zone") + net debt | Show the raw scores at all, or only the verdict with a tap-through? |
| **Where the money comes from** | Segment stacked bar over time (product; region if F7 geographic exists) | Worth the space for single-segment companies? Hide when 1 segment |
| **Last earnings call** | Haiku summary: guidance change, tone, 3 quotes, what management dodged + link to full text | Placement near the existing Earnings panel? User-tier visibility (§3.8) |
| **Ownership additions** | Float %, dilution, insider buy/sell ratio by quarter: into the existing 13F / Smart Money area | Extend `StockSmartMoney` or a new panel? |
| **Filings** | Last 5 filings with form type explained ("8-K = something material happened") | Fold into News as a filing-type item instead? |
| **FMP's opinion** | Rating + DCF value vs price, labelled as FMP's model | Show at all? It invites comparison with Alfred's call |
| **Data coverage map** | Add the new tiers (green/grey per name) | — |

Probable home: a **"The business"** band between the analyst row (`page.tsx:784`) and Valuation vs peers
(`page.tsx:1173`), so valuation sits next to the numbers that justify it. To be confirmed in the loop.

## 6. Phases

Sizes: S ≈ a session, M ≈ 2–3 sessions, L ≈ a week of sessions. Each phase ends with tests green, `tsc` clean,
a web deploy, and a `webshot` of the 4 reference names.

| Phase | What | Size | Agent rebuild? |
|---|---|---|---|
| **P0 — Probe** | `financials-probe.ts`: every feed × ~15 names (US large/small, cross-listed, pure-TSX large/small, bank, REIT, insurer, pre-revenue miner, recent IPO, a name with a split). Output: a coverage matrix appended here + the symbol-key rule pinned in tests. Also confirm: `balance-sheet-statement`, geographic segments, **historical estimates?**, transcripts for CA names, FINRA URL | S | no |
| **P1 — Statements + growth** | Schema (F1–F3), `derive.ts` + tests, backfill script, `/api/financials/[symbol]`, first-cut headline strip + quarterly trend panel. Display loop round 1 | M | no (host backfill) |
| **P2 — Estimates + the snapshot clock** | `EstimateSnapshot`, the daily job, revision math + tests, first-cut "What analysts expect" | M | **yes**: the daily job lives in the runner. Ride the first agent rebuild Cam already plans after Run 3 starts, or ask |
| **P3 — Health, float, insider stats, FMP opinion** | F6, F9, F11, F12 + the weekly job; first-cut panels | S–M | rides P2's rebuild if possible |
| **P4 — Segments + filings** | F7, F10; first-cut panels | M | same |
| **P5 — Earnings-call summaries** | F8 job (Haiku), summary schema (guidance Δ, tone, quotes, evasions), on-demand raw fetch, `AgentUsage` logging; first-cut panel | M | yes |
| **P6 — Cross-checks** | EDGAR companyfacts vs FMP for US names (divergence log); FINRA short-interest spike → build or drop | S–M | no (host job) or rides a rebuild |
| **P7 — Display convergence + mobile** | Close out the design loop; GRQ Go panels; coverage map; glossary complete | M–L | no |

The order is by value per effort, except **P2's snapshot job, which should start as early as possible** (§4.4).
If Cam is willing, the snapshot job could ship ahead of P1's display work as a one-line runner addition.

## 7. Later: the signal decision (not in this plan)

Recorded here so the data is shaped for it; **decided separately, after the display settles and Run 3 has a
baseline.** Candidates, in rough order of evidence behind them:

1. **Hand the dossier the numbers** instead of making Alfred web-search them: the least risky change (same
   information, structured, fewer tokens). Probably first.
2. **Estimate revisions** (F5): the best-documented fundamental signal; needs ≥90 days of our own snapshots.
3. **Growth + acceleration** (F1): a "fundamentals" signal family beside trend/RSI/MACD/volatility.
4. **Quality / distress** (F6): more a risk flag than a direction.
5. **Transcript tone / guidance change** (F8).

Every one enters the scoreboard **on probation** (like social, D89), is graded by retros before it carries
weight, and is **an input Alfred weighs, never the gate** (§6 untouched). Any agent change also has to fit the
prompt-audit staging (D129–D137) and must not land mid-watch.

## 8. Open questions

| # | Question | Owner | Recommendation |
|---|---|---|---|
| Q1 | Users see the earnings-call summary? (§3.8) | Cam | **DECIDED 2026-10-22: yes** |
| Q2 | May the backend (incl. the P2 snapshot job) ship ahead of the display, during Run 3? | Cam | **DECIDED 2026-10-22: yes, any point** |
| Q3 | Show FMP's own rating/DCF at all? | Cam + Graham | Show, clearly labelled as FMP's model, below Alfred's call |
| Q4 | Transcript summaries on Max token or metered? | Cam | Follow news triage; confirm in P5 |
| Q5 | Store raw transcripts? | Cam | No: summary only, fetch on demand (disk) |
