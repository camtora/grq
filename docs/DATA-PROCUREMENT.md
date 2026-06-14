# Data API Procurement Plan

*Written 2026-06-14. Verified against current pricing pages; recheck costs before subscribing.*

GRQ currently uses Yahoo Finance's unofficial crumb-free chart endpoint (`web/lib/broker/yahoo.ts`)
for delayed price quotes and daily OHLCV bars — no fundamentals, no analyst targets, no insider
data. This document identifies the best paid API to add those layers, with a hard filter on
TSX / Canadian-listing coverage.

---

## 1. Candidate comparison

The table below covers every realistic option evaluated. "TSX coverage" = confirmed `TO`
exchange support with equity tickers in the format `SYMBOL.TO`. "Analyst targets" = machine-
readable per-stock consensus price target + buy/hold/sell ratings. "Fundamentals depth" = income
statement, balance sheet, cash-flow, key ratios (FCF, margins, debt). Prices are USD/month on
monthly billing; annual billing typically saves ~17%.

| Provider | TSX coverage | Analyst targets | Fundamentals depth | Insider / institutional | Entry paid price | Notes |
|---|---|---|---|---|---|---|
| **Financial Modeling Prep (FMP)** | Yes — confirmed TSX endpoints, `SYMBOL:TSX` format; Canada unlocked on Professional plan | Yes — price-target summary, consensus, by-analyst, history; all paid tiers | Deep: income/balance/cash-flow/ratios/DCF, 30-yr history on Professional+ | Yes — insider transactions + 13F institutional on Professional+ | ~$69/mo (Professional) | **Recommended primary.** One API covers all four pillars; TSX explicitly listed in Professional plan feature set |
| **EODHD (EOD Historical Data)** | Yes — `SYMBOL.TO` format, 3 054 active TO tickers confirmed, SEDAR-sourced fundamentals | Partial — `TargetPrice` + analyst rating counts embedded in fundamentals JSON; not a standalone endpoint | Good: SEDAR-extracted statements, ratios; insider transactions via fundamentals blob | Insider via fundamentals blob (US Form 4 confirmed; Canadian SEDI coverage unverified); no dedicated institutional endpoint | $59/mo (Fundamentals Data Feed) or $99/mo (All-In-One) | Strong fallback. Fundamentals need the $59 tier minimum; analyst targets are embedded in fundamentals, not a first-class endpoint; real-time costs extra |
| **Finnhub** | Partial — 60+ global exchanges including TSX listed; international data requires paid plan ($11.99–$99.99/mo range); analyst target endpoint confirmed (`/stock/price-target`) | Yes — per-symbol price-target consensus endpoint | Good for US; international fundamentals thinner; estimates/EPS available | Insider sentiment (US-centric); no confirmed Canadian insider feed | $11.99–$99.99/mo (tiered by feature set) | Pricing is per-feature-category (market data, fundamentals, estimates sold separately); full Canadian stack easily reaches $60–80+/mo. Rate limit 300 RPM on paid. |
| **Alpha Vantage** | Partial — "20+ global exchanges," Canada not explicitly listed; unclear TSX fundamentals depth | No dedicated analyst-target endpoint confirmed | US fundamentals strong; non-US depth unverified | No | $49.99–$249.99/mo (by RPM) | Entry cost high for features needed; no confirmed Canadian analyst data; eliminated |
| **Polygon.io** | No — self-described as "almost exclusively US-centric"; fundamentals US-only | No | US-only | No | $29–$199/mo | Hard no for a TSX fund |
| **Tiingo** | No — covers "65 000+ US stocks, ETFs, ADRs"; Canadian stocks not listed | No | US fundamentals only | No | Free–custom | Hard no |
| **Marketstack** | Partial — 72+ exchanges, "50+ countries" claimed; no confirmed TSX fundamentals | Analyst targets only on Business+ tier; unclear Canadian coverage | Shallow price data focus; fundamentals thin | No | $9.99–$149.99/mo | Price data only; no fundamentals depth; eliminated |
| **TSXInsider** | TSX / TSXV / CSE / NEO only — SEDI-sourced | n/a (insider-only service) | None | Deep — open-market buys, conviction tiering, cluster detection | $199/yr (~$17/mo) for web; institutional API = custom | Specialist insider layer; not a primary API; worth revisiting after analyst+fundamentals are wired |

---

## 2. Recommendation

### Primary: Financial Modeling Prep (FMP) — Professional plan, ~$69 USD/month

**Why FMP wins:**

1. **TSX coverage is explicit and documented.** FMP has dedicated `/historical-price-full/TSX/`
   and price-target endpoints that accept TSX tickers. The Professional plan specifically lists
   "U.S., U.K., and Canada Market Coverage." EODHD also covers TSX but buries analyst targets
   inside the fundamentals blob rather than exposing a dedicated endpoint — harder to wire and
   less reliable to parse.

