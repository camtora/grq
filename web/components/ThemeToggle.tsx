"use client";

import { useRouter } from "next/navigation";

// Light/dark chooser. Lives in Settings (Cam 2026-06-18) — a per-device display
// preference stored in the `grq-theme` cookie that the root layout reads.
export default function ThemeToggle({ current }: { current: "light" | "dark" }) {
  const router = useRouter();
  const set = (t: "light" | "dark") => {
    document.cookie = `grq-theme=${t};path=/;max-age=31536000;samesite=lax`;
    router.refresh();
  };
  const opt = (t: "light" | "dark", label: string, icon: string) => (
    <button
      onClick={() => set(t)}
      aria-pressed={current === t}
      className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
        current === t
          ? "border-teal-400/50 bg-teal-400/20 text-teal-100"
          : "border-teal-400/20 text-teal-200/50 hover:bg-teal-400/10"
      }`}
    >
      <span aria-hidden>{icon}</span> {label}
    </button>
  );
  return (
    <div className="flex gap-2">
      {opt("light", "Light", "☀️")}
      {opt("dark", "Dark", "🌙")}
    </div>
  );
}
