import SwiftUI

struct TodayView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var today: Today?

    var body: some View {
        NavigationStack {
            if let t = today {
                GRQScreen(title: "GRQ Daily", subtitle: "\(t.edition.label) Edition · \(t.dateISO)") {
                    heroCard(t)
                    moversCard("Market Movers", t.movers)
                    tapeCard(t)
                    leadCard(t)
                    moversCard("Top Hitters", t.topHitters)
                    radarCard(t)
                    funFact
                }
            } else {
                ZStack { ScreenBackground().ignoresSafeArea(); ProgressView().tint(Theme.brandAccent) }
                    .toolbar(.hidden, for: .navigationBar)
            }
        }
        .task { today = await APIClient.shared.today() }
    }

    private func heroCard(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    TermLink(slug: "nav", label: "NAV").font(.caption.weight(.bold))
                    Spacer()
                    if let b = t.benchmarkBps {
                        HStack(spacing: 4) {
                            TermLink(slug: "vs-xic", label: "vs XIC").font(.caption2)
                            BpsBadge(bps: b).font(.caption2)
                        }
                    }
                }
                HeroAmount(cents: t.navCents)
                HStack(spacing: 8) {
                    Pnl(cents: t.dayPnlCents).font(.headline.weight(.bold))
                    BpsBadge(bps: t.dayPnlBps).font(.subheadline)
                    Text("today").font(.caption).foregroundStyle(p.textMuted)
                }
                Text(Content.shared.dailyQuote()).font(.callout.italic())
                    .foregroundStyle(p.textMuted).padding(.top, 2)
            }
        }
    }

    private func tapeCard(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                TermLink(slug: "the-tape", label: "The Tape").font(.caption.weight(.bold))
                TapeChart(points: t.tape.map { Double($0.navCents) }).frame(height: 84)
                HStack {
                    Text("Open \(Fmt.money(t.tape.first?.navCents ?? t.navCents))")
                    Spacer()
                    Text("Now \(Fmt.money(t.navCents))")
                }
                .font(.caption2).foregroundStyle(p.textMuted)
            }
        }
    }

    private func leadCard(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: t.leadTitle)
                Text(t.leadStoryMarkdown ?? "No wrap filed yet — quiet day.")
                    .font(.callout).foregroundStyle(p.textPrimary.opacity(0.92))
                Text("— the robot").font(.caption2.italic()).foregroundStyle(p.textMuted)
            }
        }
    }

    private func moversCard(_ title: String, _ movers: [Mover]) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: title)
                if movers.isEmpty {
                    Text("Quiet — nothing's moved yet today.")
                        .font(.subheadline).foregroundStyle(p.textMuted)
                }
                ForEach(Array(movers.enumerated()), id: \.element.id) { idx, m in
                    NavigationLink { StockDetailView(symbol: m.symbol) } label: {
                        HStack {
                            VStack(alignment: .leading, spacing: 1) {
                                Text(m.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                                Text(m.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                MoneyText(cents: m.lastCents).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                                BpsBadge(bps: m.dayChangeBps).font(.caption)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    if idx < movers.count - 1 { Divider().overlay(p.cardBorder.opacity(0.5)) }
                }
            }
        }
    }

    private func radarCard(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "On the Radar")
                ForEach(t.onTheRadar) { idea in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(idea.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                            Text(idea.name).font(.caption).foregroundStyle(p.textMuted)
                            Spacer()
                            if idea.unfamiliar { Chip(text: "new", tone: .dim) }
                        }
                        if let er = idea.target.expectedReturnBps {
                            HStack(spacing: 6) {
                                Text("\(Fmt.bps(er)) expected").font(.caption.weight(.semibold)).foregroundStyle(p.pos)
                                if let c = idea.target.confidence {
                                    Text("· \(c)% conf").font(.caption).foregroundStyle(p.textMuted)
                                }
                            }
                        }
                    }
                }
                TermLink(slug: "expected-return", label: "targets are hypotheses, not promises").font(.caption2)
            }
        }
    }

    private var funFact: some View {
        let p = Theme.palette(scheme)
        return HStack(alignment: .top, spacing: 8) {
            Image(systemName: "sparkles").foregroundStyle(p.accent)
            Text(Content.shared.funFact()).font(.caption).foregroundStyle(p.textMuted)
        }
        .padding(.horizontal, 4)
    }
}
