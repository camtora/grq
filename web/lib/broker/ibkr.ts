import https from "node:https";
import { prisma } from "../db";
import { getQuote as yahooQuote, getQuotes as yahooQuotes } from "./quotes";
import { activeSymbols, universeEntry } from "../universe";
import { ibkrFixedCommissionCents, writeNavSnapshot } from "./sim";
import { usdCadRate } from "../fx";
import type { BrokerAdapter, FxConvertInput, FxConvertResult, PlaceOrderInput, PlaceOrderResult, Quote } from "./types";

// IBKRBroker — Phase 3 paper (then Phase 4 live) behind the same BrokerAdapter
// seam. Orders, positions and cash go to IBKR via the Client Portal Web API (the
// IBeam-managed gateway); decision QUOTES stay on delayed Yahoo (same as the sim)
// — IBKR's job here is real execution + broker truth, and our DB becomes a
// reconciled MIRROR of the account (not the source of truth, as it is for the sim).
//
// The §6 guardrail validator still runs BEFORE placeOrder on the agent path,
// exactly as with the sim — swapping the broker never touches the gate. Bring-up
// + the live-wiring checklist live in docs/IBKR-PHASE3.md.
//
// ⚠️ The endpoint SHAPES below follow IBKR's documented CP Web API, but a few
// response details (conid selection across listings, the reply/confirm cascade,
// fill/commission fields) only fully shake out against the live gateway — those
// spots are marked VERIFY-LIVE. Inert until BROKER=ibkr-paper.

const GATEWAY = process.env.IBKR_GATEWAY_URL ?? "https://ibeam:5000";
const ACCOUNT_ID = process.env.IBKR_ACCOUNT_ID ?? "";
const BASE = `${GATEWAY}/v1/api`;

// A BUY settles cash-first at IBKR — `settledcash` drops the instant it fills, but
// the positions ledger takes a few seconds to grow the new shares. Within this
// window reconcile() defers mirroring the lower cash so the NAV tape never prints a
// phantom "cash-out / no-stock-in" dip (see reconcile()). The real terminator is the
// shares landing (brokerQty > dbQty ends the deferral instantly, usually in seconds);
// this window is only the backstop for a buy that NEVER lands, so cash isn't frozen
// forever. Widened 5→15min after a TSM buy's shares took ~8min to mirror (2026-06-25).
const CASH_SETTLE_LAG_MS = 15 * 60_000;

// Scoped self-signed-cert trust: this agent applies ONLY to gateway calls below,
// never globally (Yahoo quotes etc. keep full TLS verification).
const gatewayAgent = new https.Agent({ rejectUnauthorized: false });

type CpResponse = { status: number; text: string };

function cpRaw(path: string, method: string, body?: string): Promise<CpResponse> {
  const url = new URL(`${BASE}${path}`);
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        agent: gatewayAgent,
        timeout: 15_000,
        headers: {
          "content-type": "application/json",
          "User-Agent": "grq/1.0",
          ...(body ? { "content-length": Buffer.byteLength(body).toString() } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (c) => (data += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, text: data }));
      },
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error(`IBKR ${path} timed out`)));
    if (body) req.write(body);
    req.end();
  });
}

