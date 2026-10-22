// P0 of docs/COMPANY-FINANCIALS.md: probe every company-financials feed against a set of awkward
// names and print a coverage matrix. Read-only, FMP only, no DB, no Claude.
//   cd web && set -a && . ../.env && set +a && npx tsx scripts/financials-probe.ts [--json out.json]
// Re-run it whenever the FMP plan changes, or before trusting a feed for a new kind of name.

const BASE = "https://financialmodelingprep.com/stable";
const KEY = process.env.FMP_API_KEY ?? "";
if (!KEY) {
  console.error("FMP_API_KEY not set (source the repo-root .env)");
  process.exit(1);
}

// Why each name is here — the awkward cases, not the easy ones.
const NAMES: Array<[string, string]> = [
  ["NVDA", "US large grower, fiscal year ends January"],
  ["C", "US bank: no gross profit line"],
  ["CB", "US insurer"],
  ["DLR", "US REIT"],
  ["QTTB", "US small biotech, pre-revenue"],
  ["SPCX", "recent IPO (~June 2026)"],
  ["TSM", "ADR, reports in TWD"],
  ["ASML", "foreign filer, reports in EUR"],
  ["RY.TO", "CA bank, reports CAD"],
  ["RY", "same company, bare = the NYSE listing"],
  ["SHOP.TO", "cross-listed, trades CAD, reports USD"],
  ["DRX.TO", "pure-TSX small cap"],
  ["DRX", "bare DRX — is it a DIFFERENT company? (the D132 NEO trap)"],
  ["AEM.TO", "CA gold miner"],
  ["CCO.TO", "CA uranium (Cameco)"],
  ["TXG.TO", "CA gold, mid cap"],
  ["BQE.V", "TSX Venture listing"],
  ["TN.CN", "CSE listing, micro cap"],
  ["XIC.TO", "an ETF: should be empty everywhere"],
];

type Probe = { status: number; rows: number; note: string };

async function get(path: string): Promise<{ status: number; data: unknown }> {
  const sep = path.includes("?") ? "&" : "?";
  try {
    const r = await fetch(`${BASE}/${path}${sep}apikey=${KEY}`, { signal: AbortSignal.timeout(20_000) });
    const text = await r.text();
    let data: unknown = text;
    try {
      data = JSON.parse(text);
    } catch {
      /* keep text */
    }
    return { status: r.status, data };
  } catch (e) {
    return { status: 0, data: String(e) };
  }
}

const arr = (d: unknown): Record<string, unknown>[] => (Array.isArray(d) ? (d as Record<string, unknown>[]) : []);
const s = (v: unknown) => (v == null ? "" : String(v));

