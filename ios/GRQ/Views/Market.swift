import SwiftUI

struct MarketView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var universe: [MarketName] = []
    @State private var watchlist: [MarketName] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    section("Universe", universe, term: "universe")
                    section("Watchlist", watchlist, term: "watchlist")
                }
                .padding(16)
            }
            .navigationTitle("Market")
        }
        .task {
            let m = await APIClient.shared.market()
            universe = m.universe
            watchlist = m.watchlist
        }
    }

    private func section(_ title: String, _ names: [MarketName], term: String) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            TermLink(slug: term, label: title).font(.caption.weight(.bold))
            ForEach(names) { n in
                NavigationLink { StockDetailView(symbol: n.symbol) } label: { row(n) }
                    .buttonStyle(.plain)
            }
        }
    }

    private func row(_ n: MarketName) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack(spacing: 12) {
                avatar(n.symbol, p)
                VStack(alignment: .leading, spacing: 2) {
                    Text(n.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    Text(n.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 2) {
                    MoneyText(cents: n.lastCents).font(.subheadline).foregroundStyle(p.textPrimary)
                    Text(Fmt.bps(n.dayChangeBps)).font(.caption.monospacedDigit())
                        .foregroundStyle(n.dayChangeBps >= 0 ? p.pos : p.neg)
                }
                if let call = n.agentCall { Chip(text: call.rawValue, tone: tone(call)) }
            }
        }
    }

    private func avatar(_ symbol: String, _ p: Palette) -> some View {
        Text(String(symbol.prefix(1)))
            .font(.headline.weight(.bold)).foregroundStyle(p.accent)
            .frame(width: 36, height: 36)
            .background(Circle().fill(p.accent.opacity(0.15)))
    }

    private func tone(_ c: AgentCall) -> Chip.Tone {
        switch c {
        case .buy, .accumulate: return .green
        case .avoid, .sell, .trim: return .red
        default: return .dim
        }
    }
}
