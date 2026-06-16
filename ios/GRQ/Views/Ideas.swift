import SwiftUI

struct IdeasView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var ideas: [Idea] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    SectionTitle(text: "Ideas — the agent's calls")
                    ForEach(ideas) { idea in
                        NavigationLink { StockDetailView(symbol: idea.symbol) } label: { card(idea) }
                            .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Ideas")
        }
        .task { ideas = await APIClient.shared.ideas() }
    }

    private func card(_ idea: Idea) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Text(idea.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    Text(idea.name).font(.caption).foregroundStyle(p.textMuted)
                    Spacer()
                    if idea.unfamiliar { Chip(text: "new", tone: .dim) }
                    if let c = idea.call { Chip(text: c.rawValue, tone: .green) }
                }
                HStack(alignment: .top, spacing: 16) {
                    if let near = idea.target.nearCents {
                        target("Near", Fmt.money(near), idea.target.nearHorizon, p)
                    }
                    if let far = idea.target.farCents {
                        target("12-mo", Fmt.money(far), nil, p)
                    }
                    Spacer()
                    if let er = idea.target.expectedReturnBps {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(Fmt.bps(er)).font(.subheadline.weight(.semibold)).foregroundStyle(p.pos)
                            if let c = idea.target.confidence {
                                Text("\(c)% conf").font(.caption2).foregroundStyle(p.textMuted)
                            }
                        }
                    }
                }
                TermLink(slug: "expected-return", label: "hypothesis, not a promise").font(.caption2)
            }
        }
    }

    private func target(_ label: String, _ value: String, _ horizon: String?, _ p: Palette) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased()).font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
            Text(value).font(.subheadline).monospacedDigit().foregroundStyle(p.textPrimary)
            if let horizon { Text(horizon).font(.caption2).foregroundStyle(p.textMuted) }
        }
    }
}

struct StockDetailView: View {
    let symbol: String
    @Environment(\.colorScheme) private var scheme
    @State private var d: Dossier?

    var body: some View {
        ScrollView {
            if let d {
                VStack(alignment: .leading, spacing: 16) {
                    header(d)
                    targets(d)
                    fundamentals(d)
                    Card {
                        VStack(alignment: .leading, spacing: 8) {
                            SectionTitle(text: "Dossier")
                            Text(d.bodyMarkdown).font(.callout)
                                .foregroundStyle(Theme.palette(scheme).textPrimary.opacity(0.9))
                        }
                    }
                }
                .padding(16)
            } else {
                ProgressView().padding(40)
            }
        }
        .navigationTitle(symbol)
        .navigationBarTitleDisplayMode(.inline)
        .task { d = await APIClient.shared.dossier(symbol) }
    }

    private func header(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                Text(d.name).font(.title3.weight(.bold)).foregroundStyle(p.textPrimary)
                HStack(spacing: 8) {
                    if let c = d.call { Chip(text: c.rawValue, tone: .green) }
                    if let s = d.signals {
                        TermLink(slug: "recommendation", label: "rec \(s.recommendationPct)%").font(.caption)
                    }
                    Spacer()
                }
                if let s = d.signals { SignalStrip(signals: s) }
            }
        }
    }

    private func targets(_ d: Dossier) -> some View {
        let pos = Theme.palette(scheme).pos
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Targets")
                if let near = d.target.nearCents {
                    KeyValueRow(label: "Near-term" + (d.target.nearHorizon.map { " (\($0))" } ?? ""),
                                value: Fmt.money(near), term: "price-target")
                }
                if let far = d.target.farCents {
                    KeyValueRow(label: "12-month", value: Fmt.money(far), term: "price-target")
                }
                if let er = d.target.expectedReturnBps {
                    KeyValueRow(label: "Expected return", value: Fmt.bps(er), term: "expected-return", valueColor: pos)
                }
                if let a = d.analystTargetCents {
                    KeyValueRow(label: "Analyst consensus", value: Fmt.money(a), term: "analyst-target")
                }
            }
        }
    }

    private func fundamentals(_ d: Dossier) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Fundamentals")
                if let mc = d.marketCapCents { KeyValueRow(label: "Market cap", value: Fmt.money(mc), term: "market-cap") }
                if let pe = d.peRatio { KeyValueRow(label: "P/E", value: String(format: "%.1f", pe), term: "pe") }
                if let fcf = d.freeCashFlowCents { KeyValueRow(label: "Free cash flow", value: Fmt.money(fcf), term: "free-cash-flow") }
                if let dy = d.dividendYieldBps { KeyValueRow(label: "Dividend yield", value: Fmt.pctBps(dy), term: "dividend-yield") }
            }
        }
    }
}
