export type Quote = {
  symbol: string;
  bidCents: number;
  askCents: number;
  midCents: number;
  dayChangeBps?: number;
  at: Date;
};

export type PlaceOrderInput = {
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT";
  qty: number;
  limitPriceCents?: number;
  placedBy: string;
  reason?: string;
};

export type PlaceOrderResult =
  | { ok: true; orderId: number; status: "FILLED" | "PENDING"; fillPriceCents?: number; commissionCents?: number }
  | { ok: false; orderId?: number; rejectReason: string };

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
}
