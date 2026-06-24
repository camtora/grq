import SwiftUI

// THE DAILY — Today as a newspaper (docs/NEWSPAPER.md): masthead, NAV hero, the live
// indices strip, The Tape, the lead story, movers, top hitters, on the radar.
struct TodayView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var today: Today?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let t = today {
                    VStack(alignment: .leading, spacing: 16) {
                        masthead(t)
                        if let idx = t.indices, !idx.isEmpty { indicesStrip(idx) }
                        heroCard(t)
                        tapeCard(t)
                        leadCard(t)
                        moversCard("Market Movers", t.movers)
                        moversCard("Top Hitters", t.topHitters)
                        radarCard(t)
                        funFact
                    }
                    .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 32)
                } else {
                    VStack { ProgressView().tint(Theme.brandAccent) }.frame(maxWidth: .infinity).padding(.top, 120)
                }
            }
            .background(ScreenBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { today = await APIClient.shared.today() }
        }
        .task { today = await APIClient.shared.today() }
    }

    private func masthead(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return HStack(alignment: .center, spacing: 10) {
            BrandLogo(height: 28)
            Spacer()
            Text("\(t.edition.label) · \(t.dateISO)")
                .font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(p.textMuted)
            ChatButton()
            AvatarButton()
        }
        .padding(.top, 4)
    }

    private func indicesStrip(_ idx: [IndexQuote]) -> some View {
        let p = Theme.palette(scheme)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 10) {
                ForEach(idx) { q in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(q.name).font(.caption2.weight(.semibold)).foregroundStyle(p.textMuted).lineLimit(1)
                        if let pr = q.priceCents { Text(Fmt.money(pr)).font(.caption.weight(.bold)).monospacedDigit().foregroundStyle(p.textPrimary) }
                        if let ch = q.changeBps { BpsBadge(bps: ch).font(.caption2) }
                    }
                    .padding(10)
                    .frame(minWidth: 96, alignment: .leading)
                    .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.cardBg))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
                }
            }
        }
    }

    private func heroCard(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    TermLink(slug: "nav", label: "NAV").font(.caption.weight(.bold))
                    Spacer()
                    if let b = t.benchmarkBps, t.edition != .weekend {
                        HStack(spacing: 4) {
                            TermLink(slug: "vs-xic", label: "vs XIC").font(.caption2)
                            BpsBadge(bps: b).font(.caption2)
                        }
                    }
                }
                HeroAmount(cents: t.navCents)
                HStack(spacing: 8) {
                    if t.edition == .weekend {
                        // Markets closed — NAV is frozen at the last close, so the day is flat
                        // (the backend already sends dayPnl = 0). No phantom "today" move.
                        Image(systemName: "moon.zzz.fill").font(.subheadline).foregroundStyle(p.textMuted)
                        Text("Flat").font(.headline.weight(.bold)).foregroundStyle(p.textMuted)
                        Text("· markets closed").font(.caption).foregroundStyle(p.textMuted)
                    } else {
                        Pnl(cents: t.dayPnlCents).font(.headline.weight(.bold))
                        BpsBadge(bps: t.dayPnlBps).font(.subheadline)
                        Text("today").font(.caption).foregroundStyle(p.textMuted)
                    }
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
                if let lead = t.leadStoryMarkdown {
                    MarkdownText(text: lead)
                } else {
                    Text("No wrap filed yet — quiet day.").font(.callout).foregroundStyle(p.textMuted)
                }
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
                    Text("Quiet — nothing's moved yet today.").font(.subheadline).foregroundStyle(p.textMuted)
                }
                ForEach(Array(movers.enumerated()), id: \.element.id) { idx, m in
                    NavigationLink { StockDetailView(symbol: m.symbol) } label: {
                        HStack(spacing: 12) {
                            StockLogo(symbol: m.symbol, url: m.logoUrl, size: 32)
                            VStack(alignment: .leading, spacing: 1) {
                                Text(m.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                                Text(m.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                MoneyText(cents: m.lastCents, currency: m.currency).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
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
                    NavigationLink { StockDetailView(symbol: idea.symbol) } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            HStack(spacing: 8) {
                                StockLogo(symbol: idea.symbol, url: idea.logoUrl, size: 26)
                                Text(idea.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                                Text(idea.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                                Spacer()
                                if idea.unfamiliar { Chip(text: "new", tone: .dim) }
                            }
                            if let er = idea.target.expectedReturnBps {
                                HStack(spacing: 6) {
                                    Text("\(Fmt.bps(er)) expected").font(.caption.weight(.semibold)).foregroundStyle(p.pos)
                                    if let c = idea.target.confidence { Text("· \(c)% conf").font(.caption).foregroundStyle(p.textMuted) }
                                }
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
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
