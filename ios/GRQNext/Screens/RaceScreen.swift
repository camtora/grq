import SwiftUI

// Second Opinions — shadow models grade the fund's REAL calls (no separate book). A
// leaderboard of model standings. Reads /api/race. Research, never the live fund.
struct RaceScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<RaceResponse> = .loading

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { r in content(r) }.padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Second Opinions")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ r: RaceResponse) -> some View {
        let p = Theme.palette(scheme)
        let ranked = r.models.sorted { ($0.hitRate ?? -1) > ($1.hitRate ?? -1) }
        return VStack(alignment: .leading, spacing: Space.md) {
            Text("Shadow models judge GRQ’s actual calls — same prompt, one-shot, no tools. They never trade.")
                .font(.caption).foregroundStyle(p.textMuted)
            if ranked.isEmpty {
                GCard { Text("No graded calls yet.").font(.subheadline).foregroundStyle(p.textMuted) }
            } else {
                ForEach(Array(ranked.enumerated()), id: \.element.id) { i, m in modelCard(m, rank: i + 1, p) }
            }
        }
    }

    private func modelCard(_ m: RaceModel, rank: Int, _ p: Palette) -> some View {
        GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(spacing: Space.sm) {
                    Text("\(rank)").font(.headline.monospacedDigit()).foregroundStyle(p.textMuted)
                    Text(m.label).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    if m.role == "champion" { Chip(text: "champion", tone: .teal) }
                    Spacer()
                    if let hr = m.hitRate { Text(String(format: "%.0f%% hit", hr * 100)).font(.subheadline.weight(.semibold)).foregroundStyle(p.accent) }
                }
                HStack(spacing: Space.lg) {
                    stat("Calls", "\(m.scoredCalls)", p)
                    stat("Right", "\(m.greens)", p)
                    if let avg = m.avgReturnBps { stat("Avg", Fmt.bps(avg, digits: 1), p, color: avg >= 0 ? p.pos : p.neg) }
                    if let vs = m.vsBenchmarkBps { stat("vs XIC", Fmt.bps(vs, digits: 1), p, color: vs >= 0 ? p.pos : p.neg) }
                }
            }
        }
    }

    private func stat(_ label: String, _ value: String, _ p: Palette, color: Color? = nil) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label.uppercased()).font(.system(size: 9, weight: .semibold)).tracking(0.5).foregroundStyle(p.textMuted)
            Text(value).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(color ?? p.textPrimary)
        }
    }

    private func load() async {
        if let r = await APIClient.shared.race() { state = .loaded(r) }
        else { state = .failed("Couldn’t load. Pull to retry.") }
    }
}
