import { redirect } from "next/navigation";

// The standalone research desk was removed (Cam 2026-06-16) — notes now live
// per-stock on the stock page ("The record"). Kept as a redirect for old links.
export default function ResearchRemoved() {
  redirect("/market/watchlist");
}
