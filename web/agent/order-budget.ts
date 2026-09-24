// What the agent has already done today, stated rather than inferred (2026-09-24, Opus 5.5 day 1).
//
// Two failures from the same afternoon, one shape — a limit the agent was told about but couldn't SEE:
//  1. Context listed "10 orders/day · 4/hour" but never how many were USED. So the agent sold 9 BNY to
//     fund a MSFT buy, and the MSFT leg was refused at the hourly cap — by five seconds — so it waited an
//     hour with the proceeds idle and then spent the day's last slots. A two-leg rotation can only be
//     sequenced against a budget it can see.
//  2. It placed ADI BUY 4 @ $367 GTC and wrote "order lapses ~Oct 8". Nothing enforced that: IBKR limits
//     go in as bare GTC and D127 gave the agent no cancel. Now every agent LIMIT carries a real expiry
//     (limitExpiry, enforced by the runner's sweep) and the context prints it, so the stated deadline
//     and the enforced one are the same number.
//
// Pure: no prisma, no broker. The runner/context/tools feed it rows. Tests: test/order-budget.test.ts.

import { etParts, isMarketDay, startOfEtDay } from "./calendar";
import { HARD } from "./policy";

const HOUR_MS = 60 * 60_000;
const CLOSE_MIN = 16 * 60;

/** The instant an agent LIMIT order stops resting: the 16:00 ET close of the Nth trading day AFTER the
 *  day it was placed (N = HARD.limitOrderExpiryTradingDays). "Trading day" = either exchange open
 *  (market ANY) — an order's exchange isn't on the Order row, and a one-sided holiday shifts the
 *  deadline by at most a day. Placed Thu 2026-09-24 with N=5 → Thu 2026-10-01 16:00 ET. */
export function limitExpiry(placedAt: Date, tradingDays: number = HARD.limitOrderExpiryTradingDays): Date {
  let day = startOfEtDay(placedAt);
  let counted = 0;
  while (counted < tradingDays) {
    // +36h then re-anchor to ET midnight: lands on the next calendar day whatever the DST offset.
    day = startOfEtDay(new Date(day.getTime() + 36 * HOUR_MS));
    if (isMarketDay(new Date(day.getTime() + 12 * HOUR_MS))) counted++;
  }
  return new Date(day.getTime() + CLOSE_MIN * 60_000);
}

export type BudgetOrder = {
  id: number;
  createdAt: Date;
  symbol: string;
  side: string;
  type: string;
  qty: number;
  limitPriceCents: number | null;
  status: string; // PENDING | FILLED | REJECTED | CANCELLED
  filledQty: number;
  avgFillPriceCents: number | null;
  placedBy: string;
  rejectReason: string | null;
};

/** Should the runner cancel this order now? Agent LIMIT orders only (either side): system stops and
 *  take-profits have their own lifecycle, and a member's manual order is the member's call. */
export function isExpiredAgentLimit(o: Pick<BudgetOrder, "placedBy" | "type" | "status" | "createdAt">, now: Date): boolean {
  return o.placedBy === "agent" && o.type === "LIMIT" && o.status === "PENDING" && now.getTime() >= limitExpiry(o.createdAt).getTime();
}

function money(c: number): string {
  return `$${(c / 100).toFixed(2)}`;
}

