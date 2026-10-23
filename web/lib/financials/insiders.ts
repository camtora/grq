// D140 display round 5 — what the company's own insiders did with their own money, in dollars. Pure.
// Input: open-market Form 4 trades (P purchases, S sales) from InsiderTrade, FMP rows only — OpenInsider
// rows repeat some of the same purchases under another key, so counting both would double them.
// Money leaves as integer cents (InsiderTrade stores float USD; converted once, here).

export type InsiderTradeIn = { insiderName: string; insiderTitle: string | null; side: string; valueUsd: number; shares: number; txnDate: Date };

export type InsiderPerson = { name: string; title: string | null; boughtCents: number; soldCents: number; trades: number; last: string };
export type InsiderSummary = {
  since: string; // the window's start (YYYY-MM-DD)
  buys: { count: number; cents: number; people: number };
  sells: { count: number; cents: number; people: number };
  people: InsiderPerson[]; // biggest by dollars traded, either way
};

const cents = (usd: number) => Math.round(usd * 100);

const ENTITY = /\b(LLC|L\.?P\.?|INC|CORP|TRUST|FUND|HOLDINGS?|PARTNERS|CAPITAL|LTD|FOUNDATION|GROUP)\b/i;
const titleCase = (w: string) => (w === w.toUpperCase() ? w.charAt(0) + w.slice(1).toLowerCase() : w);

/** SEC filer names come "Last First Middle", often in capitals ("STEVENS MARK A"). Read them the
 *  usual way round ("Mark A Stevens"); an entity ("Shopify Strategic Holdings 3 LLC") is left in order. */
export function insiderDisplayName(raw: string): string {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (ENTITY.test(raw)) return words.join(" "); // an entity's own capitals (LLC, LP) are meant
  if (words.length < 2 || words.length > 4) return words.map(titleCase).join(" ");
  const [last, ...rest] = words.map(titleCase);
  return [...rest, last].join(" ").replace(/\b([A-Z])(?=\s|$)/g, "$1."); // "Mark A Stevens" → "Mark A. Stevens"
}

/** Clean "officer: EVP, Worldwide Field Ops" / "director" / "10 percent owner" into a short role. */
export function insiderRole(title: string | null): string | null {
  if (!title) return null;
  const t = title.replace(/\bofficer:\s*/gi, "").trim(); // "director, officer: Chief Executive Officer" too
  if (/^10 ?percent owner$/i.test(t)) return "10% owner";
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}

export function insiderSummary(trades: InsiderTradeIn[], today: string, days = 365, top = 4): InsiderSummary {
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);
  const inWin = trades.filter((t) => t.txnDate.toISOString().slice(0, 10) >= since);
  const by = new Map<string, InsiderPerson>();
  const buyers = new Set<string>();
  const sellers = new Set<string>();
  let bc = 0, bs = 0, sc = 0, ss = 0;
  for (const t of inWin) {
    const v = cents(t.valueUsd);
    const d = t.txnDate.toISOString().slice(0, 10);
    const p = by.get(t.insiderName) ?? { name: insiderDisplayName(t.insiderName), title: insiderRole(t.insiderTitle), boughtCents: 0, soldCents: 0, trades: 0, last: d };
    if (t.side === "BUY") {
      p.boughtCents += v; bc++; bs += v; buyers.add(t.insiderName);
    } else {
      p.soldCents += v; sc++; ss += v; sellers.add(t.insiderName);
    }
    p.trades++;
    if (d > p.last) p.last = d;
    by.set(t.insiderName, p);
  }
  const people = [...by.values()].sort((a, b) => b.boughtCents + b.soldCents - (a.boughtCents + a.soldCents)).slice(0, top);
  return { since, buys: { count: bc, cents: bs, people: buyers.size }, sells: { count: sc, cents: ss, people: sellers.size }, people };
}