// Each feed: the path for a symbol, and a one-line summary of what came back.
const FEEDS: Array<{ key: string; path: (sym: string) => string; sum: (rows: Record<string, unknown>[]) => string }> = [
  {
    key: "income-q",
    path: (x) => `income-statement?symbol=${x}&period=quarter&limit=12`,
    sum: (r) =>
      r.length
        ? `${s(r[0].date)} ${s(r[0].reportedCurrency)} FY${s(r[0].fiscalYear)}${s(r[0].period)} rev=${r[0].revenue != null ? "y" : "-"} gp=${r[0].grossProfit ? "y" : "0/-"} eps=${s(r[0].epsDiluted ?? r[0].epsdiluted)}`
        : "",
  },
  { key: "income-fy", path: (x) => `income-statement?symbol=${x}&period=annual&limit=5`, sum: (r) => (r.length ? `${s(r.at(-1)?.date)}→${s(r[0].date)}` : "") },
  {
    key: "cashflow-q",
    path: (x) => `cash-flow-statement?symbol=${x}&period=quarter&limit=8`,
    sum: (r) => (r.length ? `fcf=${r[0].freeCashFlow != null ? "y" : "-"} capex=${s(r[0].capitalExpenditure)}` : ""),
  },
  {
    key: "balance-q",
    path: (x) => `balance-sheet-statement?symbol=${x}&period=quarter&limit=8`,
    sum: (r) => (r.length ? `cash=${r[0].cashAndCashEquivalents != null ? "y" : "-"} debt=${r[0].totalDebt != null ? "y" : "-"}` : ""),
  },
  {
    key: "estimates-fy",
    path: (x) => `analyst-estimates?symbol=${x}&period=annual&limit=10`,
    sum: (r) => (r.length ? `${s(r.at(-1)?.date)}→${s(r[0].date)} n=${s(r[0].numAnalystsRevenue ?? r[0].numAnalystsEps)}` : ""),
  },
  { key: "estimates-q", path: (x) => `analyst-estimates?symbol=${x}&period=quarter&limit=8`, sum: (r) => (r.length ? `${s(r.at(-1)?.date)}→${s(r[0].date)}` : "") },
  { key: "scores", path: (x) => `financial-scores?symbol=${x}`, sum: (r) => (r.length ? `pio=${s(r[0].piotroskiScore)} z=${Number(r[0].altmanZScore ?? NaN).toFixed(1)}` : "") },
  { key: "seg-product", path: (x) => `revenue-product-segmentation?symbol=${x}&period=quarter`, sum: (r) => (r.length ? `${s(r[0].date)} ${Object.keys((r[0].data as object) ?? {}).length} segs` : "") },
  { key: "seg-geo", path: (x) => `revenue-geographic-segmentation?symbol=${x}&period=quarter`, sum: (r) => (r.length ? `${s(r[0].date)} ${Object.keys((r[0].data as object) ?? {}).length} regions` : "") },
  { key: "transcript-dates", path: (x) => `earning-call-transcript-dates?symbol=${x}`, sum: (r) => (r.length ? `${r.length} calls, newest FY${s(r[0].fiscalYear ?? r[0].year)}Q${s(r[0].quarter)} ${s(r[0].date)}` : "") },
  { key: "float", path: (x) => `shares-float?symbol=${x}`, sum: (r) => (r.length ? `free=${Number(r[0].freeFloat ?? NaN).toFixed(0)}%` : "") },
  { key: "filings", path: (x) => `sec-filings-search/symbol?symbol=${x}&from=2026-07-01&to=2026-10-22`, sum: (r) => (r.length ? [...new Set(r.map((f) => s(f.formType)))].slice(0, 5).join(",") : "") },
  { key: "insider-stats", path: (x) => `insider-trading/statistics?symbol=${x}`, sum: (r) => (r.length ? `${s(r[0].year)}Q${s(r[0].quarter)}` : "") },
  { key: "rating", path: (x) => `ratings-snapshot?symbol=${x}`, sum: (r) => (r.length ? s(r[0].rating) : "") },
  { key: "dcf", path: (x) => `discounted-cash-flow?symbol=${x}`, sum: (r) => (r.length ? `dcf=${Number(r[0].dcf ?? NaN).toFixed(2)}` : "") },
  { key: "profile", path: (x) => `profile?symbol=${x}`, sum: (r) => (r.length ? `${s(r[0].companyName).slice(0, 28)} | ${s(r[0].exchange)} ${s(r[0].currency)}` : "") },
];

async function main() {
  const out: Record<string, Record<string, Probe>> = {};
  for (const [sym, why] of NAMES) {
    out[sym] = {};
    const res = await Promise.all(FEEDS.map((f) => get(f.path(encodeURIComponent(sym))).then((r) => [f, r] as const)));
    console.log(`\n=== ${sym} — ${why}`);
    for (const [f, r] of res) {
      const rows = arr(r.data);
      const err = !Array.isArray(r.data) ? s(typeof r.data === "object" ? JSON.stringify(r.data) : r.data).slice(0, 60) : "";
      const note = rows.length ? f.sum(rows) : err;
      out[sym][f.key] = { status: r.status, rows: rows.length, note };
      console.log(`  ${f.key.padEnd(17)} ${String(r.status).padEnd(4)} ${String(rows.length).padStart(3)}  ${note}`);
    }
  }

  // Extras the plan asked about.
  console.log("\n=== extras");
  const est = await get(`analyst-estimates?symbol=NVDA&period=annual&limit=30`);
  const er = arr(est.data);
  console.log(`  analyst-estimates NVDA annual: ${er.length} rows, ${s(er.at(-1)?.date)} → ${s(er[0]?.date)}; fields: ${Object.keys(er[0] ?? {}).join(",")}`);
  const tr = await get(`earning-call-transcript?symbol=RY&year=2026&quarter=3`);
  const tt = arr(tr.data);
  console.log(`  transcript RY FY2026Q3: ${tr.status} rows=${tt.length} len=${s(tt[0]?.content).length} date=${s(tt[0]?.date)}`);
  const tn = await get(`earning-call-transcript?symbol=NVDA&year=2027&quarter=2`);
  const tnn = arr(tn.data);
  console.log(`  transcript NVDA FY2027Q2: ${tn.status} rows=${tnn.length} len=${s(tnn[0]?.content).length} date=${s(tnn[0]?.date)}`);
  const splits = await get(`splits?symbol=NVDA`);
  console.log(`  splits NVDA: ${splits.status} ${arr(splits.data).slice(0, 2).map((x) => `${s(x.date)} ${s(x.numerator)}:${s(x.denominator)}`).join(" · ")}`);

  const jsonAt = process.argv.indexOf("--json");
  if (jsonAt > 0 && process.argv[jsonAt + 1]) {
    const fs = await import("node:fs");
    fs.writeFileSync(process.argv[jsonAt + 1], JSON.stringify(out, null, 2));
  }
}

main();
