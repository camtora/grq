import SwiftUI

// The Hunt — Alfred's search for under-the-radar names, heat-ranked. A member can brief it
// in plain English (→ /api/hunt/refresh); leads, never verdicts. Reads /api/hunt.
struct HuntScreen: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<HuntResponse> = .loading
    @State private var brief = ""
    @State private var refreshing = false
    @State private var note: String?

    private var isMember: Bool { auth.currentUser?.role == .member }

    var body: some View {
        ScreenScaffold(title: "The Hunt", refresh: load) {
            VStack(alignment: .leading, spacing: Space.lg) {
                if isMember { briefBar }
                LoadableView(state: state, retry: load) { resp in feed(resp) }
            }
        }
        .task { if case .loading = state { await load() } }
    }

    private var briefBar: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: Space.sm) {
                Image(systemName: "binoculars.fill").foregroundStyle(p.accent)
                TextField("Brief the hunt — e.g. “uranium juniors with a catalyst”", text: $brief)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await refresh() } }
                Button { Task { await refresh() } } label: {
                    if refreshing { ProgressView().controlSize(.small).tint(p.accent) }
                    else { Image(systemName: "arrow.up.circle.fill").font(.title3).foregroundStyle(p.accent) }
                }
                .disabled(refreshing)
            }
            .padding(Space.md)
            .background(p.cardBg, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous).strokeBorder(p.cardBorder))
            if let note { Text(note).font(.caption2).foregroundStyle(p.textMuted) }
        }
    }

    private func feed(_ resp: HuntResponse) -> some View {
        let p = Theme.palette(scheme)
        let ranked = resp.finds.sorted { $0.resolvedHeat > $1.resolvedHeat }
        return VStack(alignment: .leading, spacing: Space.md) {
            if let b = resp.brief, !b.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "scope").font(.caption)
                    Text("Directed hunt: \(b)").font(.caption)
                }
                .foregroundStyle(Theme.hot(scheme))
            }
            if ranked.isEmpty {
                GCard { Text(isMember ? "No finds yet — brief the hunt above to send Alfred looking." : "No finds yet — Alfred hunts each market morning.").font(.subheadline).foregroundStyle(p.textMuted) }
            } else {
                ForEach(Array(ranked.enumerated()), id: \.element.id) { i, f in
                    NavigationLink { StockDetailView(symbol: f.sym) } label: { findRow(f, rank: i + 1, p) }
                        .buttonStyle(.plain)
                }
            }
        }
    }

    private func findRow(_ f: HuntFind, rank: Int, _ p: Palette) -> some View {
        let heat = f.resolvedHeat
        let heatC = Theme.heatColor(Double(heat))
        let up = (f.change30d ?? 0) >= 0
        return GCard(padding: 0) {
            HStack(spacing: 0) {
                Rectangle().fill(heatC).frame(width: 4)
                VStack(alignment: .leading, spacing: 6) {
                    HStack(spacing: Space.sm) {
                        Text(String(format: "%02d", rank)).font(.system(.title3, design: .monospaced).weight(.bold))
                            .foregroundStyle(Theme.heatTextColor(Double(heat), scheme))
                        CompanyLogo(symbol: f.sym, url: f.logoUrl, size: 30)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(f.sym).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                            Text(f.name).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            if let c = f.cur { Text(Fmt.money(c, f.currency ?? "CAD")).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary) }
                            if let ch = f.change30d { Text("\(up ? "+" : "")\(Int((ch * 100).rounded()))% 30d").font(.caption2).monospacedDigit().foregroundStyle(up ? p.pos : p.neg) }
                        }
                    }
                    Text(plainPreview(f.body)).font(.caption).foregroundStyle(p.textPrimary.opacity(0.8)).lineLimit(2)
                    HStack(spacing: Space.sm) {
                        Text("HEAT \(heat)").font(.caption2.weight(.bold)).foregroundStyle(heatC)
                        if let c = f.confidence { Text("· conv \(c)").font(.caption2).foregroundStyle(p.textMuted) }
                        if let far = f.farBps { Text("· \(Fmt.bps(far, digits: 0)) 12-mo").font(.caption2).monospacedDigit().foregroundStyle(far >= 0 ? p.pos : p.neg) }
                        Spacer()
                        if let o = f.obscurityLabel { Text(o).font(.caption2).foregroundStyle(Theme.hot(scheme)) }
                    }
                }
                .padding(Space.md)
            }
        }
    }

    private func refresh() async {
        refreshing = true; note = nil
        let r = await APIClient.shared.refreshHunt(brief: brief.trimmingCharacters(in: .whitespaces))
        switch r {
        case .success: note = "On it — fresh names land in a minute or two. Pull to refresh."; brief = ""
        case .failure(let m): note = m
        }
        refreshing = false
    }

    private func load() async {
        if let r = await APIClient.shared.hunt() { state = .loaded(r) }
        else { state = .failed("Couldn’t load the hunt. Pull to retry.") }
    }
}
