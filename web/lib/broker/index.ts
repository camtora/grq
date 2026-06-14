import type { BrokerAdapter } from "./types";
import { SimBroker } from "./sim";
import { IBKRBroker } from "./ibkr";

// BROKER=sim → ibkr-paper (Phase 3) → ibkr-live (Phase 4)
export function getBroker(): BrokerAdapter {
  const kind = process.env.BROKER ?? "sim";
  if (kind === "sim") return new SimBroker();
  if (kind === "ibkr-paper" || kind === "ibkr-live") return new IBKRBroker();
  throw new Error(`BROKER=${kind} is not a known broker.`);
}
