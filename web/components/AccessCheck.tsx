"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AUTO_CHECKS, MANUAL_CHECKS, autoOk, emptyData, type AccessCheckData } from "@/lib/access-check";

// The access check a person runs on themselves (D135). The automatic half fires on load: this
// browser requests each path with its own session and records the status. The manual half is
// nine things only eyes can confirm. Everything saves to GRQ as it happens (POST
// /api/access-check, the caller's own row) — there is nothing to copy or send.

type SaveState = "idle" | "saving" | "saved" | "error";

export default function AccessCheck({ email, role }: { email: string; role: string }) {
  const [data, setData] = useState<AccessCheckData>(emptyData());
  const [running, setRunning] = useState(false);
  const [save, setSave] = useState<SaveState>("idle");
  const [doneAt, setDoneAt] = useState<string | null>(null);
  const latest = useRef<AccessCheckData>(data);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const started = useRef(false);

  const persist = useCallback(async (d: AccessCheckData, done = false) => {
    setSave("saving");
    try {
      const r = await fetch("/api/access-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ data: d, done }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      if (j.doneAt) setDoneAt(j.doneAt);
      setSave("saved");
    } catch {
      setSave("error");
    }
  }, []);

  const update = useCallback(
    (fn: (d: AccessCheckData) => AccessCheckData, delayMs = 300) => {
      const next = fn(latest.current);
      latest.current = next;
      setData(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => persist(latest.current), delayMs);
    },
    [persist],
  );

  const runAuto = useCallback(async () => {
    setRunning(true);
    const auto: Record<string, number> = {};
    for (const c of AUTO_CHECKS) {
      try {
        const r = await fetch(c.path, { cache: "no-store", headers: { accept: "text/html,application/json" } });
        auto[c.id] = r.status;
        r.body?.cancel().catch(() => {});
      } catch {
        auto[c.id] = 0;
      }
      const snapshot = { ...auto };
      latest.current = { ...latest.current, auto: { ...latest.current.auto, ...snapshot } };
      setData(latest.current);
    }
    setRunning(false);
    await persist(latest.current);
  }, [persist]);

  // Load what was saved before, then run the automatic half once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      try {
        const r = await fetch("/api/access-check", { cache: "no-store" });
        const j = await r.json();
        if (j?.data) {
          latest.current = j.data as AccessCheckData;
          setData(latest.current);
        }
        if (j?.doneAt) setDoneAt(j.doneAt);
      } catch {
        /* first run, or offline — the checks below still run */
      }
      runAuto();
    })();
  }, [runAuto]);

  const isUser = role === "user";
  const autoDone = AUTO_CHECKS.filter((c) => data.auto[c.id] != null).length;
  const autoWrong = AUTO_CHECKS.filter((c) => autoOk(c, data.auto[c.id]) === false);
  const manualDone = MANUAL_CHECKS.filter((c) => data.manual[c.id]).length;
  const manualFail = MANUAL_CHECKS.filter((c) => data.manual[c.id] === "fail").length;

  const saveLabel =
    save === "saving" ? "Saving…" : save === "saved" ? "Saved" : save === "error" ? "Couldn't save — check your connection" : "";

  return (
    <div className="space-y-7">
      <div className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4 text-sm text-teal-100/80">
        <p>
          Signed in as <span className="font-semibold text-teal-50">{email}</span> · account type{" "}
          <span className="font-semibold text-teal-50">{role}</span>.
        </p>
        {!isUser && (
          <p className="mt-1 text-amber-300/90">
            This check is written for a <span className="font-semibold">user</span> account. Yours is a {role} account, so the
            &ldquo;should be refused&rdquo; rows are expected to open for you.
          </p>
        )}
        <p className="mt-1 text-teal-200/50">Everything on this page saves as you go. There is nothing to copy or send.</p>
      </div>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-200/70">1 · Checked automatically</h2>
          <span className="text-xs tabular-nums text-teal-200/50">
            {running ? `Checking… ${autoDone} of ${AUTO_CHECKS.length}` : `${autoDone - autoWrong.length} of ${AUTO_CHECKS.length} as expected`}
            {!running && isUser && autoWrong.length > 0 && <span className="ml-2 font-semibold text-red-400">{autoWrong.length} not as expected</span>}
          </span>
        </div>
        <p className="mb-3 text-xs text-teal-200/50">
          Your browser just asked GRQ for each of these with your sign-in. You don&apos;t need to do anything here.
        </p>
        <div className="overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)]">
          {AUTO_CHECKS.map((c) => {
            const status = data.auto[c.id];
            const ok = autoOk(c, status);
            return (
              <div key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-teal-400/10 px-4 py-2 text-sm first:border-t-0">
                <span className="w-9 shrink-0 text-xs tabular-nums text-teal-200/40">{c.id}</span>
                <span className="min-w-0 flex-1 text-teal-100/90">
                  {c.label}
                  <span className="ml-2 text-xs text-teal-200/40">
                    {c.kind === "open" ? "should open" : `should be refused${c.leak ? ` — would show ${c.leak}` : ""}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 text-xs font-semibold tabular-nums ${
                    ok == null ? "text-teal-200/40" : ok ? "text-emerald-400" : isUser ? "text-red-400" : "text-amber-300/90"
                  }`}
                >
                  {status == null
                    ? "…"
                    : status === 0
                      ? "no answer"
                      : status === 200
                        ? "opened"
                        : status === 403
                          ? "refused"
                          : `HTTP ${status}`}
                </span>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          onClick={runAuto}
          disabled={running}
          className="mt-2 rounded-lg border border-teal-400/25 px-2.5 py-1 text-xs font-semibold text-teal-300/70 transition-colors hover:bg-teal-400/10 disabled:opacity-40"
        >
          {running ? "Checking…" : "Run again"}
        </button>
      </section>

      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-teal-200/70">2 · Needs your eyes</h2>
          <span className="text-xs tabular-nums text-teal-200/50">
            {manualDone} of {MANUAL_CHECKS.length} answered
            {manualFail > 0 && <span className="ml-2 font-semibold text-red-400">{manualFail} fail</span>}
          </span>
        </div>
        <p className="mb-3 text-xs text-teal-200/50">
          Each of these is something that should <span className="font-semibold">not</span> be on the page. Open the page, look, then
          press <span className="font-semibold">Not there</span> if it&apos;s missing (good) or <span className="font-semibold">I see it</span>{" "}
          if it&apos;s there.
        </p>
        <div className="overflow-hidden rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)]">
          {MANUAL_CHECKS.map((c) => {
            const v = data.manual[c.id];
            return (
              <div
                key={c.id}
                className={`border-t border-teal-400/10 px-4 py-3 text-sm first:border-t-0 ${
                  v === "pass" ? "bg-emerald-400/[0.06]" : v === "fail" ? "bg-red-400/[0.08]" : ""
                }`}
              >
                <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
                  <span className="w-9 shrink-0 pt-0.5 text-xs tabular-nums text-teal-200/40">{c.id}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-teal-50">
                      {c.path ? (
                        <a href={c.path} target="_blank" rel="noopener" className="text-teal-300 hover:underline">
                          {c.where}
                        </a>
                      ) : (
                        c.where
                      )}
                    </div>
                    <div className="text-teal-200/60">{c.check}</div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    {(
                      [
                        ["pass", "Not there"],
                        ["fail", "I see it"],
                      ] as const
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        aria-pressed={v === val}
                        onClick={() =>
                          update((d) => {
                            const manual = { ...d.manual };
                            if (manual[c.id] === val) delete manual[c.id];
                            else manual[c.id] = val;
                            return { ...d, manual };
                          })
                        }
                        className={`rounded-lg border px-2.5 py-1 text-xs font-semibold transition-colors ${
                          v === val
                            ? val === "pass"
                              ? "border-emerald-400/50 bg-emerald-400/20 text-emerald-200"
                              : "border-red-400/50 bg-red-400/20 text-red-200"
                            : "border-teal-400/25 text-teal-300/70 hover:bg-teal-400/10"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                {v === "fail" && (
                  <input
                    type="text"
                    defaultValue={data.notes[c.id] ?? ""}
                    placeholder="What did you see?"
                    aria-label={`What you saw for ${c.id}`}
                    onChange={(e) => update((d) => ({ ...d, notes: { ...d.notes, [c.id]: e.target.value } }), 900)}
                    className="mt-2 w-full rounded-lg border border-teal-400/20 bg-teal-400/5 px-2.5 py-1.5 text-sm text-teal-100 placeholder:text-teal-200/40 focus:border-teal-400/40 focus:outline-none sm:ml-12 sm:w-[calc(100%-3rem)]"
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-[color:var(--card-border)] bg-[var(--card-bg)] p-4">
        <label htmlFor="access-check-overall" className="text-sm font-semibold text-teal-50">
          Anything else worth mentioning? <span className="font-normal text-teal-200/50">(optional)</span>
        </label>
        <textarea
          id="access-check-overall"
          defaultValue={data.overall}
          key={data.overall ? "loaded" : "empty"}
          onChange={(e) => update((d) => ({ ...d, overall: e.target.value }), 900)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-teal-400/20 bg-teal-400/5 px-2.5 py-1.5 text-sm text-teal-100 placeholder:text-teal-200/40 focus:border-teal-400/40 focus:outline-none"
          placeholder="Anything that looked odd, even if it passed."
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => persist(latest.current, true)}
            className="rounded-lg border border-teal-400/50 bg-teal-400/15 px-2.5 py-1 text-xs font-semibold text-teal-200 transition-colors hover:bg-teal-400/25"
          >
            I&apos;m done
          </button>
          <span className={`text-xs ${save === "error" ? "text-red-400" : "text-teal-200/50"}`} aria-live="polite">
            {saveLabel}
            {doneAt && save !== "error" ? ` · marked done ${new Date(doneAt).toLocaleString()}` : ""}
          </span>
        </div>
      </section>
    </div>
  );
}
