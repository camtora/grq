// The 10-tier data-coverage map for one stock page (docs/DATA-SOURCES.md) — what feeds THIS page, what's
// partial, and, honestly, why the rest is dark. ONE builder for the web stock page and the app's dossier
// (lib/feed.ts): until 2026-10-23 each kept its own copy, and they drifted (the app still called options
// and social "later" months after both went live). Pure, so test/coverage.test.ts pins the wording.
//
// A data-plan excuse ("isn't in our market-data plan") is said ONLY after a real refusal on this load
// (fmpPlanRefused) — the Starter-week copy said it for every Toronto name, and kept saying it after the
// plan came back (D134).

import { bigMoney } from "./financials/format";

export type CovStatus = "live" | "partial" | "none";
export type Cov = { tier: number; name: string; status: CovStatus; detail: string };

export type CoverageIn = {
  closes: number; // daily sessions on file
  analyst: boolean; // a price-target consensus came back
  grades: boolean; // analyst ratings came back
  marketCap: boolean;
  cadListing: boolean;
  refused: { analyst: boolean; earnings: boolean; thirteenF: boolean }; // a REAL plan refusal on this load
  earnings: { next: string | null; last: string | null } | null;
  callSummarized: boolean; // the last earnings call has a summary
  news: number;
  institutional: { holders: number; change: number } | null;
  options: { regime: string | null; pcOI: number | null } | null;
  social: { mentions: number; velocity: number | null } | null;
  // From "The business" (D140) — null when that section wasn't built for this page.
  financials: { quarters: number; estimates: boolean; health: boolean; segments: boolean } | null;
  insiders: {
    sec: { crossListed: boolean; filesUsReports: boolean } | null; // who files with the SEC (null = no match)
    pulled: boolean; // the per-company Form 4 pull has run
    buys: number;
    sells: number;
    buyCents: number;
    sellCents: number;
  } | null;
  insiderBuys90d: number; // the Smart Money count — the fallback when `insiders` is null
};

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

function insiderRow(c: CoverageIn): Cov {
  const name = "Insider";
  const i = c.insiders;
  if (!i) {
    if (c.insiderBuys90d > 0) return { tier: 4, name, status: "live", detail: `${plural(c.insiderBuys90d, "insider buy")}, 90d · structured Form 4 / OpenInsider` };
    return c.cadListing
      ? { tier: 4, name, status: "partial", detail: "Canadian insiders report on SEDI, which our feed doesn't cover — Alfred researches it in dossiers" }
      : { tier: 4, name, status: "partial", detail: "US Form 4 + OpenInsider wired — no recent open-market buys on file" };
  }
  if (!i.sec) return { tier: 4, name, status: "partial", detail: "no US filer we can match — Canadian insiders report on SEDI, which Alfred researches in dossiers" };
  if (!i.pulled) return { tier: 4, name, status: "partial", detail: "the company's Form 4s arrive with the next daily refresh" };
  if (i.buys + i.sells === 0) {
    return i.sec.crossListed && !i.sec.filesUsReports
      ? { tier: 4, name, status: "partial", detail: "files a 40-F: its insiders report on SEDI in Canada, which our feed doesn't cover" }
      : { tier: 4, name, status: "live", detail: "the company's own Form 4s — no open-market trades in 12 months" };
  }
  const parts = [
    i.sells > 0 ? `${plural(i.sells, "sale")} (${bigMoney(i.sellCents, "USD")})` : null,
    i.buys > 0 ? `${plural(i.buys, "buy")} (${bigMoney(i.buyCents, "USD")})` : "no buys",
  ].filter(Boolean);
  return { tier: 4, name, status: "live", detail: `${parts.join(", ")} in 12 months · the company's own open-market Form 4s${i.sec.crossListed ? " (via its US listing)" : ""}` };
}

