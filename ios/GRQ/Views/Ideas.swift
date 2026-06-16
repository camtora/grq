import SwiftUI

struct IdeasView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var ideas: [Idea] = []

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    SectionTitle(text: "Ideas")
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
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Text(idea.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    Text(idea.name).font(.caption).foregroundStyle(p.textMuted)
                    Spacer()
                    if let c = idea.call { Chip(text: c.rawValue, tone: .green) }
                }
                if let er = idea.target.expectedReturnBps {
                    HStack(spacing: 8) {
                        TermLink(slug: "expected-return", label: "\(Fmt.bps(er)) expected")
                        if let conf = idea.target.confidence {
                            Text("· \(conf)% conf").foregroundStyle(p.textMuted)
                        }
                    }
                    .font(.caption)
                }
            }
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
                        Text(d.bodyMarkdown).font(.callout)
                            .foregroundStyle(Theme.palette(scheme).textMuted)
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
            VStack(alignment: .leading, spacing: 6) {
                Text(d.name).font(.title3.weight(.bold)).foregroundStyle(p.textPrimary)
                HStack(spacing: 8) {
                    if let c = d.call {
                        TermLink(slug: "agent-call", label: c.rawValue.capitalized)
                    }
                    if let s = d.signals {
                        Text("· rec \(s.recommendationPct)%").foregroundStyle(p.textMuted)
                    }
                }
                .font(.subheadline)
            }
        }
    }

    private func targets(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Targets")
                if let near = d.target.nearCents {
                    row("Near-term", Fmt.money(near), d.target.nearHorizon ?? "", p)
                }
                if let far = d.target.farCents { row("12-month", Fmt.money(far), "", p) }
                if let a = d.analystTargetCents {
                    HStack {
                        TermLink(slug: "analyst-target", label: "Analyst consensus")
                        Spacer()
                        MoneyText(cents: a).foregroundStyle(p.textPrimary)
                    }
                    .font(.subheadline)
                }
                TermLink(slug: "price-target", label: "Targets are hypotheses, judged when they resolve.")
                    .font(.caption2)
            }
        }
    }

    private func fundamentals(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Fundamentals")
                if let mc = d.marketCapCents { kv("Market cap", Fmt.money(mc), "market-cap", p) }
                if let pe = d.peRatio { kv("P/E", String(format: "%.1f", pe), "pe", p) }
                if let fcf = d.freeCashFlowCents { kv("Free cash flow", Fmt.money(fcf), "free-cash-flow", p) }
            }
        }
    }

    private func row(_ label: String, _ value: String, _ note: String, _ p: Palette) -> some View {
        HStack {
            Text(label).foregroundStyle(p.textMuted)
            Spacer()
            Text(value).monospacedDigit().foregroundStyle(p.textPrimary)
            if !note.isEmpty {
                Text(note).font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
            }
        }
        .font(.subheadline)
    }

    private func kv(_ label: String, _ value: String, _ term: String, _ p: Palette) -> some View {
        HStack {
            TermLink(slug: term, label: label)
            Spacer()
            Text(value).monospacedDigit().foregroundStyle(p.textPrimary)
        }
        .font(.subheadline)
    }
}
