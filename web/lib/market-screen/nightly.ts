import { runMarketScreen } from "./screen";
import { tagBatch } from "./tag";
import { refreshScreenSignals } from "./signals";

// Nightly Market Base Layer refresh (docs/MARKET-BASE-LAYER.md). Re-screens the whole
// market (deterministic, ~free; runMarketScreen PRESERVES existing Tier-1 tags) then
// Haiku-tags any NEW untagged names that appeared, bounded so the nightly Haiku spend
// stays trivial (after the initial full pass only new listings are untagged). Imports
// agent/sessions via tag.ts — runner-only; keep OUT of any web-page bundle.
export async function runMarketScreenNightly(opts?: { tagCap?: number; signalCap?: number }): Promise<{ scanned: number; kept: number; tagged: number; signals: number }> {
  const { scanned, kept } = await runMarketScreen();
  const cap = opts?.tagCap ?? 120; // bound nightly tagging; new names/day are few
  let tagged = 0;
  while (tagged < cap) {
    const r = await tagBatch(40);
    if (r.tagged === 0) break;
    tagged += r.tagged;
  }
  // Technical read for the actionable names — bounded + stale-first (gentle on Yahoo).
  const { updated: signals } = await refreshScreenSignals({ limit: opts?.signalCap ?? 200 }).catch(() => ({ updated: 0 }));
  return { scanned, kept, tagged, signals };
}