export function buildCoverage(c: CoverageIn): Cov[] {
  const f = c.financials;
  const fundamentals = [
    f && f.quarters > 0 ? `statements (${plural(f.quarters, "quarter")})` : null,
    f?.estimates ? "analyst forecasts" : null,
    c.analyst ? "price targets" : null,
    c.grades ? "ratings" : null,
    f?.health ? "health scores" : null,
    f?.segments ? "segments" : null,
  ].filter((x): x is string => !!x);
  const rows: Cov[] = [
    { tier: 1, name: "Price/vol", status: c.closes > 1 ? "live" : "partial", detail: `${c.closes} sessions of OHLCV → signals` },
    {
      tier: 2,
      name: "Fundamentals",
      status: fundamentals.length > 0 ? "live" : c.marketCap ? "partial" : "none",
      detail:
        fundamentals.length > 0
          ? fundamentals.join(" · ")
          : c.cadListing && c.refused.analyst
            ? "cap/sector only — this listing's analyst data isn't in our current market-data plan"
            : c.marketCap
              ? "cap/sector only — no statements or analyst coverage in our feed for this listing"
              : "no fundamentals in our feed for this listing",
    },
    {
      tier: 6,
      name: "Earnings",
      status: c.earnings ? "live" : "none",
      detail: c.earnings
        ? `${c.earnings.next ? `next ${c.earnings.next}` : `last ${c.earnings.last}`}${c.callSummarized ? " · last call summarized" : ""}`
        : c.cadListing && c.refused.earnings
          ? "this listing's earnings data isn't in our current market-data plan"
          : "no earnings data in our feed for this listing",
    },
    { tier: 7, name: "News", status: c.news > 0 ? "live" : "none", detail: c.news > 0 ? `${plural(c.news, "recent headline")}` : "no news in our feed for this name" },
    { tier: 9, name: "Macro", status: "live", detail: "Bank of Canada + FRED — Canadian and US rates, inflation and FX (in the agent + Today)" },
    insiderRow(c),
    {
      tier: 5,
      name: "Institutional",
      status: c.institutional ? "live" : "none",
      detail: c.institutional
        ? `${c.institutional.holders.toLocaleString("en-CA")} institutions · ${c.institutional.change >= 0 ? "+" : ""}${c.institutional.change} QoQ`
        : c.refused.thirteenF
          ? "13F isn't included in our current market-data plan"
          : "13F is US-listed holdings — empty for pure-TSX issuers",
    },
    {
      tier: 3,
      name: "Options positioning",
      status: c.options ? "live" : "none",
      detail: c.options
        ? `dealer gamma ${c.options.regime ?? "?"}, put/call ${c.options.pcOI?.toFixed(2) ?? "?"} — CBOE, a signal (never traded)`
        : "US-listed optionable names only — no chain for this name",
    },
    {
      tier: 8,
      name: "Social",
      status: c.social ? "live" : "partial",
      detail: c.social
        ? `${c.social.mentions} Reddit mentions${c.social.velocity != null ? `, ${c.social.velocity.toFixed(1)}× 7-day` : ""} — a crowd signal (never traded, on probation)`
        : "Reddit/Stocktwits wired — no retail chatter on this name (US-centric; CA goes dark)",
    },
    { tier: 10, name: "Alt data", status: "none", detail: "paid + US-centric — revisit at scale" },
  ];
  return rows.sort((a, b) => a.tier - b.tier);
}

/** The coverage inputs that come from a "The business" read model (lib/financials/view.ts). */
export function financialsCoverage(v: unknown): Pick<CoverageIn, "financials" | "insiders" | "callSummarized"> {
  const fv = v as {
    kind?: string;
    quarters?: unknown[];
    estimates?: { nextYear?: unknown; nextQuarter?: unknown } | null;
    health?: { piotroski?: number | null; altmanZ?: number | null } | null;
    segments?: { product?: unknown; geographic?: unknown };
    call?: { summary?: unknown } | null;
    filings?: Array<{ form: string }>;
    sec?: { crossListed: boolean } | null;
    insiders?: { buys: { count: number; cents: number }; sells: { count: number; cents: number } } | null;
  } | null;
  if (!fv || fv.kind !== "company") return { financials: null, insiders: null, callSummarized: false };
  return {
    financials: {
      quarters: fv.quarters?.length ?? 0,
      estimates: !!(fv.estimates?.nextYear || fv.estimates?.nextQuarter),
      health: fv.health?.piotroski != null || fv.health?.altmanZ != null,
      segments: !!(fv.segments?.product || fv.segments?.geographic),
    },
    insiders: {
      sec: fv.sec ? { crossListed: fv.sec.crossListed, filesUsReports: (fv.filings ?? []).some((x) => x.form === "10-K" || x.form === "10-Q") } : null,
      pulled: fv.insiders != null,
      buys: fv.insiders?.buys.count ?? 0,
      sells: fv.insiders?.sells.count ?? 0,
      buyCents: fv.insiders?.buys.cents ?? 0,
      sellCents: fv.insiders?.sells.cents ?? 0,
    },
    callSummarized: fv.call?.summary != null,
  };
}
