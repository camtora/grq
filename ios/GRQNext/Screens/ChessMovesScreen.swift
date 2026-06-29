import SwiftUI

// Chess Moves — value-chain boards. A member briefs a theme/chain; Alfred maps the board and
// the ripple-effect PLAYS (leads, never verdicts). List → /api/chess; board → /api/chess/[id].
struct ChessMovesScreen: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<ChessListResponse> = .loading
    @State private var brief = ""
    @State private var busy = false
    @State private var note: String?

    private var isMember: Bool { auth.currentUser?.role == .member }

    var body: some View {
        ScreenScaffold(title: "Chess Moves", refresh: load) {
            VStack(alignment: .leading, spacing: Space.lg) {
                if isMember { briefBar }
                LoadableView(state: state, retry: load) { resp in list(resp) }
            }
        }
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
    }

    private var briefBar: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: Space.sm) {
                Image(systemName: "checkerboard.rectangle").foregroundStyle(p.accent)
                TextField("Map a chain — e.g. “GLP-1 supply chain”", text: $brief)
                    .autocorrectionDisabled().onSubmit { Task { await sendBrief() } }
                Button { Task { await sendBrief() } } label: {
                    if busy { ProgressView().controlSize(.small).tint(p.accent) }
                    else { Image(systemName: "arrow.up.circle.fill").font(.title3).foregroundStyle(p.accent) }
                }
                .disabled(busy)
            }
            .padding(Space.md)
            .background(p.cardBg, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous).strokeBorder(p.cardBorder))
            if let note { Text(note).font(.caption2).foregroundStyle(p.textMuted) }
        }
    }

    private func list(_ resp: ChessListResponse) -> some View {
        let p = Theme.palette(scheme)
        return VStack(spacing: Space.md) {
            if resp.themes.isEmpty {
                GCard { Text(isMember ? "No boards yet — name a chain above and Alfred will map it." : "No boards yet.").font(.subheadline).foregroundStyle(p.textMuted) }
            } else {
                ForEach(resp.themes) { t in themeCard(t, p) }
            }
        }
    }

    @ViewBuilder private func themeCard(_ t: ChessThemeSummary, _ p: Palette) -> some View {
        let ready = t.status == "READY"
        let card = GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack {
                    Text(t.title).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    Spacer()
                    Chip(text: statusLabel(t.status), tone: ready ? .pos : (t.status == "FAILED" ? .neg : .teal))
                    if t.kind == "WEEKLY" { Chip(text: "weekly", tone: .dim) }
                }
                if let bl = t.bottomLine, !bl.isEmpty {
                    Text(plainPreview(bl)).font(.caption).foregroundStyle(p.textMuted).lineLimit(2)
                } else {
                    Text(t.anchor).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                }
                if !t.tickers.isEmpty {
                    HStack(spacing: 5) {
                        ForEach(t.tickers.prefix(6), id: \.self) { Text($0).font(.caption2.weight(.semibold)).monospacedDigit().foregroundStyle(p.accent).padding(.horizontal, 6).padding(.vertical, 2).background(p.accent.opacity(0.1), in: Capsule()) }
                        if t.playCount > t.tickers.count { Text("+\(t.playCount - t.tickers.count)").font(.caption2).foregroundStyle(p.textMuted) }
                    }
                }
            }
        }
        if ready {
            NavigationLink { ChessBoardScreen(id: t.id, title: t.title) } label: { card }.buttonStyle(.plain)
        } else {
            card
        }
    }

    private func statusLabel(_ s: String) -> String {
        switch s { case "READY": return "ready"; case "FAILED": return "no board"; case "RUNNING": return "mapping…"; default: return "queued" }
    }

    private func sendBrief() async {
        let b = brief.trimmingCharacters(in: .whitespaces)
        guard b.count >= 3 else { note = "Name a theme or chain to map."; return }
        busy = true; note = nil
        let r = await APIClient.shared.briefChess(b)
        switch r {
        case .success: note = "Mapping the board — it lands in a minute or two. Pull to refresh."; brief = ""
        case .failure(let m): note = m
        }
        busy = false
    }

    private func load() async {
        if let r = await APIClient.shared.chessThemes() { state = .loaded(r) }
        else { state = .failed("Couldn’t load boards. Pull to retry.") }
    }
}

