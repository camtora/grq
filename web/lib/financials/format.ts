// Display formatting for company financials (D140). Pure, so test/financials-format.test.ts pins it.
// Currency follows the house rule (D24, lib/money.ts): CAD is a bare "$", anything else carries its own
// symbol (en-CA gives US$, €, NT$, £) — and here that is the company's REPORTING currency, which for
// SHOP.TO or AEM.TO is US$ even though they trade in C$.

import type { Growth } from "./derive";

const symCache = new Map<string, string>();
export function currencySymbol(ccy: string | null | undefined): string {
  const c = (ccy || "CAD").toUpperCase();
  let s = symCache.get(c);
  if (s == null) {
    try {
      s = new Intl.NumberFormat("en-CA", { style: "currency", currency: c }).formatToParts(0).find((p) => p.type === "currency")?.value ?? `${c} `;
    } catch {
      s = `${c} `;
    }
    symCache.set(c, s);
  }
  return s;
}

/** Compact money from cents: US$96.2B, $344M, NT$4.94T, −US$4.1M. Three significant figures, never
 *  more than one decimal — a panel reads "US$303B", not "US$302,969,000,000.00". */
export function bigMoney(cents: number | null | undefined, ccy: string | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const v = Math.abs(cents) / 100;
  const units: Array<[number, string]> = [[1e12, "T"], [1e9, "B"], [1e6, "M"], [1e3, "K"]];
  let body = v < 1000 ? v.toFixed(0) : "";
  for (const [n, u] of units) {
    if (v >= n) {
      const x = v / n;
      body = `${x >= 100 ? x.toFixed(0) : x.toFixed(1).replace(/\.0$/, "")}${u}`;
      break;
    }
  }
  return `${cents < 0 ? "−" : ""}${currencySymbol(ccy)}${body}`;
}

/** The same, with an explicit sign for a change: "+US$49.5B", "−$1.2M". */
export function signedBigMoney(cents: number | null | undefined, ccy: string | null | undefined): string {
  if (cents == null || !Number.isFinite(cents)) return "—";
  const s = bigMoney(Math.abs(cents), ccy);
  return cents < 0 ? `−${s}` : `+${s}`;
}

/** EPS (× 10,000) as money. Two decimals normally; four when it's under a dime, where two would
 *  round a real figure to $0.00 (P0 R8: TN.CN −0.0022, CCO 0.0579). */
export function epsMoney(eps4: number | null | undefined, ccy: string | null | undefined): string {
  if (eps4 == null) return "—";
  const v = Math.abs(eps4) / 10_000;
  const body = v > 0 && v < 0.1 ? v.toFixed(4) : v.toFixed(2);
  return `${eps4 < 0 ? "−" : ""}${currencySymbol(ccy)}${body}`;
}

/** A growth figure: "+12.3%", "−4.0%", "n/m". Over ±1000% it drops the decimal. */
export function growthText(g: Growth | null | undefined): string {
  if (!g) return "—";
  if (g.kind === "nm") return "n/m";
  const p = g.bps / 100;
  const body = Math.abs(p) >= 1000 ? Math.abs(p).toFixed(0) : Math.abs(p).toFixed(1);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${body}%`;
}

/** Why a growth figure is n/m, in words for a tooltip. */
export function nmReason(g: Growth | null | undefined): string | null {
  if (!g || g.kind !== "nm") return null;
  return g.reason === "negative-base"
    ? "Not meaningful: it was a loss a year ago, so a percentage change would mislead."
    : g.reason === "zero-base"
      ? "Not meaningful: there was nothing to compare against a year ago."
      : "Not meaningful: the data provider changed how it books this line between the two quarters.";
}

/** Basis points as a percentage: 6624 → "66.2%". */
export function bpsText(bps: number | null | undefined, digits = 1): string {
  if (bps == null) return "—";
  return `${(bps / 100).toFixed(digits)}%`;
}

/** A change in basis points as percentage POINTS: +350 → "+3.5 pts". */
export function ptsText(bps: number | null | undefined): string {
  if (bps == null) return "—";
  const p = bps / 100;
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p).toFixed(1)} pts`;
}

/** Tone for a growth figure: emerald up, red down, muted otherwise. */
export function growthTone(g: Growth | null | undefined): "up" | "down" | "flat" {
  if (!g || g.kind !== "ok" || g.bps === 0) return "flat";
  return g.bps > 0 ? "up" : "down";
}

/** "Q2 FY2027" period-end → "Jul 2026" for an axis label. */
export function monthLabel(isoDay: string): string {
  const d = new Date(`${isoDay}T00:00:00Z`);
  return d.toLocaleDateString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });
}
