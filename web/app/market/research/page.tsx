import { redirect } from "next/navigation";

// The research desk merged into the Market ▸ Watchlist tab (2.9 IA tweak).
export default function ResearchDeskRedirect() {
  redirect("/market/watchlist");
}
