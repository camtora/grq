// The strategy presets for the options education portal (docs/OPTIONS-PORTAL.md). Each strategy is a
// list of LEG TEMPLATES (an option leg at a strike-offset from spot, or a stock leg). The calculator
// seeds concrete strikes/premiums from spot, lets the member tweak each leg, and the shared payoff /
// greeks / probability engines take it from there — so adding a strategy is just adding a template.
// Each spec also carries the deeper teaching fields the calculator shows per strategy (Phase 5).
// (Some strategies SELL options for teaching contrast; the real fund only ever BUYS options. Modeled.)
import type { Leg } from "./payoff";
import { blackScholesCents } from "./price";

export type StrategyKey =
  | "long-call"
  | "long-put"
  | "covered-call"
  | "cash-secured-put"
  | "bull-call-spread"
  | "bear-put-spread"
  | "long-straddle"
  | "long-strangle";
export type Outlook = "bullish" | "bearish" | "neutral";

export type OptionTemplate = { kind: "CALL" | "PUT"; action: "BUY" | "SELL"; strikeOffset: number; label: string };
export type LegTemplate = { kind: "STOCK"; action: "BUY" | "SELL" } | OptionTemplate;
export type LegValue = { strikeCents: number; premiumCents: number };

export type StrategySpec = {
  key: StrategyKey;
  name: string;
  tagline: string;
  outlook: Outlook;
  template: LegTemplate[];
  teach: string;
  riskNote: string;
  // Deeper per-strategy teaching (Phase 5) — rendered as a labelled panel on the calculator.
  view: string; // the market view that fits this trade
  profitWhen: string; // the winning scenario
  lossWhen: string; // the losing scenario
  decay: string; // how time decay (theta) cuts for/against you
  example: string; // a concrete worked example
  bestFor: string; // when to reach for it
};

/** The option legs of a strategy (stock legs excluded) — these are the ones the member edits. */
export function optionTemplates(spec: StrategySpec): OptionTemplate[] {
  return spec.template.filter((t): t is OptionTemplate => t.kind !== "STOCK");
}

export function hasStock(spec: StrategySpec): boolean {
  return spec.template.some((t) => t.kind === "STOCK");
}

/** Seed a default per-option-leg value from spot: strike from the template offset (rounded to a dollar),
 *  premium from Black-Scholes. One entry per option leg, in template order. */
export function seedLegs(spec: StrategySpec, spotCents: number, ivFrac: number, dte: number): LegValue[] {
  const t = Math.max(0, dte) / 365;
  return optionTemplates(spec).map((tpl) => {
    const strikeCents = Math.max(100, Math.round((spotCents * (1 + tpl.strikeOffset)) / 100) * 100);
    const premiumCents = Math.max(1, blackScholesCents(tpl.kind, spotCents, strikeCents, ivFrac, t));
    return { strikeCents, premiumCents };
  });
}

export type StrategyBuildInputs = { spotCents: number; ivFrac: number; dte: number; contracts: number; legs: LegValue[] };

/** Turn a spec + the edited per-option-leg values into payoff legs. Stock legs derive from spot
 *  (qty = contracts × 100). Option legs pull their strike/premium from `legs` in template order. */
export function buildStrategyLegs(spec: StrategySpec, i: StrategyBuildInputs): Leg[] {
  const out: Leg[] = [];
  let oi = 0;
  for (const tpl of spec.template) {
    if (tpl.kind === "STOCK") {
      out.push({ kind: "STOCK", action: tpl.action, qty: i.contracts * 100, entryCents: i.spotCents });
    } else {
      const v = i.legs[oi] ?? { strikeCents: i.spotCents, premiumCents: 0 };
      out.push({ kind: tpl.kind, action: tpl.action, qty: i.contracts, strikeCents: v.strikeCents, premiumCents: v.premiumCents, multiplier: 100, ivFrac: i.ivFrac, dteAtEntry: i.dte });
      oi++;
    }
  }
  return out;
}

