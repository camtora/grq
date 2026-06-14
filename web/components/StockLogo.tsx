"use client";

import { useState } from "react";
import StockAvatar from "./StockAvatar";

// A company logo with an automatic monogram fallback. logoUrl is resolved
// server-side (lib/logos.ts) and cached; if it's missing or the image fails to
// load, we fall back to the deterministic colored monogram so a hole never shows.
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
  if (!logoUrl || failed) return <StockAvatar symbol={symbol} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt={symbol}
      onError={() => setFailed(true)}
      className={`shrink-0 rounded-full border border-teal-400/10 bg-white object-contain p-0.5 ${className}`}
    />
  );
}