2. **Analyst price targets are a first-class API.** FMP's
   `/price-target-consensus`, `/price-target-summary`, and `/price-target` endpoints return
   structured JSON with target high/low/median/consensus + number of analysts + history. This
   directly answers GRQ's priority-1 question: "does the Street agree with our agent?"

3. **Full fundamentals stack in one plan.** Income statements, balance sheets, cash-flow, key
   metrics (FCF, EBITDA, margins), financial ratios, and 30-year history are all included on
   the Professional tier. No need to upgrade for fundamentals.

4. **Insider + institutional on the same key.** Insider transactions and 13F institutional
   holdings are included on Professional, enabling eventual Tier-4/5 wiring without a second
   subscription.

5. **Rate limit is workable.** 750 RPM is generous for a single-fund agent that runs a morning
   sweep over ~20–30 positions, not a high-frequency pipeline.

6. **One API key, one bill, one integration surface.** This matters for a two-person project.

**Estimated monthly cost:** ~$69 USD/month (~$94 CAD at current rates). Annual billing brings
it to ~$57–59 USD/month effective (~$78 CAD).

### Fallback: EODHD All-In-One — $99 USD/month

If FMP's TSX analyst-target coverage turns out to be thinner than documented (i.e., only major
cross-listed names have target data), EODHD is the next best option:

- Confirmed `TO` exchange with 3 054 tickers; SEDAR-extracted fundamentals (the right source
  for Canadian filings).
- Analyst targets exist as embedded fields (`TargetPrice`, `StrongBuy`/`Buy`/`Hold`/`Sell`/
  `StrongSell` counts) inside the fundamentals response — workable but requires parsing.
- All-In-One ($99/mo) bundles historical data, intraday, fundamentals, news, and insider
  transactions into one plan and one key.
- The Fundamentals Data Feed at $59/mo is a lower-cost entry if only fundamentals + analyst
  ratings are needed (intraday and real-time excluded).

**Why it's not primary:** analyst targets are embedded rather than first-class; insider data
for Canadian names via Form-4 is US-only (Canadian SEDI coverage unverified); and at $99/mo
the All-In-One is 44% more expensive than FMP Professional for the same pillars.

---

## 3. Sign-up steps

### FMP Professional plan

1. Go to **https://site.financialmodelingprep.com/pricing-plans**
2. Select the **Professional** tier (confirm it lists "Canada Market Coverage" on the plan
   card — if tier names have shifted, it is the one between Starter and Enterprise that
   explicitly mentions UK + Canada).
3. Create an account with an email address; billing is via credit card (Stripe).
4. Choose **monthly** to start (confirm data quality over 30 days before switching to annual).
   Monthly: ~$69 USD. Annual: ~$57–59 USD/month effective.
5. After payment, your API key is shown on the dashboard under **API Keys**. Copy it
   immediately — this is the value for the `.env` variable below.
6. Verify TSX access within the first 48 hours: `curl
   "https://financialmodelingprep.com/stable/price-target-consensus?symbol=SHOP:TSX&apikey=YOUR_KEY"`
   should return a non-empty JSON array. If TSX analyst data is thin for your target names,
   open a support ticket or pivot to EODHD before the first billing cycle ends.

### EODHD fallback (if needed)

1. Go to **https://eodhd.com/pricing**
2. Select **Fundamentals Data Feed** ($59/mo) for fundamentals + analyst ratings only, or
   **All-In-One** ($99/mo) if you want intraday + news bundled.
3. Register, verify email, add payment. API key is shown in the dashboard.
4. Verify: `curl "https://eodhd.com/api/v1.1/fundamentals/SHOP.TO?api_token=YOUR_KEY&fmt=json"`
   should return a JSON object with `Highlights.MarketCapitalizationMln` and
   `AnalystRatings.TargetPrice` populated.

---

## 4. Integration notes

### Environment variable

Add to the root `.env` (chmod 600, never committed):

```
FMP_API_KEY='your-key-here'
```

Single-quote the value: if the key contains a `$` character this prevents shell expansion
when scripts source `.env`. For EODHD the variable name is `EODHD_API_KEY`.

### Where it lives in the codebase

Create **`web/lib/fundamentals.ts`** — the new lib file that wraps all FMP calls. It sits
beside `web/lib/broker/` (price layer) at the same level, and is the single place in the
codebase that imports `FMP_API_KEY`. Pattern mirrors `web/lib/broker/yahoo.ts`: thin fetch
wrappers, defensive parsing, caching results in the DB to avoid burning rate-limit budget on
repeated reads.

Key functions to expose from `fundamentals.ts`:

```typescript
// Priority 1 — Phase A
getAnalystTargets(symbol: string): Promise<AnalystTargetSummary | null>
// Returns: consensusTarget (cents), targetHigh/Low/Median, analystCount, ratings breakdown

// Priority 2 — Phase B
getFundamentals(symbol: string): Promise<CompanyFundamentals | null>
// Returns: revenue/earnings growth YoY, FCF, margins, debt/equity, P/E forward, sector/industry

// Priority 3 — Phase C
getInsiderTransactions(symbol: string): Promise<InsiderTransaction[]>
getInstitutionalHolders(symbol: string): Promise<InstitutionalHolder[]>
```

