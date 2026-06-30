export type Quote = {
  symbol: string;
  bidCents: number;
  askCents: number;
  midCents: number;
  dayChangeBps?: number;
  at: Date;
};

// An option leg on an order (D99 — docs/ALFRED-OPTIONS.md). Present → an OPT order;
// absent → a stock order (today's behaviour, untouched). Buy-to-open only: side BUY =
// buy-to-open, side SELL = sell-to-CLOSE a held leg (never opens a short option).
// For an OPT order: qty = CONTRACTS, limitPriceCents = PER-SHARE premium. The $ premium
// = qty × multiplier × per-share premium.
export type OptionLeg = {
  right: "CALL" | "PUT";
  strikeCents: number; // strike per share
  expiry: string; // "YYYY-MM-DD"
  multiplier?: number; // shares per contract, default 100
  conid?: number; // resolved IBKR option conid, if known
};

export type PlaceOrderInput = {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  qty: number;
  limitPriceCents?: number;
  placedBy: string;
  reason?: string;
  option?: OptionLeg;
};

export type PlaceOrderResult =
  | { ok: true; orderId: number; status: "FILLED" | "PENDING"; fillPriceCents?: number; commissionCents?: number }
  | { ok: false; orderId?: number; rejectReason: string };

// Currency conversion (CAD↔USD) so the fund can fund US purchases without margin
// (D62). amountToCents = how much of `to` to ACQUIRE (e.g. acquire US$500 → 50000).
// IBKR places an IDEALPRO FX order; sim moves the ledger at the BoC rate. This is a
// money-moving action: only ever called from the member-approved FX path
// (lib/fx-requests.ts), NEVER by the agent — the agent can only REQUEST a conversion.
export type FxConvertInput = {
  fromCurrency: "CAD" | "USD";
  toCurrency: "CAD" | "USD";
  amountToCents: number;
};
export type FxConvertResult =
  | { ok: true; rate: number; fromDebitedCents: number; toCreditedCents: number; commissionCents: number }
  | { ok: false; error: string };

/** The seam everything trades through. Implementations:
 *  - SimBroker (Phase 1+) — paper engine, synthetic then real delayed quotes
 *  - IBKRBroker (Phase 3) — IBeam/Client Portal Gateway, paper then live
 *  Selected by env BROKER=sim | ibkr-paper | ibkr-live. */
export interface BrokerAdapter {
  readonly kind: string;
  getQuote(symbol: string): Promise<Quote>;
  getQuotes(symbols: string[]): Promise<Quote[]>;
  /** Symbols this broker can currently price (sim: the synthetic universe). */
  listSymbols(): Promise<string[]>;
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  /** Fill any crossable resting orders (the sim sweeps its own book; IBKR is a
   *  no-op — resting limits live broker-side). Returns the count filled. */
  sweepPendingOrders(): Promise<number>;
  /** Convert cash between CAD and USD (D62). Money-moving — only the member-approved
   *  FX path calls this, never the agent. */
  convertCurrency(input: FxConvertInput): Promise<FxConvertResult>;
}
