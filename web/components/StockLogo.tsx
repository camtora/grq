"use client";

import { useEffect, useRef, useState } from "react";
import StockAvatar from "./StockAvatar";

// A company logo with an automatic monogram fallback. logoUrl is resolved
// server-side (lib/logos.ts) and cached; if it's missing or the image fails to
// load, we fall back to the deterministic colored monogram so a hole never shows.
//
// WHITE-LOGO HANDLING (Cam 2026-07-04): many FMP logos are white glyphs on
// transparency (NKE, ANET, MRVL, BA, DIS, RCL…) — invisible on the default white
// chip. FMP serves `access-control-allow-origin: *`, so for FMP-hosted logos we
// load with CORS and measure the mark's luminance once on a tiny offscreen canvas;
// predominantly-light logos flip to a dark chip. Non-FMP hosts (the DuckDuckGo
// favicons) load WITHOUT crossOrigin — forcing it would break hosts that don't
// send the header — and keep the white chip (favicons are colored rasters).

// Per-URL verdicts so each logo is analyzed once per session, not once per row.
const LIGHT_LOGO_CACHE = new Map<string, boolean>();

const isFmp = (url: string) => url.includes("financialmodelingprep.com");

function measureIsLight(img: HTMLImageElement): boolean {
  const N = 16; // a 16×16 sample is plenty for a mean-luminance read
  const canvas = document.createElement("canvas");
  canvas.width = N;
  canvas.height = N;
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  ctx.drawImage(img, 0, 0, N, N);
  const d = ctx.getImageData(0, 0, N, N).data; // throws on a tainted canvas — caller catches
  let sum = 0;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 40) continue; // ignore (near-)transparent pixels — the mark is what matters
    sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    n++;
  }
  return n > 0 && sum / n / 255 > 0.82;
}

export default function StockLogo({
  symbol,
  logoUrl,
  className = "h-8 w-8 text-[11px]",
}: {
  symbol: string;
  logoUrl?: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [light, setLight] = useState<boolean>(() => (logoUrl ? (LIGHT_LOGO_CACHE.get(logoUrl) ?? false) : false));
  const imgRef = useRef<HTMLImageElement | null>(null);

  const analyzable = !!logoUrl && isFmp(logoUrl);

  const analyze = (img: HTMLImageElement) => {
    if (!analyzable || !logoUrl) return;
    const cached = LIGHT_LOGO_CACHE.get(logoUrl);
    if (cached !== undefined) {
      setLight(cached);
      return;
    }
    let isLight = false;
    try {
      isLight = measureIsLight(img);
    } catch {
      /* tainted canvas / read blocked → keep the white chip */
    }
    LIGHT_LOGO_CACHE.set(logoUrl, isLight);
    setLight(isLight);
  };

  // A server-rendered <img> can finish loading (or breaking) BEFORE React attaches
  // onLoad/onError (hydration), so the handlers alone silently skip most page-load
  // images — reconcile from the element's actual state here. onLoad/onError cover
  // anything that finishes after hydration.
  useEffect(() => {
    const img = imgRef.current;
    if (!img || !img.complete) return;
    if (img.naturalWidth > 0) analyze(img);
    else setFailed(true); // already broken pre-hydration → monogram, not a hole
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logoUrl, failed]);

  if (!logoUrl || failed) return <StockAvatar symbol={symbol} className={className} />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={logoUrl}
      alt={symbol}
      crossOrigin={analyzable ? "anonymous" : undefined}
      onLoad={(e) => analyze(e.currentTarget)}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full border border-teal-400/10 object-contain p-0.5 ${
        light ? "bg-zinc-800" : "bg-white"
      } ${className}`}
    />
  );
}
