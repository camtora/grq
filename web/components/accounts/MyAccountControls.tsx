"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const BTN =
  "rounded-lg px-2.5 py-1 text-xs font-semibold transition disabled:opacity-40";
const TEAL = `${BTN} border border-teal-400/30 text-teal-200/90 hover:bg-teal-400/10`;
const SOLID = `${BTN} border border-teal-400/50 bg-teal-400/15 text-teal-100 hover:bg-teal-400/25`;
const DANGER = `${BTN} border border-red-400/30 text-red-300/80 hover:bg-red-400/10`;

/** The logged-in member's own controls. With a Personal key the connection lives
 *  in SnapTrade and GRQ just reads, so this auto-syncs on mount (pure backend
 *  read) and only surfaces a "Connect a brokerage" button when nothing's linked
 *  yet (initial connect / reconnect — the one unavoidably-interactive step). */
export default function MyAccountControls({
  configured,
  hasAccounts,
}: {
  configured: boolean;
  hasAccounts: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const justConnected = params.get("connected") === "1";
  const [busy, setBusy] = useState<null | "connect" | "refresh" | "disconnect">(null);
  const [err, setErr] = useState<string | null>(null);
  const synced = useRef(false);

  // Auto-sync once on mount whenever configured — the connection is managed in
  // SnapTrade, so a plain backend read keeps holdings fresh with no click.
  useEffect(() => {
    if (synced.current || !configured) return;
    synced.current = true;
    (async () => {
      try {
        await fetch("/api/external/sync", { method: "POST" });
      } catch {
        /* best-effort; the manual Refresh is the fallback */
      }
      if (justConnected) {
        // Drop the ?connected=1 so a reload doesn't re-trigger.
        router.replace("/accounts");
      } else {
        router.refresh();
      }
    })();
  }, [configured, justConnected, router]);

  async function connect() {
    setErr(null);
    setBusy("connect");
    try {
      const r = await fetch("/api/external/connect", { method: "POST" });
      const data = await r.json();
      if (!r.ok || !data.url) throw new Error(data.error ?? "Couldn't start the connection.");
      window.location.href = data.url; // SnapTrade Connection Portal (read-only)
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't start the connection.");
      setBusy(null);
    }
  }

  async function refresh() {
    setErr(null);
    setBusy("refresh");
    try {
      const r = await fetch("/api/external/sync", { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Refresh failed.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setBusy(null);
    }
  }

  async function disconnect() {
    if (!confirm("Unlink your brokerage and remove its data from GRQ? You can reconnect anytime.")) return;
    setErr(null);
    setBusy("disconnect");
    try {
      const r = await fetch("/api/external/disconnect", { method: "POST" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Disconnect failed.");
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      setBusy(null);
    }
  }

  if (!configured) {
    return (
      <span className="text-xs text-amber-300/70">
        SnapTrade isn&apos;t configured for your account yet.
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" className={TEAL} onClick={refresh} disabled={busy !== null}>
        {busy === "refresh" ? "Refreshing…" : "↻ Refresh"}
      </button>
      {hasAccounts ? (
        <button type="button" className={DANGER} onClick={disconnect} disabled={busy !== null}>
          {busy === "disconnect" ? "Unlinking…" : "Unlink"}
        </button>
      ) : (
        <button type="button" className={SOLID} onClick={connect} disabled={busy !== null}>
          {busy === "connect" ? "Opening…" : "Connect a brokerage"}
        </button>
      )}
      {err ? <span className="text-xs text-red-300/80">{err}</span> : null}
    </div>
  );
}
