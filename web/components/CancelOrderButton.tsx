"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Cancel a resting order from the app (2026-09-23). Before this, a stale GTC limit could
// only be killed by logging into IBKR directly. Members only — the route enforces it; this
// is the convenience, not the lock.

export default function CancelOrderButton({
  orderId,
  label,
}: {
  orderId: number;
  label: string; // e.g. "BUY 6 TD @ $165.00" — so the confirm names what's being killed
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function cancel() {
    if (!window.confirm(`Cancel the resting ${label}?\n\nIt stops working at the broker immediately. The agent can place a new one if it still likes the idea.`)) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/orders/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "Cancel failed.");
      else router.refresh();
    } catch {
      setError("Cancel failed — network.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        disabled={busy}
        onClick={cancel}
        title="Cancel this resting order at the broker"
        className="rounded-lg border border-red-400/20 px-2.5 py-1 text-xs text-red-300/60 hover:bg-red-400/10 disabled:opacity-40"
      >
        {busy ? "Cancelling…" : "Cancel"}
      </button>
      {error && <span className="text-xs text-red-300/70">{error}</span>}
    </span>
  );
}
