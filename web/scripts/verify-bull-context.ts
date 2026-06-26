// Quick check that a bull's prompt now offers the full RESEARCHED library (tracked universe) with
// GRQ's dossier call per name — not just the tradeable subset. No model call. Run host-side.
import { buildBullContext } from "../agent/race/context";

async function main() {
  const ctx = await buildBullContext({ id: 999999, model: "claude-opus-4-8", dial: "BALANCED", persona: null, label: "Test", cashCents: 2_500_000 }, 2_500_000);
  const lines = ctx.split("\n");
  const start = lines.findIndex((l) => l.includes("researched library"));
  const uni = lines.slice(start + 1).filter((l) => /^ {2}\S+ — /.test(l));
  const withCall = uni.filter((l) => l.includes("GRQ:"));
  const usNames = uni.filter((l) => / USD /.test(l));
  console.log(`names offered: ${uni.length}`);
  console.log(`with a GRQ dossier call: ${withCall.length}`);
  console.log(`US names: ${usNames.length}`);
  console.log("sample:\n" + uni.slice(0, 6).join("\n"));
  console.log("US sample:\n" + usNames.slice(0, 4).join("\n"));
  process.exit(uni.length > 21 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
