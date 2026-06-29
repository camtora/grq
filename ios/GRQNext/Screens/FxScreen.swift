import SwiftUI

// Currency & FX (D62 guardrail) — the agent requests CAD↔USD conversions; a member approves
// or rejects here, bounded by the dials. US buys need USD, CA buys need CAD; no auto-FX.
// Reads/writes /api/fx. Members only.
struct FxScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<FxState> = .loading
    @State private var busy = false

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { s in content(s) }
                .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Currency & FX")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ s: FxState) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.lg) {
            GCard {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: Space.md) {
                    StatTile(label: "CAD cash", value: Fmt.money(s.cadCashCents, "CAD"))
                    StatTile(label: "USD cash", value: Fmt.money(s.usdCashCents, "USD"))
                    StatTile(label: "USD exposure", value: String(format: "%.0f%%", s.usdPct))
                    if let fx = s.fxUsdCad { StatTile(label: "USD/CAD", value: String(format: "%.4f", fx)) }
                }
            }

            PanelSection("Pending approvals") {
                if s.pending.isEmpty {
                    GCard { Text("No conversions waiting on you.").font(.subheadline).foregroundStyle(p.textMuted) }
                } else {
                    VStack(spacing: Space.md) { ForEach(s.pending) { req in pendingCard(req, p) } }
                }
            }

            if !s.recent.isEmpty {
                PanelSection("Recent") {
                    GCard(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(s.recent.enumerated()), id: \.element.id) { i, r in
                                recentRow(r, p).padding(Space.md)
                                if i < s.recent.count - 1 { Divider().overlay(p.cardBorder) }
                            }
                        }
                    }
                }
            }

            Text("Member dials (max per request / per week / USD cap) are set on the web for now.")
                .font(.caption2).foregroundStyle(p.textMuted)
        }
    }

    private func pendingCard(_ req: FxRequest, _ p: Palette) -> some View {
        let dir = (req.fromCurrency ?? "CAD") + " → " + (req.toCurrency ?? "USD")
        return GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack {
                    Text(dir).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    Spacer()
                    if let sym = req.symbol { Chip(text: sym, tone: .teal) }
                }
                Text("Wants \(Fmt.money(req.amountUsdCents, req.toCurrency ?? "USD")) · est. \(Fmt.money(req.estCadCents, req.fromCurrency ?? "CAD"))")
                    .font(.caption).monospacedDigit().foregroundStyle(p.textMuted)
                Text(req.reason).font(.caption).foregroundStyle(p.textPrimary.opacity(0.85))
                HStack(spacing: Space.sm) {
                    Button("Approve") { Task { await decide(req.id, approve: true) } }
                        .font(.subheadline.weight(.bold)).foregroundStyle(p.pos)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(p.pos.opacity(0.12), in: RoundedRectangle(cornerRadius: Radius.control))
                    Button("Reject") { Task { await decide(req.id, approve: false) } }
                        .font(.subheadline.weight(.bold)).foregroundStyle(p.neg)
                        .frame(maxWidth: .infinity).padding(.vertical, 8)
                        .background(p.neg.opacity(0.12), in: RoundedRectangle(cornerRadius: Radius.control))
                }
                .disabled(busy)
            }
        }
    }

    private func recentRow(_ r: FxRequest, _ p: Palette) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 1) {
                Text((r.fromCurrency ?? "CAD") + " → " + (r.toCurrency ?? "USD")).font(.subheadline).foregroundStyle(p.textPrimary)
                Text(r.reason).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer()
            Chip(text: r.status, tone: statusTone(r.status))
        }
    }

    private func statusTone(_ s: String) -> ChipTone {
        switch s.uppercased() { case "EXECUTED", "APPROVED": return .pos; case "REJECTED", "FAILED": return .neg; default: return .dim }
    }

    private func decide(_ id: Int, approve: Bool) async {
        guard await BiometricGate.confirm(approve ? "Approve currency conversion" : "Reject currency conversion") else { return }
        busy = true; defer { busy = false }
        _ = approve ? await APIClient.shared.fxApprove(id: id) : await APIClient.shared.fxReject(id: id)
        await load()
    }

    private func load() async {
        if let s = await APIClient.shared.fxState() { state = .loaded(s) }
        else { state = .failed("Couldn’t load FX. Pull to retry.") }
    }
}
