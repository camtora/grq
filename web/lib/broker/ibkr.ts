import { getQuote as yahooQuote, getQuotes as yahooQuotes } from "./quotes";
import { activeSymbols } from "../universe";
import type { BrokerAdapter, PlaceOrderInput, PlaceOrderResult, Quote } from "./types";

// IBKRBroker — Phase 3 paper (then Phase 4 live) behind the same BrokerAdapter
// seam. Order placement, positions and cash go to IBKR via the Client Portal
// Web API (the IBeam-managed gateway); decision QUOTES stay on the delayed Yahoo
// source (same as the sim) — IBKR's job here is real execution + broker truth.
//
// ⚠️ SCAFFOLD (2026-06-14): the endpoint calls below are written against IBKR's
// documented CP Web API, but the order reply/confirm flow, conid selection,
// async fills, and the self-signed-cert handling only shake out against the LIVE
// gateway. The §6 guardrail validator still runs BEFORE placeOrder on the agent
// path exactly as with the sim — swapping the broker never touches the gate.
// Bring-up + the live-wiring task list: docs/IBKR-PHASE3.md.

const GATEWAY = process.env.IBKR_GATEWAY_URL ?? "https://ibeam:5000";
const ACCOUNT_ID = process.env.IBKR_ACCOUNT_ID ?? "";
const BASE = `${GATEWAY}/v1/api`;

// IBeam's gateway serves a self-signed cert; the agent container must be allowed
// to reach it. At wire-up we scope cert-skipping to the gateway via an undici
// dispatcher (NODE_TLS_REJECT_UNAUTHORIZED would be far too broad). TODO(live).
async function cp<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`IBKR ${path} → ${res.status} ${await res.text().catch(() => "")}`);
  return (await res.json()) as T;
}

export class IBKRBroker implements BrokerAdapter {
  readonly kind = "ibkr";
  private conidCache = new Map<string, number>();

  /** Gateway auth/connection status — the orchestrator health-checks this and
   *  alerts (critical) if the session drops while holding positions. */
  async authStatus(): Promise<{ authenticated: boolean; connected: boolean }> {
    try {
      const s = await cp<{ authenticated?: boolean; connected?: boolean }>("/iserver/auth/status", { method: "POST" });
      return { authenticated: !!s.authenticated, connected: !!s.connected };
    } catch {
      return { authenticated: false, connected: false };
    }
  }

  /** Keep the brokerage session alive (call on the tick loop). */
  async tickle(): Promise<void> {
    await cp("/tickle", { method: "POST" }).catch(() => {});
  }

  /** symbol → IBKR conid for the TSX/CAD stock listing. */
  async conidFor(symbol: string): Promise<number | null> {
    const sym = symbol.toUpperCase();
    const cached = this.conidCache.get(sym);
    if (cached) return cached;
    try {
      const hits = await cp<{ conid?: number; description?: string }[]>(
        `/iserver/secdef/search?symbol=${encodeURIComponent(sym)}&secType=STK`,
      );
      // TODO(live): select the TSX/CAD listing among the matches (by exchange/
      // currency) rather than blindly taking the first.
      const conid = hits?.[0]?.conid ?? null;
      if (conid) this.conidCache.set(sym, conid);
      return conid;
    } catch {
      return null;
    }
  }

  // --- decision quotes stay on the delayed Yahoo source (unchanged from sim) ---
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

  /** Submit an order to IBKR. Unlike the sim, the fill is ASYNCHRONOUS — the
   *  orchestrator reconciles fills/positions/cash via the portfolio endpoints +
   *  the Flex importer (docs/IBKR-PHASE3.md). Native stop-loss + take-profit
   *  rest AT IBKR so downside protection survives a dead session. */
  async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
    if (!ACCOUNT_ID) return { ok: false, rejectReason: "IBKR_ACCOUNT_ID not configured." };
    const conid = await this.conidFor(input.symbol);
    if (!conid) return { ok: false, rejectReason: `No IBKR contract found for ${input.symbol.toUpperCase()}.` };
    try {
      const body = {
        orders: [
          {
            conid,
            orderType: input.type === "LIMIT" ? "LMT" : "MKT",
            side: input.side,
            quantity: input.qty,
            tif: "DAY",
            ...(input.type === "LIMIT" && input.limitPriceCents ? { price: input.limitPriceCents / 100 } : {}),
          },
        ],
      };
      const resp = await cp<unknown>(`/iserver/account/${ACCOUNT_ID}/orders`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      // TODO(live): IBKR returns "reply" messages (warnings) that must be
      // confirmed via POST /iserver/reply/{id} {confirmed:true}; then read the
      // resulting orderId + status and map it to PlaceOrderResult.
      void resp;
      return {
        ok: false,
        rejectReason: "IBKR order path scaffolded — submission + reply flow needs live-gateway wiring (docs/IBKR-PHASE3.md).",
      };
    } catch (e) {
      return { ok: false, rejectReason: `IBKR order error: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
}
