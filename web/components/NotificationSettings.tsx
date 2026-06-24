"use client";

import { useState } from "react";
import { TOGGLEABLE_CATEGORIES, ALWAYS_ON, type NotificationPrefs, type ToggleKey } from "@/lib/push/categories";

// Per-user push toggles. Saves each switch immediately (optimistic, reverts on
// error). These gate BOTH iOS push and the web notification bell (same chokepoint,
// lib/push/notify.ts). trades + risk + critical outages are always-on and shown
// read-only.
export default function NotificationSettings({
  initial,
  readOnly = false,
}: {
  initial: NotificationPrefs;
  readOnly?: boolean;
}) {
  const [prefs, setPrefs] = useState<NotificationPrefs>(initial);
  const [saving, setSaving] = useState<ToggleKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(key: ToggleKey) {
    if (readOnly || saving) return;
    const prev = prefs;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setSaving(key);
    setError(null);
    try {
      const res = await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [key]: next[key] }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? `HTTP ${res.status}`);
      setPrefs(await res.json());
    } catch (e) {
      setPrefs(prev); // revert
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="mb-1 text-sm font-semibold uppercase tracking-wider text-teal-200/50">
          Push notifications
        </div>
        <p className="text-xs text-teal-200/40">
          What pings your phone (iOS). Per-person — Cam and Graham each set their own.
          {error && <span className="ml-2 text-red-400">{error}</span>}
        </p>
      </div>

      <div className="space-y-2">
        {TOGGLEABLE_CATEGORIES.map((c) => {
          const on = prefs[c.key];
          return (
            <button
              key={c.key}
              onClick={() => toggle(c.key)}
              disabled={readOnly}
              className={`flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-colors ${
                readOnly ? "cursor-default" : "hover:border-teal-400/30"
              } ${on ? "border-teal-400/40 bg-teal-400/[0.06]" : "border-teal-400/10 bg-teal-400/[0.02]"}`}
            >
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-teal-50">{c.label}</div>
                <div className="mt-0.5 text-xs leading-relaxed text-teal-200/50">{c.desc}</div>
              </div>
              <span
                aria-hidden
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  on ? "bg-teal-400/80" : "bg-teal-400/15"
                } ${saving === c.key ? "opacity-60" : ""}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-teal-50 shadow transition-all ${
                    on ? "left-[1.375rem]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-2xl border border-teal-400/10 bg-teal-400/[0.02] p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-teal-200/40">
          <span>Always on</span>
          <span className="rounded-full border border-teal-400/20 px-2 py-0.5 text-[10px] normal-case tracking-normal text-teal-200/40">
            can&rsquo;t be turned off
          </span>
        </div>
        <ul className="space-y-1.5">
          {ALWAYS_ON.map((a) => (
            <li key={a.label} className="flex gap-2 text-xs text-teal-200/50">
              <span className="mt-px text-teal-300/70">●</span>
              <span>
                <span className="font-semibold text-teal-100/80">{a.label}</span> — {a.desc}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
