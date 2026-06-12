import type { BrokerAdapter } from "./types";
import { SimBroker } from "./sim";

// BROKER=sim → ibkr-paper (Phase 3) → ibkr-live (Phase 4)
export function getBroker(): BrokerAdapter {
  const kind = process.env.BROKER ?? "sim";
  if (kind === "sim") return new SimBroker();
  throw new Error(`BROKER=${kind} is not implemented yet (sim only until Phase 3).`);
}
