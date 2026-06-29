// Map a raw pathname to the friendly "section" label shown on the admin/usage
// dashboard. Mirrors the header nav (components/NavBar.tsx) so the dashboard
// speaks the same vocabulary members see. Order matters: most-specific prefixes
// first, with the exact "/market" (The Hunt) checked before the "/market/*"
// children. Keep this in lockstep with the nav when destinations change.

export type Section =
  | "Today"
  | "Portfolio"
  | "Accounts"
  | "Watchlist"
  | "Smart Money"
  | "Universe"
  | "The Hunt"
  | "Browse"
  | "Research"
  | "Stock"
  | "Reports"
  | "Second Opinions"
  | "Bull Race"
  | "Options Desk"
  | "Chess Moves"
  | "Report Card"
  | "Settings"
  | "Chat"
  | "Journal"
  | "Activity"
  | "Ideas"
  | "How it works"
  | "Admin"
  | "Other";

export function sectionForPath(pathRaw: string): Section {
  // Strip query/hash and any trailing slash so "/portfolio?x=1" and
  // "/portfolio/" both bucket as Portfolio.
  const path = (pathRaw.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";

  if (path === "/") return "Today";
  if (path === "/today" || path.startsWith("/today/")) return "Today"; // alias of "/"
  if (path === "/portfolio" || path.startsWith("/portfolio/")) return "Portfolio";
  if (path === "/accounts" || path.startsWith("/accounts/")) return "Accounts";
  if (path === "/market/watchlist" || path.startsWith("/market/watchlist/")) return "Watchlist";
  if (path === "/market/smart-money" || path.startsWith("/market/smart-money/")) return "Smart Money";
  if (path === "/market/browse" || path.startsWith("/market/browse/")) return "Browse";
  if (path === "/market/research" || path.startsWith("/market/research/")) return "Research";
  if (path === "/market") return "The Hunt"; // exact — nav pins The Hunt to /market
  if (path === "/universe" || path.startsWith("/universe/")) return "Universe";
  if (path === "/stocks" || path.startsWith("/stocks/")) return "Stock";
  if (path === "/reports" || path.startsWith("/reports/")) return "Reports";
  if (path === "/race" || path.startsWith("/race/")) return "Second Opinions"; // nav: renamed from "Race"
  if (path === "/bulls" || path.startsWith("/bulls/")) return "Bull Race";
  if (path === "/options-desk" || path.startsWith("/options-desk/")) return "Options Desk";
  if (path === "/chess" || path.startsWith("/chess/")) return "Chess Moves";
  if (path === "/report-card" || path.startsWith("/report-card/")) return "Report Card";
  if (path === "/settings" || path.startsWith("/settings/")) return "Settings";
  if (path === "/chat" || path.startsWith("/chat/")) return "Chat";
  if (path === "/journal" || path.startsWith("/journal/")) return "Journal";
  if (path === "/activity" || path.startsWith("/activity/")) return "Activity";
  if (path === "/ideas" || path.startsWith("/ideas/")) return "Ideas";
  if (path === "/research" || path.startsWith("/research/")) return "Research";
  if (path === "/how-it-works" || path.startsWith("/how-it-works/")) return "How it works";
  if (
    path === "/admin" ||
    path.startsWith("/admin/") ||
    path === "/traffic" ||
    path === "/tokens"
  )
    return "Admin";
  return "Other";
}
