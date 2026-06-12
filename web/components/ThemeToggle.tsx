"use client";

import { useRouter } from "next/navigation";

export default function ThemeToggle({ current }: { current: "light" | "dark" }) {
  const router = useRouter();
  const next = current === "dark" ? "light" : "dark";
  return (
    <button
      onClick={() => {
        document.cookie = `grq-theme=${next};path=/;max-age=31536000;samesite=lax`;
        router.refresh();
      }}
      title={`Switch to ${next} mode`}
      className="rounded-lg border border-teal-400/20 px-2 py-1 text-sm transition-colors hover:bg-teal-400/10"
    >
      {current === "dark" ? "☀️" : "🌙"}
    </button>
  );
}
