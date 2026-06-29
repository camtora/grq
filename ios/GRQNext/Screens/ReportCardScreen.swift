import SwiftUI

// Report Card — how GRQ's calls actually did, scored against what happened. Overall + by
// source (chess/call/hunt) + by effect-order (chess ripple) + recent rows. Reads /api/report-card.
struct ReportCardScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<ReportCardResponse> = .loading

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { rc in content(rc) }.padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Report Card")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ rc: ReportCardResponse) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.lg) {
            GCard { tallyRow("Overall", rc.overall, p, big: true) }

            if !rc.bySource.isEmpty {
                PanelSection("By source") {
                    GCard(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(rc.bySource.enumerated()), id: \.element.id) { i, s in
                                tallyRow(s.label, s.tally, p).padding(Space.md)
                                if i < rc.bySource.count - 1 { Divider().overlay(p.cardBorder) }
                            }
                        }
                    }
                }
            }

            if !rc.byEffectOrder.isEmpty {
                PanelSection("Chess — does the ripple pay?") {
                    GCard(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(rc.byEffectOrder.enumerated()), id: \.element.id) { i, e in
                                tallyRow("\(e.order)°-order", e.tally, p).padding(Space.md)
                                if i < rc.byEffectOrder.count - 1 { Divider().overlay(p.cardBorder) }
                            }
                        }
                    }
                }
            }

            if !rc.rows.isEmpty {
                PanelSection("Recent calls") {
                    GCard(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(rc.rows.prefix(40).enumerated()), id: \.element.id) { i, r in
                                NavigationLink { StockDetailView(symbol: r.symbol) } label: { predRow(r, p) }.buttonStyle(.plain)
                                if i < min(40, rc.rows.count) - 1 { Divider().overlay(p.cardBorder) }
                            }
                        }
                    }
                }
            }

            Text("Graded once a call is priceable. Green = right (a correct DOWN bet counts).")
                .font(.caption2).foregroundStyle(p.textMuted)
        }
    }

    private func tallyRow(_ label: String, _ t: CardTally, _ p: Palette, big: Bool = false) -> some View {
        HStack {
            Text(label).font(big ? .headline : .subheadline).foregroundStyle(p.textPrimary)
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                if let hr = t.hitRate {
                    Text(String(format: "%.0f%% hit", hr * 100)).font(big ? .title3.weight(.bold) : .subheadline.weight(.semibold)).monospacedDigit()
                        .foregroundStyle(hr >= 0.5 ? p.pos : p.neg)
                } else { Text("—").foregroundStyle(p.textMuted) }
                Text("\(t.green)/\(t.graded) graded\(t.pending > 0 ? " · \(t.pending) pending" : "")").font(.caption2).foregroundStyle(p.textMuted)
            }
        }
    }

    private func predRow(_ r: PredRow, _ p: Palette) -> some View {
        HStack(spacing: Space.md) {
            CompanyLogo(symbol: r.symbol, url: nil, size: 28)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 5) {
                    Text(r.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    Chip(text: r.source, tone: .dim)
                    Text(r.direction).font(.caption2.weight(.bold)).foregroundStyle(r.direction == "DOWN" ? p.neg : p.pos)
                }
                if let l = r.label { Text(l).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                if let g = r.isGreen { Image(systemName: g ? "checkmark.circle.fill" : "xmark.circle.fill").foregroundStyle(g ? p.pos : p.neg) }
                else { Text("pending").font(.caption2).foregroundStyle(p.textMuted) }
                if let br = r.calledReturnBps { Text(Fmt.bps(br, digits: 1)).font(.caption2).monospacedDigit().foregroundStyle(br >= 0 ? p.pos : p.neg) }
            }
        }
        .padding(Space.md)
        .contentShape(Rectangle())
    }

    private func load() async {
        if let rc = await APIClient.shared.reportCard() { state = .loaded(rc) }
        else { state = .failed("Couldn’t load. Pull to retry.") }
    }
}