function hhmm(d: Date): string {
  const p = etParts(d);
  return `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" });
}

function orderLine(o: BudgetOrder): string {
  const px = o.type === "LIMIT" && o.limitPriceCents ? `LMT ${money(o.limitPriceCents)}` : "MKT";
  const head = `${o.side} ${o.qty} ${o.symbol} ${px} (#${o.id})`;
  switch (o.status) {
    case "FILLED":
      return `${head} → FILLED ${o.filledQty} @ ${money(o.avgFillPriceCents ?? 0)}`;
    case "PENDING":
      return `${head} → RESTING, auto-cancels at the close ${shortDate(limitExpiry(o.createdAt))}`;
    case "REJECTED":
      return `${head} → REJECTED, did not use a slot: ${(o.rejectReason ?? "").slice(0, 140)}`;
    default:
      return `${head} → ${o.status}${o.rejectReason ? `: ${o.rejectReason.slice(0, 140)}` : ""}`;
  }
}

/** The "Orders so far" context block. `today` = the agent's orders since ET midnight (all statuses);
 *  `resting` = every PENDING order (any day, any placer — a member's resting order still commits cash).
 *  Counting mirrors validator.ts exactly: agent orders, REJECTED excluded, day = since ET midnight,
 *  hour = rolling 60 minutes. */
export function orderBudgetBlock(today: BudgetOrder[], resting: BudgetOrder[], now: Date = new Date()): string {
  const counted = today.filter((o) => o.placedBy === "agent" && o.status !== "REJECTED");
  const inHour = counted.filter((o) => now.getTime() - o.createdAt.getTime() < HOUR_MS).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const dayLeft = Math.max(0, HARD.maxOrdersPerDay - counted.length);
  const hourLeft = Math.max(0, HARD.maxOrdersPerHour - inHour.length);

  let hourNote = "";
  if (hourLeft === 0 && inHour.length > 0) {
    // The rolling window frees one slot when its oldest order turns 60 minutes old.
    hourNote = ` — next hourly slot frees at ${hhmm(new Date(inHour[0].createdAt.getTime() + HOUR_MS))} ET`;
  }
  const effective = Math.min(dayLeft, hourLeft);
  const lines = [
    `Used today: ${counted.length}/${HARD.maxOrdersPerDay} (${dayLeft} left) · last 60 min: ${inHour.length}/${HARD.maxOrdersPerHour} (${hourLeft} left${hourNote}).`,
    `You can place ${effective} more order${effective === 1 ? "" : "s"} right now. A rotation is TWO orders — if both legs don't fit, don't place the first: a SELL whose BUY is then refused leaves the book in cash it didn't intend to hold.`,
  ];
  const mine = [...today].filter((o) => o.placedBy === "agent").sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  lines.push(mine.length ? "Today's orders:" : "Today's orders: none yet.");
  for (const o of mine) lines.push(`  ${hhmm(o.createdAt)} ET  ${orderLine(o)}`);

  const olderResting = resting.filter((o) => !mine.some((m) => m.id === o.id));
  if (olderResting.length) {
    lines.push("Still resting from earlier days:");
    for (const o of olderResting) lines.push(`  ${shortDate(o.createdAt)}  ${orderLine(o)}${o.placedBy !== "agent" ? ` [placed by ${o.placedBy}]` : ""}`);
  }
  lines.push(
    `Your LIMIT orders expire automatically at the close of the ${HARD.limitOrderExpiryTradingDays}th trading day after you place them — quote THAT date if you mention an expiry; never invent another. If you still like the entry after it lapses, place a fresh one.`,
  );
  return lines.join("\n");
}

// ---- get_journal, bounded (C1 prerequisite) ----
// On 2026-09-24 a get_journal call returned 230 KB; the SDK spilled it to a file and the agent paged
// it with Bash. Stage 1 (C1) removes Bash from decision sessions, which would strand that file — so
// the tool itself must return something that fits inline. Headers + trimmed bodies, full text by id.

export const JOURNAL_BODY_CHARS = 1200;
export const JOURNAL_TOTAL_CHARS = 40_000;

export type JournalRow = { id: number; at: Date; kind: string; symbol: string | null; title: string; body: string };

export function formatJournal(rows: JournalRow[], bodyChars = JOURNAL_BODY_CHARS, totalChars = JOURNAL_TOTAL_CHARS): string {
  if (rows.length === 0) return "(no entries)";
  const out: string[] = [];
  let used = 0;
  for (let i = 0; i < rows.length; i++) {
    const j = rows[i];
    const trimmed = j.body.length > bodyChars;
    const body = trimmed
      ? `${j.body.slice(0, bodyChars)}… [trimmed — ${j.body.length} chars; get_journal_entry id=${j.id} for the full text]`
      : j.body;
    const piece = `[${j.at.toISOString()}] #${j.id} ${j.kind}${j.symbol ? ` ${j.symbol}` : ""} — ${j.title}\n${body}`;
    if (used + piece.length > totalChars && out.length > 0) {
      out.push(`(${rows.length - i} older entr${rows.length - i === 1 ? "y" : "ies"} omitted to keep this readable — narrow by kind/symbol or lower limit.)`);
      break;
    }
    out.push(piece);
    used += piece.length;
  }
  return out.join("\n\n---\n\n");
}
