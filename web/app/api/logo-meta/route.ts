import { NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/session";
import { logoIsLight } from "@/lib/logos";

export const dynamic = "force-dynamic";

// White-logo verdicts for the app (GRQ Go). The web's <StockLogo> measures a
// logo's luminance on a client canvas; React Native has no canvas, so the app
// asks us in batches: GET ?urls=<comma-separated, URL-encoded>. Only FMP-hosted
// logos are measured (the web analyzes only those too — favicons are colored
// rasters that stay on the white chip); anything else answers false. Verdicts
// are process-cached; the app caches them forever in AsyncStorage.
const MAX_URLS = 48;
const CONCURRENCY = 6;

const isFmp = (url: string) => {
  try {
    return new URL(url).hostname.endsWith("financialmodelingprep.com");
  } catch {
    return false;
  }
};

export async function GET(req: Request) {
  const session = sessionFromRequest(req);
  if (!session) return NextResponse.json({ error: "Sign in to view this fund." }, { status: 403 });

  const raw = new URL(req.url).searchParams.get("urls") ?? "";
  const urls = [...new Set(raw.split(",").map((u) => u.trim()).filter(Boolean))].slice(0, MAX_URLS);

  const light: Record<string, boolean> = {};
  for (let i = 0; i < urls.length; i += CONCURRENCY) {
    const batch = urls.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map(async (u) => {
        light[u] = isFmp(u) ? await logoIsLight(u) : false;
      }),
    );
  }
  return NextResponse.json({ light });
}
