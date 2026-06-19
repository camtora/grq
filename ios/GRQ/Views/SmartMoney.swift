import SwiftUI

// SMART MONEY — what notable portfolios are buying: tracked 13F filers, Congress / fund
// / insider leaderboards, cluster buys, and GRQ's read. Colour and leads, not trade
// instructions (most names are US-listed, outside the guardrailed CAD/USD universe).
// Mirrors web app/market/smart-money/page.tsx. Embedded as a tab in the Markets hub.
struct SmartMoneySection: View {
    @Environment(\.colorScheme) private var scheme
    @State private var data: SmartMoneyResponse?
    @State private var loaded = false

    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 16) {
            Text("What notable portfolios are buying — Congress, famous funds, and company insiders. Where one overlaps a name we track, we flag it.")
                .font(.caption).foregroundStyle(p.textMuted)

            if !loaded {
                ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 40)
            } else if let d = data, hasData(d) {
                ForEach(d.portfolios) { SmartPortfolioCard(p: $0) }
                leaderboard("Congress's most-bought", d.congress)
                leaderboard("Funds piling in", d.funds)
                leaderboard("Biggest insider buys", d.insiders)
                if !d.clusters.isEmpty { clustersCard(d.clusters) }
                if let n = d.narrative { narrativeCard(n) }
            } else {
                EmptyState(title: "No smart-money data yet",
                           message: "The agent ingests congress + insider trades daily and fund 13Fs each quarter. Check back after the next run.")
            }
        }
        .task { if !loaded { data = await APIClient.shared.smartMoney(); loaded = true } }
    }

    private func hasData(_ d: SmartMoneyResponse) -> Bool {
        !d.portfolios.isEmpty || !d.congress.isEmpty || !d.funds.isEmpty || !d.insiders.isEmpty
    }

    @ViewBuilder private func leaderboard(_ title: String, _ rows: [LeaderRow]) -> some View {
        if !rows.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SectionTitle(text: title)
                    ForEach(rows) { r in
                        NavigationLink { StockDetailView(symbol: r.symbol) } label: { leaderRow(r) }
                            .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func leaderRow(_ r: LeaderRow) -> some View {
        let p = Theme.palette(scheme)
        return HStack {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(r.symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    if let o = r.overlap { Chip(text: o == "universe" ? "universe" : "watching", tone: .teal) }
                }
                Text(r.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(r.primary).font(.subheadline.weight(.semibold)).foregroundStyle(p.accentText)
                if let s = r.secondary { Text(s).font(.caption2).foregroundStyle(p.textMuted) }
            }
        }
    }

    private func clustersCard(_ clusters: [SmartCluster]) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Cluster buys")
                Text("multiple insiders, one stock (last 30d)").font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(clusters) { c in
                            HStack(spacing: 4) {
                                Text(c.symbol).font(.caption.weight(.bold)).foregroundStyle(p.textPrimary)
                                Text("\(c.insiders)").font(.caption2).foregroundStyle(p.textMuted)
                                if let v = c.totalValueUsd { Text(Fmt.usd(v)).font(.caption2).foregroundStyle(p.textMuted) }
                            }
                            .padding(.horizontal, 9).padding(.vertical, 5)
                            .background(Capsule().fill(p.accent.opacity(0.08)))
                        }
                    }
                }
            }
        }
    }

    private func narrativeCard(_ n: SmartNarrative) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Chip(text: "GRQ's read", tone: .dim)
                    Text(n.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.palette(scheme).textPrimary)
                }
                CollapsibleMd(text: n.body)
            }
        }
    }
}

// MARK: - A tracked portfolio (13F filer) card

struct SmartPortfolioCard: View {
    @Environment(\.colorScheme) private var scheme
    let p: SmartPortfolio
    var body: some View {
        let pal = Theme.palette(scheme)
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(p.name).font(.subheadline.weight(.bold)).foregroundStyle(pal.textPrimary)
                        if let s = p.subtitle { Text(s).font(.caption2).foregroundStyle(pal.textMuted) }
                    }
                    Spacer()
                    if let v = p.totalValueUsd { Text(Fmt.usd(v)).font(.caption.weight(.semibold)).foregroundStyle(pal.accentText) }
                }
                ForEach(p.topHoldings.prefix(8)) { h in
                    NavigationLink { StockDetailView(symbol: h.symbol) } label: {
                        HStack(spacing: 8) {
                            Text(h.symbol).font(.caption.weight(.bold)).foregroundStyle(pal.textPrimary)
                            if let k = h.changeKind { Chip(text: k, tone: k == "TRIM" || k == "EXIT" ? .red : .green) }
                            if let pc = h.putCall { Chip(text: pc, tone: pc == "PUT" ? .red : .teal) }
                            Spacer()
                            if let v = h.valueUsd { Text(Fmt.usd(v)).font(.caption2).foregroundStyle(pal.textMuted) }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }
}