export const STRATEGIES: Record<StrategyKey, StrategySpec> = {
  "long-call": {
    key: "long-call",
    name: "Long call",
    tagline: "A leveraged bet the stock RISES, with a deadline. Max loss = the premium.",
    outlook: "bullish",
    template: [{ kind: "CALL", action: "BUY", strikeOffset: 0.0, label: "Call strike" }],
    teach:
      "You pay a premium for the right to buy 100 shares at the strike until expiry. Above the strike the call gains roughly dollar-for-dollar with the stock; below it, it just bleeds value. You can only lose what you paid — but you can lose all of it, and you need the move to happen before the clock runs out.",
    riskNote: "Defined risk — the most you can lose is the premium you paid.",
    view: "Bullish — you expect the stock to rise meaningfully before expiry.",
    profitWhen: "The stock climbs above the strike + premium (your break-even) by expiry — from there it moves roughly 1-for-1 with the shares, but on a fraction of the capital.",
    lossWhen: "It sits at or below the strike at expiry — the call expires worthless and you lose the entire premium.",
    decay: "Against you. Every quiet day bleeds time value, so a slow grind can lose even if you're right on direction — you need the move to come sooner.",
    example: "Stock $100, buy a $100 call for $4 ($400). Break-even $104; at $110 the call is worth ~$1,000; below $100 the $400 is gone.",
    bestFor: "A strong directional conviction with a catalyst (earnings, a launch) inside the option's life.",
  },
  "long-put": {
    key: "long-put",
    name: "Long put",
    tagline: "A bet the stock FALLS — the bearish trade the stock fund can't make. Max loss = the premium.",
    outlook: "bearish",
    template: [{ kind: "PUT", action: "BUY", strikeOffset: 0.0, label: "Put strike" }],
    teach:
      "You pay a premium for the right to sell 100 shares at the strike. It gains value as the stock drops below the strike — so it's how you profit from (or hedge against) a decline. Same catch as a call: defined risk, but time decay works against you and the move has to come before expiry.",
    riskNote: "Defined risk — the most you can lose is the premium you paid.",
    view: "Bearish — you expect the stock to fall before expiry (or you want to hedge shares you hold).",
    profitWhen: "The stock drops below the strike − premium (break-even); the put then gains roughly 1-for-1 as the stock falls.",
    lossWhen: "It stays at or above the strike at expiry — the put expires worthless and the premium is lost.",
    decay: "Against you, same as a call — time value bleeds daily, so timing matters as much as direction.",
    example: "Stock $100, buy a $100 put for $4 ($400). Break-even $96; at $85 the put is worth ~$1,500; above $100 the $400 is gone.",
    bestFor: "Betting on — or insuring against — a decline, especially around a known risk event.",
  },
  "covered-call": {
    key: "covered-call",
    name: "Covered call",
    tagline: "Own 100 shares and SELL a call against them for income — capping your upside.",
    outlook: "neutral",
    template: [
      { kind: "STOCK", action: "BUY" },
      { kind: "CALL", action: "SELL", strikeOffset: 0.05, label: "Short-call strike" },
    ],
    teach:
      "You hold the shares and sell someone the right to buy them at the strike, pocketing the premium now. If the stock stays below the strike you keep the shares and the premium; if it rallies past, your shares get called away — you still profit, but your upside is capped at the strike. Income in exchange for giving up the home runs.",
    riskNote: "The downside is owning the stock (loss if it falls), softened by the premium. Upside is capped at the strike.",
    view: "Neutral-to-mildly-bullish — you own the shares and don't expect a big rally soon.",
    profitWhen: "The stock drifts up toward (not far past) the strike: you keep the shares, collect the premium, and pocket gains up to the strike.",
    lossWhen: "The stock falls — you still own it, so you take the loss (cushioned by the premium). A sharp rally past the strike simply caps your gain (shares called away).",
    decay: "FOR you. You sold the option, so time decay erodes what the buyer paid — that erosion is your income.",
    example: "Own 100 shares at $100, sell a $110 call for $2 ($200). Below $110 you keep the $200; above $110 the shares are called away at $110 — still a $12/share gain.",
    bestFor: "Earning income on shares you already hold and would be happy to sell at the strike.",
  },
  "cash-secured-put": {
    key: "cash-secured-put",
    name: "Cash-secured put",
    tagline: "SELL a put and set aside the cash — get paid to maybe buy the stock cheaper.",
    outlook: "neutral",
    template: [{ kind: "PUT", action: "SELL", strikeOffset: -0.05, label: "Short-put strike" }],
    teach:
      "You sell someone the right to sell you 100 shares at the strike and keep cash on hand to honour it. You collect the premium up front. If the stock stays above the strike, you keep the premium free and clear; if it drops below, you're obligated to buy at the strike (cushioned by the premium). A way to get paid while waiting to buy a name you like at a lower price.",
    riskNote: "Max loss if the stock goes to zero: the strike minus the premium, per share. Bounded but large.",
    view: "Neutral-to-bullish, and you'd happily own the stock at a lower price.",
    profitWhen: "The stock stays above the strike — the put expires worthless and you keep the premium free and clear.",
    lossWhen: "The stock falls below the strike − premium — you're assigned and buy the shares at an effective cost that's cushioned by the premium.",
    decay: "FOR you — you're the seller, so time decay is income working in your favour every day.",
    example: "Sell a $95 put for $2 ($200) on a $100 stock, hold $9,500 aside. Above $95 you keep the $200; below $95 you buy 100 shares at an effective $93.",
    bestFor: "Getting paid to wait for a name you want to own to come to you at a lower price.",
  },
  "bull-call-spread": {
    key: "bull-call-spread",
    name: "Bull call spread",
    tagline: "Buy a call, sell a higher one against it — cheaper than a call, but with a capped profit.",
    outlook: "bullish",
    template: [
      { kind: "CALL", action: "BUY", strikeOffset: 0.0, label: "Long call strike" },
      { kind: "CALL", action: "SELL", strikeOffset: 0.08, label: "Short call strike" },
    ],
    teach:
      "You buy a call and sell a higher-strike call against it. The premium you collect on the short call offsets the one you pay, so it's cheaper than a plain call — but your profit is capped at the higher strike. A defined-risk, defined-reward way to bet on a moderate rise.",
    riskNote: "Max loss = the net premium paid; max profit = the gap between strikes minus that premium.",
    view: "Moderately bullish — you expect a rise, but not a moonshot.",
    profitWhen: "The stock rises above the long strike + net premium; profit maxes out once it clears the short (higher) strike.",
    lossWhen: "It stays below the long strike at expiry — you lose the net premium paid (less than a plain call would cost).",
    decay: "Mixed — decay hurts your long leg but helps your short leg, so it bites much less than a plain long call.",
    example: "Buy the $100 call for $4, sell the $108 call for $1.50 → net $2.50 ($250). Break-even $102.50; max profit $550 above $108; max loss $250 below $100.",
    bestFor: "A measured bullish view where you'll trade away the home-run upside for a cheaper, lower break-even.",
  },
  "bear-put-spread": {
    key: "bear-put-spread",
    name: "Bear put spread",
    tagline: "Buy a put, sell a lower one against it — a cheaper, capped bearish bet.",
    outlook: "bearish",
    template: [
      { kind: "PUT", action: "BUY", strikeOffset: 0.0, label: "Long put strike" },
      { kind: "PUT", action: "SELL", strikeOffset: -0.08, label: "Short put strike" },
    ],
    teach:
      "You buy a put and sell a lower-strike put against it. Like the bull call spread but pointed down: cheaper than a plain put because the short leg offsets the cost, with your profit capped at the lower strike. Defined risk, defined reward, bearish.",
    riskNote: "Max loss = the net premium paid; max profit = the gap between strikes minus that premium.",
    view: "Moderately bearish — you expect a decline, but not a collapse.",
    profitWhen: "The stock falls below the long strike − net premium; profit maxes out once it drops through the short (lower) strike.",
    lossWhen: "It stays above the long strike at expiry — you lose the net premium paid.",
    decay: "Mixed — decay hurts the long put but helps the short put, so it's gentler than a plain long put.",
    example: "Buy the $100 put for $4, sell the $92 put for $1.50 → net $2.50 ($250). Break-even $97.50; max profit $550 below $92; max loss $250 above $100.",
    bestFor: "A measured bearish view — cheaper than a long put, with a defined, capped payoff.",
  },
  "long-straddle": {
    key: "long-straddle",
    name: "Long straddle",
    tagline: "Buy a call AND a put at the same strike — a bet on a BIG move either way.",
    outlook: "neutral",
    template: [
      { kind: "CALL", action: "BUY", strikeOffset: 0.0, label: "Call strike" },
      { kind: "PUT", action: "BUY", strikeOffset: 0.0, label: "Put strike" },
    ],
    teach:
      "You buy a call and a put at the same strike, so you win if the stock makes a big move in EITHER direction — earnings, a catalyst, a surprise. The catch: you pay two premiums, so the move has to be large just to break even, and time decay eats both legs while you wait.",
    riskNote: "Max loss = both premiums, if the stock sits right at the strike at expiry.",
    view: "You expect a BIG move but don't know which way — a binary event (earnings, a ruling) with genuine two-sided uncertainty.",
    profitWhen: "The stock moves far enough in either direction — past the strike ± the two premiums combined.",
    lossWhen: "It sits near the strike at expiry — both legs decay and you lose most or all of the combined premium.",
    decay: "Hard against you — you're long TWO options, so you're paying double time-decay. It needs to move, and soon.",
    example: "Stock $100, buy the $100 call ($3.50) and $100 put ($3.30) → $680 total. You profit below ~$93.20 or above ~$106.80; in between you bleed.",
    bestFor: "A known catalyst where a large move is likely but the direction is genuinely a coin flip.",
  },
  "long-strangle": {
    key: "long-strangle",
    name: "Long strangle",
    tagline: "Buy an OTM call and an OTM put — a cheaper big-move bet than the straddle.",
    outlook: "neutral",
    template: [
      { kind: "PUT", action: "BUY", strikeOffset: -0.06, label: "Put strike" },
      { kind: "CALL", action: "BUY", strikeOffset: 0.06, label: "Call strike" },
    ],
    teach:
      "Like a straddle, but you buy an out-of-the-money call and an out-of-the-money put instead of at-the-money ones. It costs less to put on, so it's cheaper — but the stock has to move even further before either leg pays off.",
    riskNote: "Max loss = both premiums, if the stock lands between the two strikes at expiry.",
    view: "Same as a straddle — a big move either way — but you want it cheaper and expect an even larger swing.",
    profitWhen: "The stock blows past the higher (call) strike or below the lower (put) strike by more than the premiums paid.",
    lossWhen: "It lands between the two strikes at expiry — both legs expire worthless and the combined premium is lost.",
    decay: "Against you, like the straddle — two long legs bleeding time value — but you paid less to start.",
    example: "Stock $100, buy the $106 call ($1.80) and $94 put ($1.70) → $350 total. You profit above ~$109.50 or below ~$90.50.",
    bestFor: "A big-move bet when you want a lower cost than a straddle and expect an outsized swing.",
  },
};

export const STRATEGY_LIST: StrategySpec[] = (
  ["long-call", "long-put", "covered-call", "cash-secured-put", "bull-call-spread", "bear-put-spread", "long-straddle", "long-strangle"] as StrategyKey[]
).map((k) => STRATEGIES[k]);

export function isStrategyKey(s: string | null | undefined): s is StrategyKey {
  return !!s && s in STRATEGIES;
}
