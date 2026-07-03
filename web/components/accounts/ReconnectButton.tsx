"use client";

import { useState } from "react";

/** One-tap fix for a broken SnapTrade link: opens the Connection Portal straight
 *  into the re-auth flow for THIS connection (reconnect=<authorizationId>). Only
 *  rendered on the member's OWN broken account — the other member sees the chip. */
export default function ReconnectButton({ authorizationId }: { authorizationId: string }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reconnect() {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch("/api/external/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reconnect: authorizationId }),
      });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error ?? "Couldn't start the reconnect.");
      window.location.href = data.url; // SnapTrade Connection Portal (read-only)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start the reconnect.");
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={reconnect}
        disabled={busy}
        className="rounded-lg border border-red-400/40 bg-red-400/10 px-2.5 py-1 text-xs font-semibold text-red-200 transition hover:bg-red-400/20 disabled:opacity-40"
      >
        {busy ? "Opening…" : "⚡ Reconnect"}
      </button>
      {err ? <span className="text-xs text-red-300/80">{err}</span> : null}
    </span>
  );
}