// One board — the chain (per-category lanes + flows) + heat-ranked plays + levers.
struct ChessBoardScreen: View {
    let id: Int
    let title: String
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<ChessBoard> = .loading

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { b in content(b) }
                .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ b: ChessBoard) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.lg) {
            // The take
            if let bl = b.bottomLine, !bl.isEmpty {
                GCard {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("THE TAKE").font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(p.accent)
                        MD(bl)
                    }
                }
            }
            if let thesis = b.thesis, !thesis.isEmpty {
                PanelSection("The position") { GCard { MD(thesis) } }
            }
            // Plays
            if !b.plays.isEmpty {
                PanelSection("The plays · \(b.plays.count)") {
                    VStack(spacing: Space.sm) { ForEach(b.plays.sorted { $0.heat > $1.heat }) { playRow($0, p) } }
                }
            }
            // The board (lanes)
            if !b.board.stages.isEmpty {
                PanelSection("The board") {
                    VStack(spacing: Space.sm) { ForEach(b.board.stages) { stageCard($0, b.board.links, p) } }
                }
            }
            // Levers
            if !b.levers.isEmpty {
                PanelSection("What would change our mind") {
                    GCard {
                        VStack(alignment: .leading, spacing: Space.sm) {
                            ForEach(b.levers) { lev in
                                HStack(alignment: .firstTextBaseline, spacing: 8) {
                                    Text(leverArrow(lev.direction)).foregroundStyle(leverColor(lev.direction, p)).fontWeight(.black)
                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(lev.gap).font(.caption).foregroundStyle(p.textPrimary.opacity(0.9))
                                        if let tr = lev.trigger, !tr.isEmpty { Text(tr).font(.caption2).foregroundStyle(p.textMuted) }
                                    }
                                }
                            }
                        }
                    }
                }
            }
            Text("Leads, not verdicts — Alfred’s web-researched reasoning, not imported data. Nothing here trades.")
                .font(.caption2).foregroundStyle(p.textMuted)
        }
    }

    private func playRow(_ pl: ChessPlayView, _ p: Palette) -> some View {
        let heatC = Theme.heatColor(Double(pl.heat))
        let dirTone: (String, Color) = pl.direction == "VICTIM" ? ("↓ victim", p.neg) : pl.direction == "NEUTRAL" ? ("↔ neutral", Theme.hot(scheme)) : ("↑ beneficiary", p.pos)
        return NavigationLink { StockDetailView(symbol: pl.symbol) } label: {
            GCard(padding: 0) {
                HStack(spacing: 0) {
                    Rectangle().fill(heatC).frame(width: 4)
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: Space.sm) {
                            CompanyLogo(symbol: pl.symbol, url: pl.logoUrl, size: 28)
                            Text(pl.symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                            Text(dirTone.0).font(.caption2.weight(.bold)).foregroundStyle(dirTone.1)
                            Text("\(pl.effectOrder)°").font(.caption2).foregroundStyle(p.textMuted)
                            Spacer()
                            if let c = pl.lastCents { Text(Fmt.money(c, pl.currency ?? "CAD")).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary) }
                        }
                        Text(plainPreview(pl.thesis)).font(.caption).foregroundStyle(p.textPrimary.opacity(0.8)).lineLimit(2)
                        HStack(spacing: Space.sm) {
                            Text(pl.role).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1)
                            Spacer()
                            Text("HEAT \(pl.heat)").font(.caption2.weight(.bold)).foregroundStyle(heatC)
                        }
                    }
                    .padding(Space.md)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private func stageCard(_ st: ChessBoardStage, _ links: [ChessBoardLink], _ p: Palette) -> some View {
        let syms = Set(st.items.compactMap { $0.symbol?.uppercased() })
        let flows = links.filter { syms.contains($0.from.uppercased()) }
        return GCard {
            VStack(alignment: .leading, spacing: 6) {
                Text(st.label).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                if let role = st.role { Text(role).font(.caption2).foregroundStyle(p.textMuted) }
                ForEach(st.items) { it in
                    HStack(spacing: 6) {
                        if let s = it.symbol { Text(s).font(.caption.weight(.semibold)).monospacedDigit().foregroundStyle(p.accent) }
                        Text(it.name).font(.caption).foregroundStyle(p.textPrimary.opacity(0.85))
                    }
                }
                if !flows.isEmpty {
                    Divider().overlay(p.cardBorder)
                    ForEach(flows) { l in
                        Text("\(l.from) → \(l.to)\(l.label.map { " · \($0)" } ?? "")").font(.caption2).monospacedDigit().foregroundStyle(p.textMuted)
                    }
                }
            }
        }
    }

    private func leverArrow(_ d: String?) -> String { d == "up" ? "↑" : d == "down" ? "↓" : "↔" }
    private func leverColor(_ d: String?, _ p: Palette) -> Color { d == "up" ? p.pos : d == "down" ? p.neg : Theme.hot(scheme) }

    private func load() async {
        if let b = await APIClient.shared.chessBoard(id) { state = .loaded(b) }
        else { state = .failed("Couldn’t load this board.") }
    }
}
