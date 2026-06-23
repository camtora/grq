// The stock dossier's panel keys — the single source of truth for the per-panel
// share feature (D61). A member long-presses a panel on the iOS stock page and
// shares THAT section with the other member; the key travels in the DirectMessage
// (and its push) so the recipient deep-links straight to it. Keys must match the
// iOS `PanelKind` rawValues (ios/GRQ/Views/Messages.swift) and the panel order in
// app/stocks/[symbol]/page.tsx / ios StockDetailView.
export const PANEL_LABELS: Record<string, string> = {
  bottomLine: "The bottom line",
  position: "Your position",
  agentNote: "The agent's note",
  analyst: "Analyst ratings",
  priceTarget: "Price target",
  institutional: "Institutional · 13F",
  signals: "Signals",
  earnings: "Earnings",
  peers: "Valuation vs peers",
  scoreboard: "Scoreboard",
  chart: "Price chart",
  smartMoney: "Smart money",
  fundamentals: "Fundamentals",
  dossier: "Dossier",
  trades: "Trades",
  news: "Recent news",
  coverage: "Data coverage",
};

/** Human label for a panel key, or null if the key is unknown/absent. */
export function panelLabel(key: string | null | undefined): string | null {
  if (!key) return null;
  return PANEL_LABELS[key] ?? null;
}
