import SwiftUI

// Portfolio — the fund: NAV hero, all-time P&L vs benchmark, a stat grid (positions, cash by
// currency, contributions, fees), the risk dial + kill-switch state, and holdings. Reads
// GET /api/portfolio. (Member actions — kill switch toggle, etc. — land in Phase D; external
// Accounts need a mobile endpoint and come later.)
struct PortfolioScreen: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<Portfolio> = .loading
    private var isMember: Bool { auth.currentUser?.role == .member }

    var body: some View {
        ScreenScaffold(title: "Portfolio", refresh: load) {
            LoadableView(state: state, retry: load) { pf in content(pf) }
        }
        .grqChrome()
        .task { if case .loading = state { await load() } }
    }

    private func content(_ pf: Portfolio) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.lg) {
            GCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Net asset value").font(.caption.weight(.semibold)).tracking(0.6).foregroundStyle(p.textMuted)
                    Text(Fmt.money(pf.navCents)).font(.system(size: 38, weight: .bold)).monospacedDigit().foregroundStyle(p.textPrimary)
                    HStack(spacing: 8) {
                        PnlText(cents: pf.totalPnlCents)
                        Text("all-time").font(.caption).foregroundStyle(p.textMuted)
                        if let bench = pf.benchmarkCents {
                            Text("· vs XIC \(Fmt.money(bench))").font(.caption).foregroundStyle(p.textMuted)
                        }
                    }
                }
            }

            GCard {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: Space.md) {
                    StatTile(label: "Positions", value: Fmt.money(pf.positionsCents))
                    StatTile(label: "Cash", value: Fmt.money(pf.cashCents))
                    if let cad = pf.cadCashCents { StatTile(label: "CAD cash", value: Fmt.money(cad, "CAD")) }
                    if let usd = pf.usdCashCents { StatTile(label: "USD cash", value: Fmt.money(usd, "USD")) }
                    StatTile(label: "Contributions", value: Fmt.money(pf.contributionsCents))
                    StatTile(label: "Fees this mo", value: Fmt.compact(pf.feeSpentMonthCents) + " / " + Fmt.compact(pf.feeBudgetCentsMonth))
                }
            }

            GCard {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Risk dial").font(.caption.weight(.semibold)).tracking(0.6).foregroundStyle(p.textMuted)
                        Text(pf.riskLevel.rawValue.capitalized).font(.headline).foregroundStyle(p.accent)
                    }
                    Spacer()
                    if pf.killSwitch {
                        VStack(alignment: .trailing, spacing: 3) {
                            Chip(text: "Halted", tone: .neg)
                            if let by = pf.killSwitchBy { Text("by \(by)").font(.caption2).foregroundStyle(p.textMuted) }
                        }
                    } else {
                        Chip(text: "Trading live", tone: .pos)
                    }
                }
            }

            if isMember {
                NavigationLink { AccountsScreen() } label: {
                    GCard {
                        HStack(spacing: Space.md) {
                            Image(systemName: "building.columns.fill").foregroundStyle(p.accent).frame(width: 24)
                            VStack(alignment: .leading, spacing: 1) {
                                Text("Your accounts").foregroundStyle(p.textPrimary)
                                Text("Personal holdings outside the fund · read-only").font(.caption2).foregroundStyle(p.textMuted)
                            }
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(p.textMuted)
                        }
                    }
                }
                .buttonStyle(.plain)
            }

            PanelSection("Holdings · \(pf.positions.count)") {
                if pf.positions.isEmpty {
                    GCard { Text("No open positions.").font(.subheadline).foregroundStyle(p.textMuted) }
                } else {
                    GCard(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(pf.positions.enumerated()), id: \.element.id) { i, pos in
                                NavigationLink { StockDetailView(symbol: pos.symbol) } label: {
                                    PositionRow(pos: pos).padding(Space.md)
                                }
                                if i < pf.positions.count - 1 { Divider().overlay(p.cardBorder) }
                            }
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        if let pf = await APIClient.shared.portfolio() { state = .loaded(pf) }
        else { state = .failed("Couldn’t reach GRQ. Pull to retry.") }
    }
}
