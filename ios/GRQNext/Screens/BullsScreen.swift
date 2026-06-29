import SwiftUI

// Bull Race — each model runs its OWN $50k paper book; standings + holdings, leader-first.
// Reads /api/bulls. Sandbox, never the live fund.
struct BullsScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<BullsResponse> = .loading

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { r in content(r) }.padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Bull Race")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ r: BullsResponse) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.md) {
            if let cur = r.current {
                HStack {
                    Text(cur.race.name).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    Spacer()
                    if let rf = cur.realFundReturnPct { Text("fund \(pctStr(rf))").font(.caption).monospacedDigit().foregroundStyle(rf >= 0 ? p.pos : p.neg) }
                }
                ForEach(cur.bulls) { b in bullCard(b, p) }
            } else {
                GCard { Text("No race running.").font(.subheadline).foregroundStyle(p.textMuted) }
            }
        }
    }

    private func bullCard(_ b: BullStanding, _ p: Palette) -> some View {
        GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(b.label).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                        Text("\(b.dial.capitalized) · \(b.tradeCount) trades").font(.caption2).foregroundStyle(p.textMuted)
                    }
                    Spacer()
                    Text(pctStr(b.returnPct)).font(.headline).monospacedDigit().foregroundStyle(b.returnPct >= 0 ? p.pos : p.neg)
                }
                Text("NAV \(Fmt.money(b.navCadCents)) · \(Int(b.cashPct))% cash").font(.caption2).monospacedDigit().foregroundStyle(p.textMuted)
                if !b.holdings.isEmpty {
                    HStack(spacing: 5) {
                        ForEach(b.holdings.prefix(6)) { h in
                            NavigationLink { StockDetailView(symbol: h.symbol) } label: {
                                Text(h.symbol).font(.caption2.weight(.semibold)).foregroundStyle(p.accent)
                                    .padding(.horizontal, 6).padding(.vertical, 2).background(p.accent.opacity(0.1), in: Capsule())
                            }
                        }
                        if b.holdings.count > 6 { Text("+\(b.holdings.count - 6)").font(.caption2).foregroundStyle(p.textMuted) }
                    }
                }
            }
        }
    }

    private func pctStr(_ v: Double) -> String { String(format: "%+.2f%%", v) }

    private func load() async {
        if let r = await APIClient.shared.bulls() { state = .loaded(r) }
        else { state = .failed("Couldn’t load. Pull to retry.") }
    }
}
