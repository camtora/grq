/**
 * Verifies the mobile feed builders (lib/feed.ts) produce output that validates
 * against the shared API contract (shared/contract.ts), reading the real DB.
 * Run: source ~/.nvm/nvm.sh && cd web && npx tsx scripts/verify-mobile-api.ts
 */
import {
  MeResponse,
  Portfolio,
  FundSettings,
  MarketResponse,
  Idea,
  Today,
  Dossier,
} from "../../shared/contract";
import { z } from "zod";
import {
  meResponse,
  portfolioResponse,
  settingsResponse,
  marketResponse,
  ideasResponse,
  todayResponse,
  dossierResponse,
} from "../lib/feed";
import type { Session } from "../lib/session";

const camSession: Session = {
  email: "cameron.tora@gmail.com",
  user: { name: "Cam", role: "admin", theme: "light" },
  role: "member",
};

let failures = 0;
async function check(name: string, schema: z.ZodTypeAny, produce: () => Promise<unknown>) {
  try {
    const data = await produce();
    const res = schema.safeParse(data);
    if (res.success) {
      const summary = Array.isArray(data) ? `${data.length} items` : Object.keys(data as object).slice(0, 4).join(", ") + "…";
      console.log(`✅ ${name.padEnd(22)} ${summary}`);
    } else {
      failures++;
      console.log(`❌ ${name.padEnd(22)} contract mismatch:`);
      console.log(res.error.issues.map((i) => `     · ${i.path.join(".")}: ${i.message}`).join("\n"));
    }
  } catch (e) {
    failures++;
    console.log(`❌ ${name.padEnd(22)} threw: ${(e as Error).message}`);
  }
}

async function main() {
  await check("GET /auth/me", MeResponse, () => meResponse(camSession));
  await check("GET /portfolio", Portfolio, () => portfolioResponse());
  await check("GET /settings", FundSettings, () => settingsResponse());
  await check("GET /market", MarketResponse, () => marketResponse());
  await check("GET /ideas", z.array(Idea), () => ideasResponse());
  await check("GET /today", Today, () => todayResponse());

  // Dossier: pick a real tracked symbol so the 404 path isn't what we test.
  const mkt = MarketResponse.parse(await marketResponse());
  const sym = mkt.universe[0]?.symbol ?? mkt.watchlist[0]?.symbol;
  if (sym) await check(`GET /dossier/${sym}`, Dossier, () => dossierResponse(sym));
  else console.log("⚠️  no tracked symbol to test /dossier");

  console.log(failures === 0 ? "\nAll mobile endpoints match the contract." : `\n${failures} endpoint(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main();
