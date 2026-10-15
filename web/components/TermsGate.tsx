"use client";

import { useEffect, useState } from "react";

// The button (D136). One click writes the caller's acceptance row and sets the cookie, then the
// browser does a FULL navigation to `next` so the new cookie rides the next request through the
// door. `alreadyAccepted` = the row exists but this device has no cookie (a new phone, a cleared
// browser): no button, just re-issue the cookie and go.

export default function TermsGate({ next, alreadyAccepted }: { next: string; alreadyAccepted: boolean }) {
  const [state, setState] = useState<"idle" | "saving" | "error">(alreadyAccepted ? "saving" : "idle");

  async function accept() {
    setState("saving");
    try {
      const r = await fetch("/api/terms/accept", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      window.location.assign(next);
    } catch {
      setState("error");
    }
  }

  useEffect(() => {
    if (alreadyAccepted) void accept();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadyAccepted]);

  if (alreadyAccepted && state !== "error") {
    return <p className="text-sm text-teal-200/60">You agreed to these already. One moment…</p>;
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <button
        type="button"
        onClick={accept}
        disabled={state === "saving"}
        className="rounded-lg border border-teal-400/50 bg-teal-400/15 px-4 py-2 text-sm font-bold uppercase tracking-wider text-teal-100 transition-colors hover:bg-teal-400/25 disabled:opacity-50"
      >
        {state === "saving" ? "One moment…" : "I understand"}
      </button>
      <span className="text-xs text-teal-200/50">
        {state === "error" ? "That didn't save. Try again, or tell Cam." : "By continuing, you agree to these terms."}
      </span>
    </div>
  );
}
