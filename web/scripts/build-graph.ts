// Manual populate for the knowledge-graph edge table (docs/KNOWLEDGE-GRAPH.md, Slice 2).
// Until the nightly runner hook lands (agent-coupled deploy), run this by hand:
//   cd web && npx tsx scripts/build-graph.ts            # DB-only edges (no FMP)
//   cd web && npx tsx scripts/build-graph.ts --peers    # include FMP peer edges
//   cd web && npx tsx scripts/build-graph.ts --limit=5  # first N nodes (testing)
import { runGraphScan } from "../lib/graph/edges";

const withPeers = process.argv.includes("--peers");
const limitArg = process.argv.find((a) => a.startsWith("--limit="));
const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : undefined;

(async () => {
  const t = Date.now();
  const r = await runGraphScan({ withPeers, limit });
  console.log(`graph scan: ${r.nodes} nodes → ${r.edges} edges in ${((Date.now() - t) / 1000).toFixed(1)}s (peers=${withPeers})`);
  process.exit(0);
})();
