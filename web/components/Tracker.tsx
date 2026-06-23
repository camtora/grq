"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Fire-and-forget usage beacon. Mounted once in the root layout; sends the
// current pathname to /api/track whenever it changes (initial load + every
// client-side navigation). We only send the PATH — the server resolves WHO from
// the session cookie, so the client can't spoof identity. navigator.sendBeacon
// survives the page unloading mid-navigation; fetch+keepalive is the fallback.
export default function Tracker() {
  const pathname = usePathname();
  const last = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || pathname === last.current) return;
    last.current = pathname;

    const payload = JSON.stringify({ path: pathname });
    try {
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        navigator.sendBeacon("/api/track", new Blob([payload], { type: "application/json" }));
      } else {
        void fetch("/api/track", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: payload,
          keepalive: true,
        });
      }
    } catch {
      /* analytics must never break the app */
    }
  }, [pathname]);

  return null;
}
