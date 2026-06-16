import SwiftUI

struct MarketView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var universe: [MarketName] = []
    @State private var watchlist: [MarketName] = []

    var body: some View {
        NavigationStack {
            GRQScreen(title: "Market", subtitle: "Universe & Watchlist") {
                section("Universe", universe, term: "universe", caption: "the agent can buy these")
                section("Watchlist", watchlist, term: "watchlist", caption: "researched, not yet tradable")
            }
        }
        .task {
            let m = await APIClient.shared.market()
            universe = m.universe
            watchlist = m.watchlist
        }
    }

    private func section(_ title: String, _ names: [MarketName], term: String, caption: String) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                TermLink(slug: term, label: title).font(.caption.weight(.bold))
                Text("· \(caption)").font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
                Spacer()
            }
            Card {
                VStack(spacing: 0) {
                    ForEach(Array(names.enumerated()), id: \.element.id) { idx, n in
                        NavigationLink { StockDetailView(symbol: n.symbol) } label: { row(n) }
                            .buttonStyle(.plain)
                        if idx < names.count - 1 {
                            Divider().overlay(p.cardBorder.opacity(0.5)).padding(.vertical, 12)
                        }
                    }
                }
            }
        }
    }

    private func row(_ n: MarketName) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 7) {
            HStack(spacing: 12) {
                avatar(n.symbol, p)
                VStack(alignment: .leading, spacing: 2) {
                    Text(n.symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    Text(n.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    MoneyText(cents: n.lastCents).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    BpsBadge(bps: n.dayChangeBps).font(.caption)
                }
                Image(systemName: "chevron.right").font(.caption2).foregroundStyle(p.textMuted.opacity(0.4))
            }
            HStack(spacing: 8) {
                if let call = n.agentCall { Chip(text: call.rawValue, tone: tone(call)) }
                Spacer()
                if let s = n.signals { SignalStrip(signals: s) }
            }
        }
        .contentShape(Rectangle())
    }

    private func avatar(_ symbol: String, _ p: Palette) -> some View {
        Text(String(symbol.prefix(1)))
            .font(.headline.weight(.black))
            .foregroundStyle(Theme.brandGradient)
            .frame(width: 38, height: 38)
            .background(Circle().fill(p.accent.opacity(0.14)))
            .overlay(Circle().strokeBorder(p.accent.opacity(0.25), lineWidth: 1))
    }

    private func tone(_ c: AgentCall) -> Chip.Tone {
        switch c {
        case .buy, .accumulate: return .green
        case .avoid, .sell, .trim: return .red
        default: return .dim
        }
    }
}
