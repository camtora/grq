import https from "node:https";
import { prisma } from "../db";
import { getQuote as yahooQuote, getQuotes as yahooQuotes } from "./quotes";
import { activeSymbols } from "../universe";
import { ibkrFixedCommissionCents, writeNavSnapshot } from "./sim";
import type { BrokerAdapter, PlaceOrderInput, PlaceOrderResult, Quote } from "./types";

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
type OrderStatus = { order_status?: string; avgPrice?: string; avg_price?: string; filledQuantity?: number; commission?: number; total_size?: number };
type IbkrPosition = { conid?: number; position?: number; avgCost?: number; avgPrice?: number; contractDesc?: string };
type Ledger = Record<string, { cashbalance?: number; settledcash?: number; currency?: string }>;

export class IBKRBroker implements BrokerAdapter {
  readonly kind = "ibkr";
  private conidBySymbol = new Map<string, number>();
  private symbolByConid = new Map<number, string>();

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

  /** symbol → IBKR conid for the Canadian (CAD) listing. We trade TSX/CAD only
   *  in Phase 3, so prefer the Toronto listing among the search hits. */
  async conidFor(symbol: string): Promise<number | null> {
    const sym = symbol.toUpperCase();
    const cached = this.conidBySymbol.get(sym);
    if (cached) return cached;
    try {
      // Search by the bare ticker (strip the .TO/.V Yahoo suffix).
      const bare = sym.replace(/\.(TO|V|NE|CN)$/i, "");
      const hits = await cp<SecdefHit[]>(`/iserver/secdef/search?symbol=${encodeURIComponent(bare)}&secType=STK`);
      if (!Array.isArray(hits) || hits.length === 0) return null;
      // VERIFY-LIVE: prefer the hit whose section/description is the Toronto
      // (TSE/TSX) listing; fall back to the first hit. The search result's
      // `description` is usually the primary exchange code.
      const isToronto = (h: SecdefHit) =>
        /TSE|TSX|TORONTO|VENTURE/i.test(h.description ?? "") ||
        (h.sections ?? []).some((s) => /TSE|TSX|VENTURE/i.test(s.exchange ?? ""));
      const pick = hits.find(isToronto) ?? hits[0];
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
          const avg = parseFloat(st.avgPrice ?? st.avg_price ?? "0");
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
      await this.reconcile().catch(() => {});
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

  /** Reconcile PENDING ibkr orders against broker truth. An order whose fill landed
   *  AFTER the synchronous poll window (placeOrder returned PENDING) is finalised
   *  here — Trade + journal written, Order flipped to FILLED — so the trade ledger is
   *  never silently incomplete. Cancelled/rejected orders are closed out. Returns the
   *  count finalised to a fill; the runner reconciles positions/cash after. Called on
   *  the tick BEFORE reconcile so a sell's realized P&L reads the pre-fill ACB. */
  async finalizePending(): Promise<number> {
    const pending = await prisma.order.findMany({ where: { status: "PENDING", broker: "ibkr" } });
    let filled = 0;
    for (const o of pending) {
      if (!o.brokerOrderId) continue; // no broker id (legacy row) — can't track; backfilled manually
      const st = await cp<OrderStatus>(`/iserver/account/order/status/${o.brokerOrderId}`).catch(() => ({}) as OrderStatus);
      const status = (st.order_status ?? "").toLowerCase();
      if (status === "filled") {
        const avg = parseFloat(st.avgPrice ?? st.avg_price ?? "0");
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
        filled++;
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
  async getPositions(): Promise<{ symbol: string; qty: number; avgCostCents: number }[]> {
    const raw = await cp<IbkrPosition[]>(`/portfolio/${ACCOUNT_ID}/positions/0`).catch(() => [] as IbkrPosition[]);
    const out: { symbol: string; qty: number; avgCostCents: number }[] = [];
    for (const p of raw) {
      const cid = p.conid == null ? null : Number(p.conid);
      if (!cid || !p.position) continue;
      const symbol = this.symbolByConid.get(cid);
      if (!symbol) continue; // not one of ours — skip (VERIFY-LIVE: warm the cache for all holdings)
      const avg = p.avgCost ?? p.avgPrice ?? 0;
      out.push({ symbol, qty: Math.round(p.position), avgCostCents: Math.round(avg * 100) });
    }
    return out;
  }

  /** CAD cash balance from the account ledger. */
  async getCashCents(): Promise<number | null> {
    const ledger = await cp<Ledger>(`/portfolio/${ACCOUNT_ID}/ledger`).catch(() => null);
    if (!ledger) return null;
    const cad = ledger["CAD"] ?? ledger["BASE"];
    if (cad?.cashbalance === undefined) return null;
    return Math.round((cad.settledcash ?? cad.cashbalance) * 100);
  }

  /** Mirror IBKR positions + cash into our DB so the dashboards, NAV snapshots
   *  and realized-P&L math read broker truth. Called by the runner each tick and
   *  right after a fill. Writes a SYSTEM journal note when it corrects drift. */
  async reconcile(): Promise<void> {
    // Warm the conid→symbol map for the active universe so holdings resolve.
    if (this.symbolByConid.size === 0) {
      for (const s of await activeSymbols()) await this.conidFor(s).catch(() => null);
    }
    const [brokerPositions, cashCents] = await Promise.all([this.getPositions(), this.getCashCents()]);

    const dbPositions = await prisma.position.findMany();
    const dbBy = new Map(dbPositions.map((p) => [p.symbol, p]));
    const brokerBy = new Map(brokerPositions.map((p) => [p.symbol, p]));
    let drift = 0;

    for (const bp of brokerPositions) {
      const cur = dbBy.get(bp.symbol);
      if (!cur || cur.qty !== bp.qty || cur.avgCostCents !== bp.avgCostCents) {
        await prisma.position.upsert({
          where: { symbol: bp.symbol },
          create: { symbol: bp.symbol, qty: bp.qty, avgCostCents: bp.avgCostCents },
          update: { qty: bp.qty, avgCostCents: bp.avgCostCents },
        });
        drift++;
      }
    }
    // Positions IBKR no longer reports → closed; drop them.
    for (const dp of dbPositions) {
      if (!brokerBy.has(dp.symbol)) {
        await prisma.position.delete({ where: { symbol: dp.symbol } }).catch(() => {});
        drift++;
      }
    }
    if (cashCents !== null) {
      await prisma.account.update({ where: { id: 1 }, data: { cashCents } }).catch(() => {});
    }
    if (drift > 0) {
      await prisma.journalEntry.create({
        data: {
          kind: "SYSTEM", title: `Reconciled ${drift} position(s) from IBKR`,
          body: `Mirrored broker truth: ${brokerPositions.length} live position(s), cash ${cashCents !== null ? `$${(cashCents / 100).toFixed(2)}` : "unknown"}.`,
        },
      });
    }
  }

  /** No-op for IBKR: resting limits live at the broker (GTC), not our sweeper. */
  async sweepPendingOrders(): Promise<number> {
    return 0;
  }
}