async function cp<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const payload = body === undefined ? undefined : JSON.stringify(body);
  const { status, text } = await cpRaw(path, method, payload);
  if (status < 200 || status >= 300) {
    throw new Error(`IBKR ${method} ${path} → ${status} ${text.slice(0, 240)}`);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- IBKR response shapes (the subset we use) ----
type SecdefHit = { conid?: number; symbol?: string; description?: string; companyName?: string; sections?: { secType?: string; exchange?: string }[] };
type OrderReply = { id?: string; message?: string[]; order_id?: string; orderId?: string; order_status?: string; error?: string };
// NB the per-order status endpoint reports the fill price as `average_price`
// (snake_case); `avgPrice` is the orders-LIST field. Market orders carry no
// limit_price fallback, so missing `average_price` here = no usable price.
type OrderStatus = { order_status?: string; average_price?: string; avgPrice?: string; avg_price?: string; filledQuantity?: number; commission?: number; total_size?: number };
type IbkrPosition = { conid?: number; position?: number; avgCost?: number; avgPrice?: number; contractDesc?: string; currency?: string };
type Ledger = Record<string, { cashbalance?: number; settledcash?: number; currency?: string }>;

// A PENDING order that finalizePending() resolved to a fill — the runner pings
// Discord per item (skipping system stops/take-profits, which alert at trigger).
export type FinalizedFill = { symbol: string; side: "BUY" | "SELL"; qty: number; priceCents: number; placedBy: string; reason: string | null };

export class IBKRBroker implements BrokerAdapter {
  readonly kind = "ibkr";
  private conidBySymbol = new Map<string, number>();
  private symbolByConid = new Map<number, string>();
  private fxConidCache: number | null = null;

  // ---- session / health ----------------------------------------------------

  /** Gateway brokerage status — the orchestrator health-checks this and alerts
   *  (critical) if the session drops while holding positions. */
  async authStatus(): Promise<{ authenticated: boolean; connected: boolean; competing: boolean }> {
    try {
      const s = await cp<{ authenticated?: boolean; connected?: boolean; competing?: boolean }>("/iserver/auth/status", "POST");
      return { authenticated: !!s.authenticated, connected: !!s.connected, competing: !!s.competing };
    } catch {
      return { authenticated: false, connected: false, competing: false };
    }
  }

  /** Keep the brokerage session warm; re-init if it has dropped. Call on the tick. */
  async keepAlive(): Promise<void> {
    await cp("/tickle", "POST").catch(() => {});
    const s = await this.authStatus();
    if (!s.authenticated) {
      await cp("/iserver/reauthenticate", "POST").catch(() => {});
    }
  }

  // ---- contract resolution -------------------------------------------------

  /** symbol → IBKR conid in the name's own currency: CAD→Toronto (TSE/TSX/Venture),
   *  USD→the US listing (NYSE/NASDAQ/…) — D34 multi-currency. Cached per symbol. */
  async conidFor(symbol: string): Promise<number | null> {
    const sym = symbol.toUpperCase();
    const cached = this.conidBySymbol.get(sym);
    if (cached) return cached;
    try {
      // Search by the bare ticker (strip the .TO/.V Yahoo suffix).
      const bare = sym.replace(/\.(TO|V|NE|CN)$/i, "");
      const hits = await cp<SecdefHit[]>(`/iserver/secdef/search?symbol=${encodeURIComponent(bare)}&secType=STK`);
      if (!Array.isArray(hits) || hits.length === 0) return null;
      // Pick the listing in the name's own currency (D34): USD names → the US
      // listing (NYSE/NASDAQ/…), CAD names → Toronto (TSE/TSX/Venture). Fall back to
      // the first hit. VERIFY-LIVE: the hit's `description` is usually the exchange.
      const wantUsd = ((await universeEntry(sym).catch(() => null))?.currency ?? "").toUpperCase() === "USD";
      const isToronto = (h: SecdefHit) =>
        /TSE|TSX|TORONTO|VENTURE/i.test(h.description ?? "") ||
        (h.sections ?? []).some((s) => /TSE|TSX|VENTURE/i.test(s.exchange ?? ""));
      const isUS = (h: SecdefHit) =>
        /NYSE|NASDAQ|ARCA|AMEX|BATS|PINK/i.test(h.description ?? "") ||
        (h.sections ?? []).some((s) => /NYSE|NASDAQ|ARCA|AMEX|BATS|PINK/i.test(s.exchange ?? ""));
      const pick = (wantUsd ? hits.find(isUS) : hits.find(isToronto)) ?? hits[0];
      // secdef/search returns conid as a STRING; the order endpoint wants an
      // integer (else 400 "parameter with incorrect type"), so coerce to Number.
      const conid = pick.conid == null ? null : Number(pick.conid);
      if (conid && Number.isFinite(conid)) {
        this.conidBySymbol.set(sym, conid);
        this.symbolByConid.set(conid, sym);
        return conid;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ---- decision quotes stay on the delayed Yahoo source (unchanged from sim) --
  async getQuote(symbol: string): Promise<Quote> {
    const q = await yahooQuote(symbol);
    if (!q) throw new Error(`No quote for symbol: ${symbol}`);
    return q;
  }
  async getQuotes(symbols: string[]): Promise<Quote[]> {
    const m = await yahooQuotes(symbols);
    return symbols.map((s) => m.get(s.toUpperCase())).filter((q): q is Quote => !!q);
  }
  async listSymbols(): Promise<string[]> {
    return activeSymbols();
  }

  // ---- order placement -----------------------------------------------------

  /** Submit an order to IBKR, clear any reply/confirm warnings, then poll for the
   *  fill. On a fill we record the Order + Trade + TRADE journal entry (fill price
   *  & commission from IBKR) and reconcile positions/cash from broker truth. If it
   *  doesn't fill inside the poll window it returns PENDING and the next reconcile
   *  picks it up. */
  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    if (!ACCOUNT_ID) return this.recordReject(input, "IBKR_ACCOUNT_ID not configured.");

    // Pre-trade gate that must hold for EVERY broker: the kill switch.
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings?.killSwitch) return this.recordReject(input, "Kill switch is engaged — all trading halted.");
    // Options seam (D99): this equities adapter resolves only STK conids — an OPT order must never
    // fall through to the stock ticket. Enforce the real "no options" guardrail first, then refuse
    // until the OPT conid + order path is wired (Phase C — needs the account's options perms + OPRA).
    if (input.option) {
      const envOff = (process.env.GRQ_OPTIONS_ENABLED ?? "true").toLowerCase() === "false";
      if (envOff || !settings?.allowOptions) {
        return this.recordReject(input, "Options trading is off (guardrail #3): a member must enable allowOptions — Alfred never can.");
      }
      return this.recordReject(input, "Options execution is not yet wired for IBKR — pending options permission + OPRA market data on the account (D99).");
    }
    if (!Number.isInteger(input.qty) || input.qty <= 0) return this.recordReject(input, "Quantity must be a positive whole number of shares.");

    const conid = await this.conidFor(input.symbol);
    if (!conid) return this.recordReject(input, `No IBKR contract found for ${input.symbol.toUpperCase()}.`);

    try {
      const order = {
        conid,
        orderType: input.type === "LIMIT" ? "LMT" : "MKT",
        side: input.side,
        quantity: input.qty,
        tif: input.type === "LIMIT" ? "GTC" : "DAY",
        ...(input.type === "LIMIT" && input.limitPriceCents ? { price: input.limitPriceCents / 100 } : {}),
      };
      let resp = await cp<unknown>(`/iserver/account/${ACCOUNT_ID}/orders`, "POST", { orders: [order] });

      // Clear the reply/confirm cascade (warnings the API requires you to ack).
      // The response is an array of reply objects on success, OR a bare object
      // {error, action} when IBKR refuses outright (e.g. "No trading permissions.").
      let orderId: string | undefined;
      for (let i = 0; i < 6; i++) {
        if (resp && typeof resp === "object" && !Array.isArray(resp) && (resp as { error?: string }).error) {
          return this.recordReject(input, `IBKR: ${(resp as { error: string }).error}`);
        }
        const first = Array.isArray(resp) ? (resp[0] as OrderReply) : undefined;
        if (!first) break;
        if (first.error) return this.recordReject(input, `IBKR rejected: ${first.error}`);
        orderId = first.order_id ?? first.orderId;
        if (orderId) break;
        if (first.id) {
          resp = await cp<unknown>(`/iserver/reply/${first.id}`, "POST", { confirmed: true });
          continue;
        }
        break;
      }
      if (!orderId) return this.recordReject(input, "IBKR accepted no order id (reply cascade unresolved) — VERIFY-LIVE.");

      // Poll the fill (~12s). Paper fills on liquid names are usually near-instant.
      let filledPriceCents: number | null = null;
      let commissionCents = ibkrFixedCommissionCents(input.qty, input.limitPriceCents ?? 0) || 100;
      for (let i = 0; i < 8; i++) {
        await sleep(1500);
        const st = await cp<OrderStatus>(`/iserver/account/order/status/${orderId}`).catch(() => ({}) as OrderStatus);
        const status = (st.order_status ?? "").toLowerCase();
        if (status === "filled") {
          const avg = parseFloat(st.average_price ?? st.avgPrice ?? st.avg_price ?? "0");
          if (avg > 0) filledPriceCents = Math.round(avg * 100);
          if (typeof st.commission === "number" && st.commission > 0) commissionCents = Math.round(st.commission * 100);
          break;
        }
        if (status === "cancelled" || status === "rejected") {
          return this.recordReject(input, `IBKR order ${orderId} ${status}.`);
        }
      }

      if (filledPriceCents === null) {
        // Working but not yet filled — record PENDING with the broker order id so
        // finalizePending() can resolve it to a fill on a later tick (a slow fill
        // would otherwise leave the order PENDING with no Trade ever written).
        const o = await prisma.order.create({
          data: {
            symbol: input.symbol.toUpperCase(), side: input.side, type: input.type, qty: input.qty,
            limitPriceCents: input.limitPriceCents, status: "PENDING", placedBy: input.placedBy,
            reason: input.reason, broker: "ibkr", brokerOrderId: orderId,
          },
        });
        return { ok: true, orderId: o.id, status: "PENDING" };
      }

      const orderRow = await this.recordFill(input, filledPriceCents, commissionCents);
      // IBKR's positions ledger lags the fill by a few seconds, so a single
      // immediate reconcile can miss the just-filled position — leaving it
      // unmirrored: NAV understated, a false cash-only dip in the NAV tape, and the
      // Universe tab showing no position. Reconcile in a short retry loop until the
      // new BUY actually appears in the mirror, THEN snapshot, so the ledger and the
      // tape reflect the trade rather than a transient understated state (2026-06-18).
      const sym = input.symbol.toUpperCase();
      for (let i = 0; i < 5; i++) {
        await this.reconcile().catch(() => {});
        if (input.side === "SELL") break; // sells reduce/close a position — never understate NAV
        const pos = await prisma.position.findUnique({ where: { symbol: sym } });
        if (pos && pos.qty > 0) break;
        await sleep(2000);
      }
      await writeNavSnapshot(`IBKR fill order #${orderRow}`).catch(() => {});
      return { ok: true, orderId: orderRow, status: "FILLED", fillPriceCents: filledPriceCents, commissionCents };
    } catch (e) {
      return this.recordReject(input, `IBKR order error: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /** Write a FILLED order + trade + TRADE journal entry from IBKR's execution.
   *  Position/cash are NOT computed here — reconcile() mirrors them from broker
   *  truth. Returns the order id. */
  private async recordFill(input: PlaceOrderInput, priceCents: number, commissionCents: number): Promise<number> {
    const symbol = input.symbol.toUpperCase();
    const order = await prisma.order.create({
      data: {
        symbol, side: input.side, type: input.type, qty: input.qty, limitPriceCents: input.limitPriceCents,
        status: "FILLED", filledQty: input.qty, avgFillPriceCents: priceCents, commissionCents,
        placedBy: input.placedBy, reason: input.reason, broker: "ibkr",
      },
    });
    await this.settleFill(
      { id: order.id, symbol, side: input.side, qty: input.qty, reason: input.reason ?? null },
      priceCents,
      commissionCents,
    );
    return order.id;
  }

  /** Write the Trade + TRADE journal entry for a fill on an already-persisted order
   *  row. Realized P&L on a sell uses the DB position's ACB (kept current by
   *  reconcile, which runs AFTER this on the tick). Shared by the synchronous fill
   *  path (recordFill) and the per-tick PENDING finaliser (finalizePending). */
  private async settleFill(
    order: { id: number; symbol: string; side: "BUY" | "SELL"; qty: number; reason: string | null },
    priceCents: number,
    commissionCents: number,
  ): Promise<void> {
    const pos = order.side === "SELL" ? await prisma.position.findUnique({ where: { symbol: order.symbol } }) : null;
    const realizedPnlCents = pos ? order.qty * (priceCents - pos.avgCostCents) - commissionCents : null;
    await prisma.trade.create({
      data: { orderId: order.id, symbol: order.symbol, side: order.side, qty: order.qty, priceCents, commissionCents, realizedPnlCents },
    });
    await prisma.journalEntry.create({
      data: {
        kind: "TRADE", symbol: order.symbol, orderId: order.id,
        title: `${order.side} ${order.qty} ${order.symbol} @ ${(priceCents / 100).toFixed(2)} (IBKR paper)`,
        body:
          (order.reason ?? "(no thesis recorded)") +
          (realizedPnlCents !== null
            ? `\n\n**Realized P&L:** ${(realizedPnlCents / 100).toFixed(2)} CAD (after ${(commissionCents / 100).toFixed(2)} commission)`
            : `\n\n**Commission:** ${(commissionCents / 100).toFixed(2)} CAD`),
      },
    });
  }

  /** Self-heal the trade ledger: a FILLED order can end up with NO Trade row if settleFill
   *  threw AFTER the status flip (the XIC #32 / D33 gap) — the order reads FILLED and the
   *  position mirrors from the broker, but the execution is invisible in the trade history +
   *  realized-P&L. Each tick, find any FILLED ibkr order lacking a Trade and write the missing
   *  Trade + journal from the order's recorded fill price, so the ledger always mirrors the
   *  orders. Idempotent (skips orders that already have a Trade). Returns the count backfilled. */
  private async backfillMissingTrades(): Promise<number> {
    const [filled, trades] = await Promise.all([
      prisma.order.findMany({
        where: { status: "FILLED", broker: "ibkr" },
        select: { id: true, symbol: true, side: true, qty: true, reason: true, avgFillPriceCents: true, commissionCents: true },
      }),
      prisma.trade.findMany({ select: { orderId: true } }),
    ]);
    const haveTrade = new Set(trades.map((t) => t.orderId));
    let n = 0;
    for (const o of filled) {
      if (haveTrade.has(o.id) || o.avgFillPriceCents == null || o.avgFillPriceCents <= 0) continue;
      await this.settleFill({ id: o.id, symbol: o.symbol, side: o.side, qty: o.qty, reason: o.reason }, o.avgFillPriceCents, o.commissionCents);
      n++;
    }
    return n;
  }

  /** Reconcile PENDING ibkr orders against broker truth. An order whose fill landed
   *  AFTER the synchronous poll window (placeOrder returned PENDING) is finalised
   *  here — Trade + journal written, Order flipped to FILLED — so the trade ledger is
   *  never silently incomplete. Cancelled/rejected orders are closed out. Returns the
   *  newly-filled orders (the runner pings Discord per fill + reconciles positions/
   *  cash after). Called on the tick BEFORE reconcile so a sell's realized P&L reads
   *  the pre-fill ACB. */
  async finalizePending(): Promise<FinalizedFill[]> {
    await this.backfillMissingTrades().catch(() => {}); // self-heal FILLED orders missing their Trade row (the XIC #32 / D33 gap)
    const pending = await prisma.order.findMany({ where: { status: "PENDING", broker: "ibkr" } });
    const filled: FinalizedFill[] = [];
    for (const o of pending) {
      if (!o.brokerOrderId) continue; // no broker id (legacy row) — can't track; backfilled manually
      const st = await cp<OrderStatus>(`/iserver/account/order/status/${o.brokerOrderId}`).catch(() => ({}) as OrderStatus);
      const status = (st.order_status ?? "").toLowerCase();
      if (status === "filled") {
        const avg = parseFloat(st.average_price ?? st.avgPrice ?? st.avg_price ?? "0");
        const priceCents = avg > 0 ? Math.round(avg * 100) : o.limitPriceCents ?? 0;
        if (priceCents <= 0) continue; // no usable fill price yet — retry next tick
        const commissionCents =
          typeof st.commission === "number" && st.commission > 0
            ? Math.round(st.commission * 100)
            : ibkrFixedCommissionCents(o.qty, priceCents) || 100;
        await prisma.order.update({
          where: { id: o.id },
          data: { status: "FILLED", filledQty: o.qty, avgFillPriceCents: priceCents, commissionCents },
        });
        await this.settleFill({ id: o.id, symbol: o.symbol, side: o.side, qty: o.qty, reason: o.reason }, priceCents, commissionCents);
        filled.push({ symbol: o.symbol, side: o.side, qty: o.qty, priceCents, placedBy: o.placedBy, reason: o.reason });
      } else if (status === "cancelled" || status === "rejected") {
        await prisma.order.update({
          where: { id: o.id },
          data: { status: "REJECTED", rejectReason: `IBKR order ${o.brokerOrderId} ${status}.` },
        });
      }
    }
    return filled;
  }

  private async recordReject(input: PlaceOrderInput, rejectReason: string): Promise<PlaceOrderResult> {
    const order = await prisma.order.create({
      data: {
        symbol: input.symbol.toUpperCase(), side: input.side, type: input.type, qty: input.qty,
        limitPriceCents: input.limitPriceCents, status: "REJECTED", rejectReason,
        placedBy: input.placedBy, reason: input.reason, broker: "ibkr",
      },
    });
    return { ok: false, orderId: order.id, rejectReason };
  }

  // ---- broker truth: positions + cash --------------------------------------

  /** Read live positions from IBKR. Maps conid → our symbol via the resolver
   *  cache (warmed by conidFor / listSymbols at startup). */
  async getPositions(): Promise<{ symbol: string; qty: number; avgCostCents: number; currency: string }[] | null> {
    // Returns `null` when the read is UNTRUSTWORTHY — the fetch failed/timed out, or
    // the endpoint returned a non-array (it serves an error object / "still loading"
    // shape while the iserver session is spinning up, e.g. right after a restart or
    // the nightly re-auth). reconcile() must NOT delete the mirror on null. A
    // successful, genuinely-empty array IS authoritative (a flat account) → clears.
    let raw: IbkrPosition[];
    try {
      raw = await cp<IbkrPosition[]>(`/portfolio/${ACCOUNT_ID}/positions/0`);
    } catch {
      return null;
    }
    if (!Array.isArray(raw)) return null;
    const out: { symbol: string; qty: number; avgCostCents: number; currency: string }[] = [];
    for (const p of raw) {
      const cid = p.conid == null ? null : Number(p.conid);
      if (!cid || !p.position) continue;
      const symbol = this.symbolByConid.get(cid);
      if (!symbol) continue; // not one of ours — skip (VERIFY-LIVE: warm the cache for all holdings)
      const avg = p.avgCost ?? p.avgPrice ?? 0;
      // avgCost is in the position's native currency; we tag it so NAV/sizing convert (D34).
      out.push({ symbol, qty: Math.round(p.position), avgCostCents: Math.round(avg * 100), currency: (p.currency ?? "CAD").toUpperCase() });
    }
    return out;
  }

  /** Cash balances per currency from the account ledger — CAD + USD (D34). */
  async getCashByCurrency(): Promise<{ cadCents: number | null; usdCents: number }> {
    const ledger = await cp<Ledger>(`/portfolio/${ACCOUNT_ID}/ledger`).catch(() => null);
    if (!ledger) return { cadCents: null, usdCents: 0 };
    const bal = (k: string): number | null => {
      const c = ledger[k];
      if (c?.cashbalance === undefined) return null;
      return Math.round((c.settledcash ?? c.cashbalance) * 100);
    };
    return { cadCents: bal("CAD") ?? bal("BASE"), usdCents: bal("USD") ?? 0 };
  }

  /** Mirror IBKR positions + cash into our DB so the dashboards, NAV snapshots
   *  and realized-P&L math read broker truth. Called by the runner each tick and
   *  right after a fill. Writes a SYSTEM journal note when it corrects drift. */
  async reconcile(): Promise<string[]> {
    // Never reconcile against a half-up session: a failed positions read would look
    // like a flat account and WIPE the mirror — which on 2026-06-17 briefly dropped
    // our holding, cratered NAV to cash-only and tripped a false daily-loss pause.
    // It's a mirror; skipping a tick is harmless, the next one catches up.
    const auth = await this.authStatus();
    if (!auth.authenticated || !auth.connected) return [];

    // Warm the conid→symbol map for EVERY active symbol so holdings resolve —
    // including names promoted AFTER boot. The old once-only `size===0` warm meant
    // a name self-promoted mid-session (e.g. SLF, 2026-06-18) never entered this
    // long-lived instance's map, so getPositions() silently skipped its just-bought
    // position → NAV understated → a FALSE daily-loss pause. conidFor short-circuits
    // on cached symbols, so re-checking the (small) active set each tick is cheap.
    for (const s of await activeSymbols()) {
      if (!this.conidBySymbol.has(s.toUpperCase())) await this.conidFor(s).catch(() => null);
    }
    const [brokerPositions, cash] = await Promise.all([this.getPositions(), this.getCashByCurrency()]);

    // Mirror baselines — read once and shared by the positions mirror AND the
    // cash-settlement guard below.
    const [account, dbPositions] = await Promise.all([
      prisma.account.findUnique({ where: { id: 1 } }),
      prisma.position.findMany(),
    ]);
    const dbBy = new Map(dbPositions.map((p) => [p.symbol, p]));
    const brokerBy = new Map((brokerPositions ?? []).map((p) => [p.symbol, p]));

    let drift = 0;
    let frozen: string[] = [];
    // Only touch positions when the read was trustworthy (a real array). null =
    // failed/non-array → leave the mirror exactly as-is; NEVER delete on it. A
    // successful empty array still flows through and correctly clears a flat account.
    if (brokerPositions !== null) {
      for (const bp of brokerPositions) {
        const cur = dbBy.get(bp.symbol);
        if (!cur || cur.qty !== bp.qty || cur.avgCostCents !== bp.avgCostCents || cur.currency !== bp.currency) {
          await prisma.position.upsert({
            where: { symbol: bp.symbol },
            create: { symbol: bp.symbol, qty: bp.qty, avgCostCents: bp.avgCostCents, currency: bp.currency },
            update: { qty: bp.qty, avgCostCents: bp.avgCostCents, currency: bp.currency },
          });
          drift++;
        }
      }
      // Positions IBKR no longer reports → closed; drop them (only on a trusted read).
      // RESET-DETECTION GUARD (v2.1): a manual/external paper-account BALANCE RESET
      // removes positions with no sale and no proceeds — which on 2026-06-25/26 cratered
      // the mirror's NAV and false-tripped the drawdown kill switch. A genuine close always
      // leaves a SELL trade, so if 2+ positions vanish in one tick with NO recent SELL to
      // explain them, treat it as a suspected reset / bad read: FREEZE them (don't delete),
      // and let the runner alert a human instead of auto-cratering NAV. Explained closes
      // (a real sell on record) still mirror normally.
      const missing = dbPositions.filter((dp) => !brokerBy.has(dp.symbol));
      const sellSince = new Date(Date.now() - 48 * 60 * 60_000);
      const recentSells = await prisma.trade.findMany({ where: { side: "SELL", at: { gte: sellSince } }, select: { symbol: true } });
      const sold = new Set(recentSells.map((t) => t.symbol));
      const unexplained = missing.filter((dp) => !sold.has(dp.symbol));
      if (unexplained.length >= 2) {
        frozen = unexplained.map((dp) => dp.symbol);
        for (const dp of missing) {
          if (sold.has(dp.symbol)) { await prisma.position.delete({ where: { symbol: dp.symbol } }).catch(() => {}); drift++; }
        }
        await prisma.journalEntry.create({
          data: {
            kind: "SYSTEM",
            title: `[CRITICAL] Suspected external account reset — froze ${frozen.length} position(s)`,
            body: `IBKR reported ${frozen.join(", ")} gone with NO sell on record. NOT deleting them from the mirror: a balance reset removes shares with no proceeds and would false-crater NAV → a phantom drawdown halt (the 2026-06-25/26 incident). A human should verify the account, then re-anchor + force a reconcile. Frozen until reviewed.`,
          },
        });
      } else {
        for (const dp of missing) {
          await prisma.position.delete({ where: { symbol: dp.symbol } }).catch(() => {});
          drift++;
        }
      }
    }

    // ---- Cash mirror, settlement-aware (the post-buy NAV-dip fix) -------------
    // A BUY debits cash the instant it fills, but IBKR's positions ledger grows the
    // new shares a few seconds later. Mirroring that lower cash while the shares are
    // still absent prints a phantom "cash-out / no-stock-in" dip on the NAV tape —
    // and the same false NAV can trip the daily-loss pause. (Web + mobile both render
    // the same NavSnapshots, so this one server-side fix covers both.) So if a freshly
    // filled BUY hasn't yet shown up as position growth in the broker read, DEFER the
    // cash write this tick: cash + shares then land together next tick and NAV stays
    // continuous. Self-healing — a BUY older than CASH_SETTLE_LAG_MS falls through, so
    // a genuinely settled debit is never frozen, and a sell's cash CREDIT (broker cash
    // ≥ ours) is never deferred.
    let cashDeferred = false;
    if (cash.cadCents !== null) {
      const since = new Date(Date.now() - CASH_SETTLE_LAG_MS);
      // reconcile() only runs on the ibkr broker, so every recent trade here is IBKR.
      const recentBuys = await prisma.trade.findMany({ where: { side: "BUY", at: { gte: since } }, select: { symbol: true } });
      // A debit "landed ahead of its shares" if EITHER cash bucket dropped below our
      // mirror. We check BOTH buckets rather than the buy's own currency because a
      // not-yet-landed buy has NO way to tell us its currency — its Position row
      // doesn't exist yet (so brokerBy/dbBy miss) and Trade carries no currency. The
      // old code defaulted that unknown currency to "CAD", so a USD buy (e.g. TSM)
      // compared the untouched CAD bucket, never deferred, and printed the phantom
      // dip this guard exists to prevent (2026-06-25 TSM, the bug this re-fixes).
      const cadDropped = cash.cadCents < (account?.cashCents ?? 0);
      const usdDropped = cash.usdCents < (account?.usdCashCents ?? 0);
      for (const { symbol } of recentBuys) {
        const brokerQty = brokerBy.get(symbol)?.qty ?? 0;
        const dbQty = dbBy.get(symbol)?.qty ?? 0;
        if (brokerQty > dbQty) continue; // broker grew the position → the buy has landed
        if (cadDropped || usdDropped) { cashDeferred = true; break; } // debit landed ahead of the shares
      }
      if (cashDeferred) {
        console.log("[reconcile] deferring cash mirror — a filled BUY hasn't settled into the positions ledger yet (avoids a phantom NAV dip)");
      } else {
        await prisma.account.update({ where: { id: 1 }, data: { cashCents: cash.cadCents, usdCashCents: cash.usdCents } }).catch(() => {});
      }
    }

    if (drift > 0) {
      const cashNote = cashDeferred
        ? "cash mirror deferred (a fill is still settling)"
        : cash.cadCents !== null
          ? `cash $${(cash.cadCents / 100).toFixed(2)} CAD${cash.usdCents ? ` + $${(cash.usdCents / 100).toFixed(2)} USD` : ""}`
          : "cash unknown";
      await prisma.journalEntry.create({
        data: {
          kind: "SYSTEM", title: `Reconciled ${drift} position(s) from IBKR`,
          body: `Mirrored broker truth: ${brokerPositions?.length ?? 0} live position(s), ${cashNote}.`,
        },
      });
    }
    return frozen;
  }

  /** No-op for IBKR: resting limits live at the broker (GTC), not our sweeper. */
  async sweepPendingOrders(): Promise<number> {
    return 0;
  }

  // ---- FX conversion (CAD↔USD via IDEALPRO) --------------------------------
  // Proven against the live paper gateway 2026-06-23: the order SHAPE is correct
  // (IBKR previewed "BUY <qty> USD.CAD Forex" — quantity in base USD, side BUY/SELL,
  // MKT). We size the USD leg, place the order on the USD.CAD pair (conid from
  // currency/pairs), clear the reply cascade, then reconcile and report the REALIZED
  // rate/fee from the broker ledger delta (broker truth — not our estimate).
  // ⚠️ REQUIRES the account to have **Forex trading permission** — without it IBKR
  // rejects with "No Trading Permission, Regulatory Restriction" (same class as the
  // stock-perms activation, D33). We surface that error verbatim; nothing converts.
  // Money-moving: only the member-approved FX path (lib/fx-requests.ts) calls this.

  /** Resolve the USD.CAD IDEALPRO conid via the canonical currency-pairs endpoint
   *  (cached). NB: `secdef/search?symbol=USD&secType=CASH` returns pairs in an arbitrary
   *  order and a blind `hits[0]` grabbed **USD.BGN** (Bulgarian lev) → a regulatory
   *  reject (2026-06-23). We now match `ccyPair === "CAD"` exactly and NEVER fall back to
   *  a wrong pair — a missing pair returns null → a clean error, not a stray conversion. */
  private async fxConid(): Promise<number | null> {
    if (this.fxConidCache) return this.fxConidCache;
    try {
      const res = await cp<{ USD?: { symbol?: string; conid?: number; ccyPair?: string }[] }>(`/iserver/currency/pairs?currency=USD`);
      const pair = (res?.USD ?? []).find((p) => (p.ccyPair ?? "").toUpperCase() === "CAD" && (p.symbol ?? "").toUpperCase() === "USD.CAD");
      const conid = pair?.conid == null ? null : Number(pair.conid);
      if (conid && Number.isFinite(conid)) {
        this.fxConidCache = conid;
        return conid;
      }
      return null;
    } catch {
      return null;
    }
  }

  async convertCurrency(input: FxConvertInput): Promise<FxConvertResult> {
    const { fromCurrency, toCurrency, amountToCents } = input;
    if (fromCurrency === toCurrency) return { ok: false, error: "From and to currencies are the same." };
    if ((fromCurrency !== "CAD" && fromCurrency !== "USD") || (toCurrency !== "CAD" && toCurrency !== "USD"))
      return { ok: false, error: "Only CAD↔USD is supported." };
    if (!ACCOUNT_ID) return { ok: false, error: "IBKR_ACCOUNT_ID not configured." };
    if (!Number.isInteger(amountToCents) || amountToCents <= 0) return { ok: false, error: "Amount must be a positive whole number of cents." };
    const settings = await prisma.settings.findUnique({ where: { id: 1 } });
    if (settings?.killSwitch) return { ok: false, error: "Kill switch is engaged — no conversions while halted." };

    const rate = await usdCadRate(); // USD→CAD, to size the USD leg + estimate
    if (!rate || rate <= 0) return { ok: false, error: "No USD/CAD rate available — refusing to convert blind." };
    const conid = await this.fxConid();
    if (!conid) return { ok: false, error: "Could not resolve the USD.CAD (IDEALPRO) contract — VERIFY-LIVE." };

    // Pair is USD.CAD (base USD): acquire USD → BUY; acquire CAD → SELL. Quantity is
    // always in the BASE currency (USD).
    const side: "BUY" | "SELL" = toCurrency === "USD" ? "BUY" : "SELL";
    const usdQty = toCurrency === "USD" ? amountToCents / 100 : amountToCents / 100 / rate;

    const before = await this.getCashByCurrency();
    try {
      const order = { conid, orderType: "MKT", side, quantity: Number(usdQty.toFixed(2)), tif: "DAY" };
      let resp = await cp<unknown>(`/iserver/account/${ACCOUNT_ID}/orders`, "POST", { orders: [order] });
      let orderId: string | undefined;
      for (let i = 0; i < 6; i++) {
        if (resp && typeof resp === "object" && !Array.isArray(resp) && (resp as { error?: string }).error) {
          return { ok: false, error: `IBKR: ${(resp as { error: string }).error}` };
        }
        const first = Array.isArray(resp) ? (resp[0] as OrderReply) : undefined;
        if (!first) break;
        if (first.error) return { ok: false, error: `IBKR rejected: ${first.error}` };
        orderId = first.order_id ?? first.orderId;
        if (orderId) break;
        if (first.id) {
          resp = await cp<unknown>(`/iserver/reply/${first.id}`, "POST", { confirmed: true });
          continue;
        }
        break;
      }
      if (!orderId) return { ok: false, error: "IBKR accepted no order id for the FX conversion (reply cascade unresolved) — VERIFY-LIVE." };

      for (let i = 0; i < 6; i++) {
        await sleep(1500);
        const st = await cp<OrderStatus>(`/iserver/account/order/status/${orderId}`).catch(() => ({}) as OrderStatus);
        const status = (st.order_status ?? "").toLowerCase();
        if (status === "filled") break;
        if (status === "cancelled" || status === "rejected") return { ok: false, error: `IBKR FX order ${orderId} ${status}.` };
      }
      await this.reconcile().catch(() => {});
      const after = await this.getCashByCurrency();

      // Realized deltas from broker truth (the FX commission is folded into the ledger).
      const usdDelta = after.usdCents - before.usdCents;
      const cadDelta = (after.cadCents ?? 0) - (before.cadCents ?? 0);
      const toCreditedCents = toCurrency === "USD" ? usdDelta : cadDelta;
      const fromDebitedCents = fromCurrency === "USD" ? -usdDelta : -cadDelta;
      const realized = usdDelta !== 0 && cadDelta !== 0 ? Math.abs(cadDelta / usdDelta) : rate;
      return {
        ok: true,
        rate: realized || rate,
        fromDebitedCents: Math.max(0, Math.round(fromDebitedCents)),
        toCreditedCents: Math.max(0, Math.round(toCreditedCents)),
        commissionCents: 0,
      };
    } catch (e) {
      return { ok: false, error: `IBKR FX error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
