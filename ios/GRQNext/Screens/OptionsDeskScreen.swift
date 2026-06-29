import SwiftUI

// Options Desk — a sandbox A/B: a stock-only arm vs a stock+options arm, same book/cadence.
// Reads /api/desk. Teaches options via plain-English cards. Never the live fund; never real options.
struct OptionsDeskScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<DeskResponse> = .loading

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { r in content(r) }.padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Options Desk")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ r: DeskResponse) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.md) {
            if let cur = r.current {
                Text("Same money, same menu — one arm can only trade stock, the other can also buy calls/puts. Which compounds better?")
                    .font(.caption).foregroundStyle(p.textMuted)
                ForEach(cur.arms) { a in armCard(a, p) }
            } else {
                GCard { Text("No desk running.").font(.subheadline).foregroundStyle(p.textMuted) }
            }
        }
    }

    private func armCard(_ a: DeskArm, _ p: Palette) -> some View {
        GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(a.label).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                        Text(a.arm == "TREATMENT" ? "stock + options" : "stock only").font(.caption2).foregroundStyle(p.textMuted)
                    }
                    Spacer()
                    Text(String(format: "%+.2f%%", a.returnPct)).font(.headline).monospacedDigit().foregroundStyle(a.returnPct >= 0 ? p.pos : p.neg)
                }
                Text("NAV \(Fmt.money(a.navCadCents)) · \(a.openOptionCount) open options · \(a.tradeCount) trades")
                    .font(.caption2).monospacedDigit().foregroundStyle(p.textMuted)
                // Option holdings with their plain-English cards
                ForEach(a.holdings.filter { $0.kind != "STOCK" }) { h in
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Chip(text: h.kind, tone: h.kind == "PUT" ? .neg : .pos)
                            Text(h.underlying).font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary)
                            if let s = h.strikeCents { Text(Fmt.money(s)).font(.caption2).monospacedDigit().foregroundStyle(p.textMuted) }
                            if let d = h.daysLeft { Text("\(d)d").font(.caption2).foregroundStyle(p.textMuted) }
                            Spacer()
                            Text(Fmt.signedMoney(h.unrealCadCents)).font(.caption2).monospacedDigit().foregroundStyle(h.unrealCadCents >= 0 ? p.pos : p.neg)
                        }
                        if let c = h.card { Text(c).font(.caption2).foregroundStyle(p.textMuted) }
                    }
                    .padding(.top, 2)
                }
                // Resolved "punchlines"
                if !a.resolved.isEmpty {
                    Divider().overlay(p.cardBorder)
                    ForEach(a.resolved.prefix(3)) { r in
                        VStack(alignment: .leading, spacing: 1) {
                            HStack {
                                Text("\(r.kind) \(r.underlying)").font(.caption2.weight(.semibold)).foregroundStyle(p.textPrimary)
                                Spacer()
                                Text(String(format: "%+.0f%%", r.returnPct)).font(.caption2.weight(.bold)).monospacedDigit().foregroundStyle(r.returnPct >= 0 ? p.pos : p.neg)
                            }
                            Text(r.card).font(.caption2).foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        if let r = await APIClient.shared.desk() { state = .loaded(r) }
        else { state = .failed("Couldn’t load. Pull to retry.") }
    }
}
