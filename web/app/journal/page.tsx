import { redirect } from "next/navigation";

// The Journal now lives at the bottom of Settings (Cam 2026-06-16). Keep the old
// route (and ?kind= deep links) working by forwarding to the new anchor.
export default async function Journal({ searchParams }: { searchParams: Promise<{ kind?: string }> }) {
  const sp = await searchParams;
  redirect(sp.kind ? `/settings?kind=${sp.kind}#journal` : "/settings#journal");
}