All money values returned as **integer cents** (multiply float prices × 100 and round) to
comply with GRQ's no-floats rule (CLAUDE.md rule 4).

The source taxonomy in `docs/DATA-SOURCES.md` assigns tier labels:
- Analyst targets → `tier6:analyst` (earnings intelligence)
- Fundamentals → `tier2:fundamentals`
- Insider → `tier4:insider`
- Institutional → `tier5:institutional`

These tier labels slot into the `sources[]` array on agent theses so the scoreboard can grade
FMP data independently of other sources.

### Rate-limit budget

FMP Professional gives 750 RPM. The morning sweep runs ~30 tickers. A full fundamentals fetch
per ticker at once = 30 requests; price-target fetch = another 30. Both complete in under 5
seconds at 4× concurrency. No batching heroics needed at GRQ's scale.

Cache fundamentals in the DB (a `FundamentalsCache` table keyed on symbol + date) so the
agent doesn't re-fetch the same income-statement data mid-session — fundamentals change
quarterly, not hourly. Analyst targets update more frequently; a 4-hour TTL cache is reasonable.

---

## 5. Phased integration plan

### Phase A — Analyst targets (wire first, highest value-per-effort)

**Goal:** Agent can ask "what is the Street's consensus price target for this stock, and what
is our thesis target?" and answer it in the morning research session.

Steps:
1. Add `FMP_API_KEY` to `.env` and `docker-compose.yaml` env pass-through.
2. Create `web/lib/fundamentals.ts` with `getAnalystTargets()`.
3. Add a `FundamentalsCache` table in `web/prisma/schema.prisma` (or reuse an existing
   `json` blob table if one exists) for caching responses keyed on `(symbol, dataType, date)`.
4. Expose a new agent tool `get_analyst_targets` in `web/agent/tools.ts` that calls
   `getAnalystTargets()`.
5. Update `web/agent/context.ts` to include analyst target data in the morning context build
   for each holding and watchlist name.
6. Add a "Analyst Consensus" row to the stock one-pager UI (already exists as a card in the
   stocks page).

**Validation:** agent morning session cites `tier6:analyst/FMP` as a source for at least one
holding; the stock one-pager shows a consensus target and analyst count.

### Phase B — Fundamentals / peer comparison

**Goal:** Agent can compare revenue growth, margins, and FCF across the portfolio and screen
for growth stocks.

Steps:
1. Add `getFundamentals()` to `web/lib/fundamentals.ts`.
2. Wire a `get_fundamentals` tool in `web/agent/tools.ts`.
3. Add a "Fundamentals" section to the stock one-pager (revenue TTM, gross margin, FCF yield,
   net debt/EBITDA, forward P/E vs. sector median).
4. Agent weekly review uses fundamentals to justify hold/exit decisions with quantitative
   backing (`tier2:fundamentals/FMP` source tag).

**Validation:** a retro session includes at least one `tier2:fundamentals/FMP` source grade.

### Phase C — Insider & institutional (later, once scoreboard has Phase A/B data)

**Goal:** Add cluster-buy detection as a confirming signal.

Steps:
1. Add `getInsiderTransactions()` and `getInstitutionalHolders()` to `web/lib/fundamentals.ts`.
2. Wire as tools available to the agent in the morning sweep.
3. For Canadian names where FMP insider data is thin (TSX-only companies don't file Form 4),
   evaluate **TSXInsider** ($199/yr institutional plan) as a SEDI-native supplement. This is
   a second API key (`TSXINSIDER_API_KEY`) and a separate thin wrapper.
4. Insider cluster buys get `tier4:insider` tags; the scoreboard grades them over time before
   promoting them into the morning routine.

**Validation:** at least one thesis session mentions an insider cluster-buy as a confirming
or disconfirming factor.

---

## 6. Supplementary free sources (no API key needed)

These complement the paid API and are already partially in use or are free-forever:

| Source | What | How |
|---|---|---|
| Yahoo Finance (current) | Delayed quotes, daily OHLCV | `web/lib/broker/yahoo.ts` — keep as-is |
| FRED API | US macro (rates, CPI, GDP) | Free, no auth; call from agent macro sweep |
| Bank of Canada Valet API | BoC rates, CAD/USD, Canadian CPI | Free REST JSON at `https://www.bankofcanada.ca/valet/` |
| Statistics Canada Web Data Service | Canadian GDP, jobs, inflation | Free REST at `https://www150.statcan.gc.ca/t1/tbl1/en/` |
| SEDAR+ | Canadian company filings (PDF) | Web-accessible; agent can link to filings, not parse programmatically |
| SEDI (sedi.ca) | Canadian insider filings | Web-only; TSXInsider (Phase C) aggregates it via API |

---

*For questions about this plan: check `docs/DECISIONS.md` for the decision record when FMP
is formally chosen, and update `docs/DATA-SOURCES.md` tier statuses once Phase A is wired.*
