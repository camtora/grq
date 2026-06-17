import { redirect } from "next/navigation";

// Today moved to the home page (`/`) — it's the landing tab now (Cam 2026-06-17).
// This redirect keeps old /today links working. Date archives live at /?d=YYYY-MM-DD.
export default async function TodayRedirect({ searchParams }: { searchParams: Promise<{ d?: string }> }) {
  const { d } = await searchParams;
  redirect(d ? `/?d=${d}` : "/");
}
