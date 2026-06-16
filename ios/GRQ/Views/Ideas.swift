import SwiftUI

struct IdeasView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var ideas: [Idea] = []

    var body: some View {
        NavigationStack {
            GRQScreen(title: "Ideas", subtitle: "the agent's calls") {
                ForEach(ideas) { idea in
                    NavigationLink { StockDetailView(symbol: idea.symbol) } label: { card(idea) }
                        .buttonStyle(.plain)
                }
            }
        }
        .task { ideas = await APIClient.shared.ideas() }
    }

    private func card(_ idea: Idea) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(idea.symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    Text(idea.name).font(.caption).foregroundStyle(p.textMuted)
                    Spacer()
                    if idea.unfamiliar { Chip(text: "new", tone: .dim) }
                    if let c = idea.call { Chip(text: c.rawValue, tone: .green) }
                }
                HStack(alignment: .bottom, spacing: 16) {
                    if let near = idea.target.nearCents {
                        target("Near", Fmt.money(near), idea.target.nearHorizon, p)
                    }
                    if let far = idea.target.farCents {
                        target("12-mo", Fmt.money(far), nil, p)
                    }
                    Spacer()
                    if let er = idea.target.expectedReturnBps {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text(Fmt.bps(er)).font(.title3.weight(.black).monospacedDigit()).foregroundStyle(p.pos)
                            if let c = idea.target.confidence {
                                Text("\(c)% conf").font(.caption2).foregroundStyle(p.textMuted)
                            }
                        }
                    }
                }
                HStack {
                    TermLink(slug: "expected-return", label: "hypothesis, not a promise").font(.caption2)
                    Spacer()
                    Image(systemName: "chevron.right").font(.caption2).foregroundStyle(p.textMuted.opacity(0.4))
                }
            }
            .contentShape(Rectangle())
        }
    }

    private func target(_ label: String, _ value: String, _ horizon: String?, _ p: Palette) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased()).font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary)
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
            VStack(alignment: .leading, spacing: 16) {
                if let d {
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
                } else {
                    ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(symbol)
        .navigationBarTitleDisplayMode(.inline)
        .task { d = await APIClient.shared.dossier(symbol) }
    }

    private func header(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                Text(d.name).font(.system(.title2, design: .rounded).weight(.bold)).foregroundStyle(p.textPrimary)
                if let last = d.lastCents {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(Fmt.money(last)).font(.system(.title, design: .rounded).weight(.black))
                            .monospacedDigit().foregroundStyle(Theme.brandGradient)
                        Text("per share").font(.caption2).foregroundStyle(p.textMuted)
                    }
                }
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
