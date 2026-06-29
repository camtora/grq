"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

const FIELD =
  "w-full rounded-lg border border-[color:var(--card-border)] bg-[var(--field-bg)] px-3 py-1.5 text-sm text-teal-50 placeholder:text-teal-200/30 focus:border-teal-400/50 focus:outline-none";

/** Self-serve SnapTrade connect: a member pastes their own Personal-key Client ID +
 *  Consumer Key and we connect + pull their accounts — no human in the loop. */
export default function ConnectKeysForm() {
  const router = useRouter();
  const [clientId, setClientId] = useState("");
  const [consumerKey, setConsumerKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const r = await fetch("/api/external/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientId, consumerKey }),
      });
      const data = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!r.ok || !data.ok) throw new Error(data.error ?? "Couldn't connect those keys.");
      router.refresh(); // configured now → holdings render
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't connect those keys.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 max-w-xl space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          Client ID
          <input
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="PERS-…"
            autoComplete="off"
            spellCheck={false}
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-wider text-teal-200/40">
          Consumer Key
          <input
            value={consumerKey}
            onChange={(e) => setConsumerKey(e.target.value)}
            placeholder="your consumer key"
            autoComplete="off"
            spellCheck={false}
            type="password"
            className={FIELD}
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={busy || !clientId.trim() || !consumerKey.trim()}>
          {busy ? "Connecting…" : "Connect"}
        </Button>
        {err ? <span className="text-xs text-red-300/80">{err}</span> : null}
      </div>
      <p className="text-[11px] text-teal-200/40">
        Stored privately and used read-only — GRQ can never trade these accounts. You can
        Unlink anytime to wipe the keys and data.
      </p>
    </form>
  );
}
