import { redirect } from "next/navigation";

// Portfolio merged into Overview (2026-06-12) — the fund caps at 8 positions,
// which never justified its own page. Manual sim ticket lives in Settings.
export default function Portfolio() {
  redirect("/");
}
