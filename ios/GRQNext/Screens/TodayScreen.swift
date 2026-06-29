import SwiftUI

// Today — "The Daily": masthead quote, NAV hero + the tape, indices strip, the lead
// briefing, movers / top hitters, and on-the-radar ideas. Reads GET /api/today.
struct TodayScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<Today> = .loading

    var body: some View {
        ScreenScaffold(title: "Today", refresh: load) {
            LoadableView(state: state, retry: load) { today in content(today) }
        }
        .task { if case .loading = state { await load() } }
    }

    private func content(_ t: Today) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.lg) {
            if let q = t.quote, !q.isEmpty {
                Text(q).font(.callout.italic()).foregroundStyle(p.textMuted)
            }

            GCard {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Fund NAV").font(.caption.weight(.semibold)).tracking(0.6).foregroundStyle(p.textMuted)
                    Text(Fmt.money(t.navCents)).font(.system(size: 38, weight: .bold)).monospacedDigit().foregroundStyle(p.textPrimary)
                    HStack(spacing: 8) {
                        PnlText(cents: t.dayPnlCents)
                        BpsBadge(bps: t.dayPnlBps)
                        Text("today").font(.caption).foregroundStyle(p.textMuted)
                        if let b = t.benchmarkBps {
                            Text("· XIC \(Fmt.bps(b))").font(.caption).foregroundStyle(p.textMuted)
                        }
                    }
                    if t.tape.count > 1 { TapeChart(points: t.tape).padding(.top, 4) }
                }
            }

            if let idx = t.indices, !idx.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: Space.sm) { ForEach(idx) { indexChip($0, p) } }
                }
            }

            if let body = t.leadStoryMarkdown, !body.isEmpty {
                PanelSection(t.leadTitle.isEmpty ? "Briefing" : t.leadTitle) { GCard { MD(body) } }
            }

            if !t.movers.isEmpty { moverList("Today's movers", t.movers) }
            if !t.topHitters.isEmpty { moverList("Top hitters", t.topHitters) }

            if !t.onTheRadar.isEmpty {
                PanelSection("On the radar") {
                    GCard(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(t.onTheRadar.enumerated()), id: \.element.id) { i, idea in
                                NavigationLink { StockDetailView(symbol: idea.symbol) } label: {
                                    IdeaRow(idea: idea).padding(Space.md)
                                }
                                if i < t.onTheRadar.count - 1 { Divider().overlay(p.cardBorder) }
                            }
                        }
                    }
                }
            }
        }
    }

    private func indexChip(_ i: IndexQuote, _ p: Palette) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(i.name).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1)
            Text(i.priceCents.map { Fmt.money($0, "CAD") } ?? "—").font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary)
            if let c = i.changeBps { BpsBadge(bps: c) }
        }
        .frame(width: 96, alignment: .leading)
        .padding(10)
        .background(p.cardBg, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(p.cardBorder))
    }

    private func moverList(_ title: String, _ movers: [Mover]) -> some View {
        let p = Theme.palette(scheme)
        return PanelSection(title) {
            GCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(movers.enumerated()), id: \.element.id) { i, m in
                        NavigationLink { StockDetailView(symbol: m.symbol) } label: {
                            MoverRow(mover: m).padding(Space.md)
                        }
                        if i < movers.count - 1 { Divider().overlay(p.cardBorder) }
                    }
                }
            }
        }
    }

    private func load() async {
        if let t = await APIClient.shared.today() { state = .loaded(t) }
        else { state = .failed("Couldn’t reach GRQ. Pull to retry.") }
    }
}
