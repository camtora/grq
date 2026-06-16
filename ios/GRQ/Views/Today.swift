import SwiftUI

struct TodayView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var today: Today?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let t = today {
                    VStack(alignment: .leading, spacing: 16) {
                        masthead(t)
                        tape(t)
                        moversCard("Market Movers", t.movers)
                        moversCard("Top Hitters", t.topHitters)
                        radar(t)
                        funFactCard
                    }
                    .padding(16)
                } else {
                    ProgressView().padding(40)
                }
            }
            .navigationTitle("The Daily")
            .navigationBarTitleDisplayMode(.inline)
        }
        .task { today = await APIClient.shared.today() }
    }

    private func masthead(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                Text("GRQ DAILY").font(.title2.weight(.black)).foregroundStyle(Theme.brandGradient)
                Text("\(t.edition.label) · \(t.dateISO)").font(.caption).foregroundStyle(p.textMuted)
                Divider().overlay(p.cardBorder)
                HStack(alignment: .top, spacing: 24) {
                    VStack(alignment: .leading, spacing: 2) {
                        TermLink(slug: "nav", label: "NAV").font(.caption2)
                        MoneyText(cents: t.navCents).font(.title.weight(.semibold))
                            .foregroundStyle(p.textPrimary)
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("DAY").font(.caption2).foregroundStyle(p.textMuted)
                        HStack(spacing: 6) {
                            Pnl(cents: t.dayPnlCents).font(.title3.weight(.semibold))
                            Text(Fmt.bps(t.dayPnlBps)).font(.subheadline)
                                .foregroundStyle(t.dayPnlBps >= 0 ? p.pos : p.neg)
                        }
                    }
                }
                Text(Content.shared.dailyQuote()).font(.callout.italic())
                    .foregroundStyle(p.textMuted).padding(.top, 4)
            }
        }
    }

    private func tape(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    TermLink(slug: "the-tape", label: "The Tape").font(.caption.weight(.bold))
                    Spacer()
                    if let b = t.benchmarkBps {
                        TermLink(slug: "vs-xic", label: "vs XIC \(Fmt.bps(b))").font(.caption)
                    }
                }
                Sparkline(points: t.tape.map { Double($0.navCents) })
                    .stroke(p.accent, lineWidth: 2)
                    .frame(height: 56)
            }
        }
    }

    private func moversCard(_ title: String, _ movers: [Mover]) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(text: title)
                ForEach(movers) { m in moverRow(m) }
            }
        }
    }

    private func moverRow(_ m: Mover) -> some View {
        let p = Theme.palette(scheme)
        return HStack {
            Text(m.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
            Text(m.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
            Spacer()
            Text(Fmt.bps(m.dayChangeBps)).font(.subheadline.monospacedDigit())
                .foregroundStyle(m.dayChangeBps >= 0 ? p.pos : p.neg)
        }
    }

    private func radar(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "On the Radar")
                ForEach(t.onTheRadar) { idea in
                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(idea.symbol).font(.subheadline.weight(.semibold))
                                .foregroundStyle(p.textPrimary)
                            Text(idea.name).font(.caption).foregroundStyle(p.textMuted)
                            Spacer()
                            if idea.unfamiliar { Chip(text: "new", tone: .dim) }
                        }
                        if let er = idea.target.expectedReturnBps {
                            HStack(spacing: 6) {
                                Text("\(Fmt.bps(er)) expected").foregroundStyle(p.pos)
                                if let c = idea.target.confidence {
                                    Text("· \(c)% conf").foregroundStyle(p.textMuted)
                                }
                            }
                            .font(.caption)
                        }
                        TermLink(slug: "expected-return", label: "hypothesis, not a promise")
                            .font(.caption2)
                    }
                }
            }
        }
    }

    private var funFactCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: "sparkles").foregroundStyle(p.accent)
                Text(Content.shared.funFact()).font(.footnote).foregroundStyle(p.textMuted)
            }
        }
    }
}
