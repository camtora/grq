import SwiftUI

// The stock dossier — full web parity (D60). Header (logo · price · rating) + every panel
// the web stock page shows, built as a data-driven list so we never hit the ViewBuilder
// child limit. Reads GET /api/dossier/{symbol}. Member actions land in Phase D.
struct StockDetailView: View {
    let symbol: String
    var scrollTo: String? = nil
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<Dossier> = .loading
    @State private var watchState: String? = nil   // none | watching | universe (optimistic)
    @State private var directive: String? = nil    // pin | no_fly | nil (optimistic)
    @State private var currency = "CAD"
    @State private var lastCents: Int? = nil
    @State private var busy = false
    @State private var showChat = false
    @State private var showAlert = false
    @State private var shareToast: String? = nil

    private var isMember: Bool { auth.currentUser?.role == .member }

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { d in content(d) }
                .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(symbol)
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
        .sheet(isPresented: $showChat) {
            AgentChatScreen(symbol: symbol).environmentObject(auth)
        }
        .sheet(isPresented: $showAlert) {
            SetPriceAlertSheet(symbol: symbol, currency: currency, lastCents: lastCents)
        }
        .overlay(alignment: .bottom) {
            if let t = shareToast {
                Text(t).font(.caption.weight(.semibold))
                    .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
                    .background(.bar, in: Capsule())
                    .padding(.bottom, Space.xl)
                    .transition(.opacity)
            }
        }
    }

    private struct PanelItem: Identifiable { let id: String; let title: String; let view: AnyView }

    private func content(_ d: Dossier) -> some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            header(d)
            if isMember { memberControls }
            ForEach(panelItems(d)) { item in
                VStack(alignment: .leading, spacing: Space.sm) {
                    SectionHeader(item.title)
                    item.view
                }
            }
        }
    }

    // MARK: header

    @ViewBuilder private func header(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(spacing: Space.md) {
                    CompanyLogo(symbol: d.symbol, url: d.logoUrl, size: 48)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(d.name).font(.headline).foregroundStyle(p.textPrimary).lineLimit(2)
                        HStack(spacing: 6) {
                            Text(d.symbol).font(.caption).foregroundStyle(p.textMuted)
                            if let s = d.status { Chip(text: s.lowercased(), tone: .dim) }
                            if let dir = d.directive { Chip(text: dir.label, tone: .amber) }
                        }
                    }
                    Spacer()
                    if let last = d.lastCents {
                        Text(Fmt.money(last, d.currency ?? "CAD")).font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(p.textPrimary)
                    }
                }
                if d.researching == true {
                    HStack(spacing: 6) {
                        ProgressView().tint(p.accent).controlSize(.small)
                        Text("Alfred is researching this name…").font(.caption).foregroundStyle(p.textMuted)
                    }
                }
                if let r = d.resolvedRating { RatingBar(rating: r) }
            }
        }
    }

    // MARK: member controls

    @ViewBuilder private var memberControls: some View {
        let p = Theme.palette(scheme)
        let watching = watchState == "watching"
        VStack(spacing: Space.sm) {
            HStack(spacing: Space.sm) {
                Button { Task { await toggleWatch() } } label: {
                    Label(watching ? "Watching" : "Watch", systemImage: watching ? "star.fill" : "star")
                        .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 10)
                }
                .foregroundStyle(watching ? Color(hex: "04110d") : p.accent)
                .background(watching ? AnyShapeStyle(p.accent) : AnyShapeStyle(p.accent.opacity(0.12)), in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
                .disabled(busy)

                Button { showChat = true } label: {
                    Label("Ask Alfred", systemImage: "bubble.left.and.text.bubble.right")
                        .font(.subheadline.weight(.semibold)).frame(maxWidth: .infinity).padding(.vertical, 10)
                }
                .foregroundStyle(p.accent)
                .background(p.accent.opacity(0.12), in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            }

            HStack(spacing: Space.sm) {
                Button { showAlert = true } label: { miniLabel("Alert", "bell.badge", p) }
                Button { Task { await share() } } label: { miniLabel("Share", "paperplane", p) }
                Menu {
                    Button("Pin (must-watch)") { Task { await setDirective("pin") } }
                    Button("No-fly (don’t buy)") { Task { await setDirective("no_fly") } }
                    if directive != nil { Button("Clear directive", role: .destructive) { Task { await setDirective(nil) } } }
                } label: {
                    miniLabel(directive == "pin" ? "Pinned" : directive == "no_fly" ? "No-fly" : "Directive", "flag", p)
                }
                .disabled(busy)
            }
        }
    }

    private func miniLabel(_ text: String, _ icon: String, _ p: Palette) -> some View {
        Label(text, systemImage: icon)
            .font(.caption.weight(.semibold)).foregroundStyle(p.accent)
            .frame(maxWidth: .infinity).padding(.vertical, 8)
            .background(p.accent.opacity(0.10), in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
    }

    private func setDirective(_ d: String?) async {
        busy = true; defer { busy = false }
        let r = await APIClient.shared.setDirective(symbol, d)
        if r.ok { directive = d }
    }

    private func share() async {
        let r = await APIClient.shared.sendMessage(body: nil, symbol: symbol)
        if r.ok { flashToast("Shared with your partner") }
    }

    private func flashToast(_ s: String) {
        withAnimation { shareToast = s }
        Task { try? await Task.sleep(for: .seconds(2)); withAnimation { shareToast = nil } }
    }

    private func toggleWatch() async {
        busy = true; defer { busy = false }
        let r: ActionResult
        if watchState == "watching" {
            r = await APIClient.shared.universeAction(symbol, "unwatch")
            if r.ok { watchState = "none" }
        } else {
            r = await APIClient.shared.watch(symbol)
            if r.ok { watchState = "watching" }
        }
    }

    // MARK: panels (data-driven)

    private func panelItems(_ d: Dossier) -> [PanelItem] {
        let p = Theme.palette(scheme)
        let cur = d.currency ?? "CAD"
        var items: [PanelItem] = []
        func add<V: View>(_ id: String, _ title: String, @ViewBuilder _ v: @escaping () -> V) {
            items.append(PanelItem(id: id, title: title, view: AnyView(GCard { v() })))
        }

        if let bl = d.bottomLine, !bl.isEmpty { add("why", "Why") { MD(bl) } }

        if let pos = d.position {
            add("pos", "Your position") {
                VStack(spacing: 0) {
                    KVRow(key: "Shares", value: "\(pos.qty)")
                    KVRow(key: "Avg cost", value: Fmt.money(pos.avgCostCents, cur))
                    KVRow(key: "Market value", value: Fmt.money(pos.marketValueCents, cur))
                    KVRow(key: "Unrealized", value: Fmt.signedMoney(pos.unrealizedPnlCents, cur), valueColor: pos.unrealizedPnlCents >= 0 ? p.pos : p.neg)
                    KVRow(key: "Stop \(Int(pos.stopPct))%", value: Fmt.money(pos.autoStopCents, cur))
                    KVRow(key: "Take-profit \(Int(pos.takeProfitPct))%", value: Fmt.money(pos.takeProfitCents, cur))
                }
            }
        }

        let t = d.target
        if t.nearCents != nil || t.farCents != nil || t.expectedReturnBps != nil {
            add("target", "GRQ's target") {
                VStack(spacing: 0) {
                    if let n = t.nearCents { KVRow(key: "Near\(t.nearHorizon.map { " (\($0))" } ?? "")", value: Fmt.money(n, cur)) }
                    if let f = t.farCents { KVRow(key: "12-month", value: Fmt.money(f, cur)) }
                    if let er = t.expectedReturnBps { KVRow(key: "Expected return", value: Fmt.bps(er), valueColor: er >= 0 ? p.pos : p.neg) }
                    if let c = t.confidence { KVRow(key: "Confidence", value: "\(c)%") }
                }
            }
        }

        if let ab = d.analystBand {
            add("analyst", "Analyst targets") {
                VStack(alignment: .leading, spacing: 0) {
                    KVRow(key: "Consensus", value: Fmt.money(ab.consensusCents, ab.currency))
                    KVRow(key: "Range", value: "\(Fmt.money(ab.lowCents, ab.currency)) – \(Fmt.money(ab.highCents, ab.currency))")
                    KVRow(key: "Upside", value: String(format: "%+.1f%%", ab.upsidePct), valueColor: ab.upsidePct >= 0 ? p.pos : p.neg)
                }
            }
        }

        if let fams = d.signalFamilies, !fams.isEmpty {
            add("signals", "Technical signals") {
                VStack(alignment: .leading, spacing: Space.sm) {
                    ForEach(fams) { f in
                        HStack {
                            Text(f.family.capitalized).font(.subheadline).foregroundStyle(p.textPrimary)
                            Spacer()
                            Chip(text: f.signal, tone: signalTone(f.signal))
                            Text("\(f.confidence)%").font(.caption).monospacedDigit().foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }

        let hasFund = d.marketCapCents != nil || d.peRatio != nil || d.freeCashFlowCents != nil || d.dividendYieldBps != nil
        if hasFund {
            add("fund", "Fundamentals") {
                VStack(spacing: 0) {
                    if let mc = d.marketCapCents { KVRow(key: "Market cap", value: Fmt.compact(mc, cur)) }
                    if let pe = d.peRatio { KVRow(key: "P/E", value: String(format: "%.1f", pe)) }
                    if let fcf = d.freeCashFlowCents { KVRow(key: "Free cash flow", value: Fmt.compact(fcf, cur)) }
                    if let dy = d.dividendYieldBps { KVRow(key: "Dividend yield", value: String(format: "%.2f%%", Double(dy) / 100)) }
                }
            }
        }

        if let cl = d.closes, cl.count > 1 { add("chart", "Price history") { PriceChart(closes: cl) } }

        if let e = d.earnings, e.next != nil || e.last != nil {
            add("earn", "Earnings") {
                VStack(spacing: 0) {
                    if let n = e.next { KVRow(key: "Next report", value: DateFmt.short(n.date)) }
                    if let l = e.last, let est = l.epsEstimated, let act = l.epsActual {
                        KVRow(key: "Last EPS", value: String(format: "%.2f est · %.2f act", est, act), valueColor: act >= est ? p.pos : p.neg)
                    }
                }
            }
        }

        if let sm = d.smartMoney, sm.hasAny {
            add("smart", "Smart money") {
                VStack(alignment: .leading, spacing: Space.sm) {
                    Text("Congress \(sm.congressBuyers) buying / \(sm.congressSellers) selling · insiders \(sm.insiderBuyers) buying")
                        .font(.caption).foregroundStyle(p.textMuted)
                    ForEach(sm.fundHolders.prefix(6)) { f in
                        HStack {
                            Text(f.name).font(.caption).foregroundStyle(p.textPrimary).lineLimit(1)
                            Spacer()
                            Chip(text: f.action, tone: actionTone(f.action))
                        }
                    }
                }
            }
        }

        if let peers = d.peers, !peers.isEmpty {
            add("peers", "Peers") {
                VStack(spacing: 4) {
                    ForEach(peers) { pr in
                        NavigationLink { StockDetailView(symbol: pr.symbol) } label: {
                            HStack {
                                Text(pr.symbol).font(.subheadline.weight(pr.isSelf ? .bold : .regular)).foregroundStyle(pr.isSelf ? p.accent : p.textPrimary)
                                Text(pr.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                                Spacer()
                                if let pe = pr.peTtm { Text("P/E \(String(format: "%.1f", pe))").font(.caption).monospacedDigit().foregroundStyle(p.textMuted) }
                            }
                            .contentShape(Rectangle())
                        }
                        .disabled(pr.isSelf)
                    }
                }
            }
        }

        if let inst = d.institutional {
            add("inst", "Institutional") {
                VStack(spacing: 2) {
                    KVRow(key: "Investors holding", value: "\(inst.investorsHolding) (\(inst.investorsHoldingChange >= 0 ? "+" : "")\(inst.investorsHoldingChange))")
                    ForEach(inst.holders.prefix(5)) { h in
                        HStack {
                            Text(h.name).font(.caption).foregroundStyle(p.textPrimary).lineLimit(1)
                            if h.isNew { Chip(text: "NEW", tone: .pos) }
                            Spacer()
                            Text(String(format: "%.1f%%", h.ownershipPct)).font(.caption).monospacedDigit().foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }

        if let sb = d.scoreboard, !sb.isEmpty {
            add("score", "Source scoreboard") {
                VStack(spacing: 0) {
                    ForEach(sb) { s in KVRow(key: s.source, value: s.hitRate.map { String(format: "%.0f%% hit", $0 * 100) } ?? "\(s.hits)/\(s.grades)") }
                }
            }
        }

        if let cov = d.coverage, !cov.isEmpty {
            add("cov", "Data coverage") {
                VStack(spacing: 6) {
                    ForEach(cov) { c in
                        HStack(spacing: 8) {
                            Circle().fill(coverageColor(c.status, p)).frame(width: 8, height: 8)
                            Text(c.name).font(.caption).foregroundStyle(p.textPrimary)
                            Spacer()
                            Text(c.status).font(.caption2).foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }

        if let news = d.news, !news.isEmpty {
            add("news", "News") {
                VStack(alignment: .leading, spacing: Space.sm) {
                    ForEach(news.prefix(8)) { n in
                        Link(destination: URL(string: n.url) ?? URL(string: "https://grq.camerontora.ca")!) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(n.title).font(.caption).foregroundStyle(p.textPrimary).lineLimit(2)
                                Text("\(n.publisher) · \(DateFmt.relative(n.at))").font(.caption2).foregroundStyle(p.textMuted)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }

        if let tr = d.trades, !tr.isEmpty {
            add("trades", "Trade history") {
                VStack(spacing: 4) {
                    ForEach(tr) { t in
                        HStack(spacing: 8) {
                            Chip(text: t.side, tone: t.side == "BUY" ? .pos : .amber)
                            Text("\(t.qty) @ \(Fmt.money(t.priceCents, cur))").font(.caption).monospacedDigit().foregroundStyle(p.textPrimary)
                            Spacer()
                            if let rp = t.realizedPnlCents { PnlText(cents: rp, currency: cur, font: .caption.weight(.semibold)) }
                            Text(DateFmt.short(t.at)).font(.caption2).foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }

        if let cr = d.currentRead {
            add("read", "Alfred's read") {
                VStack(alignment: .leading, spacing: 6) {
                    Text(cr.title).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    MD(cr.body)
                    Text(DateFmt.relative(cr.at)).font(.caption2).foregroundStyle(p.textMuted)
                }
            }
        }

        if !d.bodyMarkdown.isEmpty { add("body", "The dossier") { MD(d.bodyMarkdown) } }

        return items
    }

    // MARK: helpers

    private func signalTone(_ s: String) -> ChipTone {
        switch s.uppercased() { case "BUY": return .pos; case "SELL": return .neg; default: return .amber }
    }
    private func actionTone(_ a: String) -> ChipTone {
        switch a.uppercased() { case "NEW", "ADD": return .pos; case "TRIM", "EXIT": return .neg; default: return .dim }
    }
    private func coverageColor(_ status: String, _ p: Palette) -> Color {
        switch status.lowercased() { case "live": return p.pos; case "partial": return Theme.hot(scheme); default: return p.textMuted.opacity(0.4) }
    }

    private func load() async {
        if let d = await APIClient.shared.dossier(symbol) {
            state = .loaded(d)
            if watchState == nil { watchState = d.watch ?? "none" }
            directive = d.directive?.rawValue
            currency = d.currency ?? "CAD"
            lastCents = d.lastCents
        } else {
            state = .failed("Couldn’t load \(symbol). Pull to retry.")
        }
    }
}
