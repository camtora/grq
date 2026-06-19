import SwiftUI

// The rich stock dossier — parity with web app/stocks/[symbol]/page.tsx: logo + price,
// the RatingBar (GRQ's call + technical lean, with mascots), targets, analyst consensus,
// the bottom line, fundamentals, the dossier narrative, lazily-loaded earnings + analyst
// grades, member directives, watch/promote, and "Ask GRQ" (chat scoped to the symbol).
struct StockDetailView: View {
    let symbol: String
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var d: Dossier?
    @State private var extras: StockExtras?
    @State private var actionNote: String?
    @State private var showChat = false

    private var isMember: Bool { auth.currentUser?.role == .member }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let d {
                    header(d)
                    if isMember { memberControls(d) }
                    if let note = actionNote { noteRow(note) }
                    ratingCard(d)
                    targets(d)
                    if let bl = d.bottomLine, !bl.isEmpty { bottomLine(bl) }
                    fundamentals(d)
                    if let s = d.signals { signalsCard(s) }
                    dossierBody(d)
                    extrasCard()
                } else {
                    ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(40)
                }
            }
            .padding(.horizontal, 16).padding(.vertical, 12)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(symbol)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            d = await APIClient.shared.dossier(symbol)
            extras = await APIClient.shared.stockExtras(symbol)
        }
        .sheet(isPresented: $showChat) {
            ChatView(symbol: symbol).environmentObject(auth)
        }
    }

    // MARK: header

    private func header(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    StockLogo(symbol: d.symbol, url: d.logoUrl, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(d.name).font(.system(.title3, design: .rounded).weight(.bold)).foregroundStyle(p.textPrimary)
                        Text(d.symbol).font(.caption).foregroundStyle(p.textMuted)
                    }
                    Spacer()
                }
                if let last = d.lastCents {
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(Fmt.money(last, d.currency))
                            .font(.system(.title, design: .rounded).weight(.black)).monospacedDigit()
                            .foregroundStyle(Theme.brandGradient)
                        Text("per share").font(.caption2).foregroundStyle(p.textMuted)
                    }
                }
                HStack(spacing: 8) {
                    if let st = d.status, st != "ACTIVE" { Chip(text: st.lowercased(), tone: st == "CANDIDATE" ? .red : .dim) }
                    if let c = d.currency, c != "CAD" { Chip(text: c, tone: .teal) }
                    if d.watch == "universe" { Chip(text: "in universe", tone: .green) }
                    if d.researching == true { Chip(text: "researching…", tone: .teal) }
                    if let dir = d.directive { Chip(text: dir.label, tone: dir == .pin ? .teal : .red) }
                }
            }
        }
    }

    // MARK: rating

    private func ratingCard(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 16) {
                if let r = d.resolvedRating {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("GRQ'S CALL").font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(p.textMuted)
                        RatingBar(rating: r, mascots: true)
                    }
                } else {
                    Text("Not yet rated by GRQ.").font(.subheadline).foregroundStyle(p.textMuted)
                }
                if let rl = d.recLabel, let rp = d.recPos {
                    Divider().overlay(p.cardBorder.opacity(0.5))
                    RatingBar(rating: Rating(label: rl, abbr: "", tone: toneForPos(rp), pos: rp, blurb: "technical lean — an input, not the call"), note: "TECHNICALS")
                }
                Button { showChat = true } label: {
                    Label("Ask GRQ about \(d.symbol)", systemImage: "bubble.left.and.bubble.right.fill")
                        .font(.subheadline.weight(.semibold)).foregroundStyle(p.accent)
                }
                .buttonStyle(.plain)
            }
        }
    }
    private func toneForPos(_ pos: Double) -> String {
        if pos >= 0.75 { return "emerald" }; if pos >= 0.58 { return "teal" }
        if pos >= 0.42 { return "amber" }; return "red"
    }

    // MARK: targets / bottom line / fundamentals

    private func targets(_ d: Dossier) -> some View {
        let pos = Theme.palette(scheme).pos
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Targets")
                if let near = d.target.nearCents {
                    KeyValueRow(label: "Near-term" + (d.target.nearHorizon.map { " (\($0))" } ?? ""),
                                value: Fmt.money(near, d.currency), term: "price-target")
                }
                if let far = d.target.farCents {
                    KeyValueRow(label: "12-month", value: Fmt.money(far, d.currency), term: "price-target")
                }
                if let er = d.target.expectedReturnBps {
                    KeyValueRow(label: "Expected return", value: Fmt.bps(er), term: "expected-return", valueColor: pos)
                }
                if let a = d.analystTargetCents {
                    KeyValueRow(label: "Analyst consensus", value: Fmt.money(a, d.currency), term: "analyst-target")
                }
                if d.target.nearCents == nil && d.target.farCents == nil && d.analystTargetCents == nil {
                    Text("No price target yet — an earlier-stage read.").font(.caption).foregroundStyle(Theme.palette(scheme).textMuted)
                }
            }
        }
    }

    private func bottomLine(_ bl: String) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "The bottom line")
                MarkdownText(text: bl)
            }
        }
    }

    private func fundamentals(_ d: Dossier) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Fundamentals")
                if let mc = d.marketCapCents { KeyValueRow(label: "Market cap", value: Fmt.money(mc, d.currency), term: "market-cap") }
                if let pe = d.peRatio { KeyValueRow(label: "P/E", value: String(format: "%.1f", pe), term: "pe") }
                if let fcf = d.freeCashFlowCents { KeyValueRow(label: "Free cash flow", value: Fmt.money(fcf, d.currency), term: "free-cash-flow") }
                if let dy = d.dividendYieldBps { KeyValueRow(label: "Dividend yield", value: Fmt.pctBps(dy), term: "dividend-yield") }
                if d.marketCapCents == nil && d.peRatio == nil && d.freeCashFlowCents == nil && d.dividendYieldBps == nil {
                    Text("Fundamentals not loaded for this name yet.").font(.caption).foregroundStyle(Theme.palette(scheme).textMuted)
                }
            }
        }
    }

    private func signalsCard(_ s: Signals) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    SectionTitle(text: "Signals")
                    Spacer()
                    TermLink(slug: "recommendation", label: "rec \(s.recommendationPct)%").font(.caption)
                }
                SignalStrip(signals: s)
            }
        }
    }

    private func dossierBody(_ d: Dossier) -> some View {
        Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Dossier")
                MarkdownText(text: d.bodyMarkdown)
            }
        }
    }

    // MARK: lazy extras (earnings + analyst grades)

    @ViewBuilder private func extrasCard() -> some View {
        let p = Theme.palette(scheme)
        if let e = extras, (e.earnings != nil || (e.grades?.total ?? 0) > 0) {
            Card {
                VStack(alignment: .leading, spacing: 12) {
                    if let ev = e.earnings {
                        SectionTitle(text: ev.upcoming == true ? "Next earnings" : "Last earnings")
                        HStack {
                            Text(ev.date).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                            Spacer()
                            if let est = ev.epsEstimated { Text("EPS est \(String(format: "%.2f", est))").font(.caption).foregroundStyle(p.textMuted) }
                            if let act = ev.epsActual { Text("act \(String(format: "%.2f", act))").font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary) }
                        }
                    }
                    if let g = e.grades, let total = g.total, total > 0 {
                        Divider().overlay(p.cardBorder.opacity(0.5))
                        HStack {
                            SectionTitle(text: "Analyst ratings")
                            Spacer()
                            if let c = g.consensus, !c.isEmpty { Text(c).font(.caption.weight(.bold)).foregroundStyle(p.accentText) }
                        }
                        HStack(spacing: 16) {
                            tally("Buy", (g.strongBuy ?? 0) + (g.buy ?? 0), p.pos)
                            tally("Hold", g.hold ?? 0, p.textMuted)
                            tally("Sell", (g.sell ?? 0) + (g.strongSell ?? 0), p.neg)
                            Spacer()
                            Text("\(total) analysts").font(.caption2).foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }
    }

    private func tally(_ label: String, _ n: Int, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text("\(n)").font(.subheadline.weight(.bold)).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(Theme.palette(scheme).textMuted)
        }
    }

    // MARK: member controls

    @ViewBuilder private func memberControls(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        Card {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(text: "Member controls")
                HStack(spacing: 10) {
                    if d.watch == "none" || d.watch == nil {
                        controlButton("Watch", "heart", p.accent) { Task { await run(await APIClient.shared.watch(d.symbol, name: d.name)) } }
                    }
                    if d.status == "ACTIVE" {
                        controlButton(d.directive == .pin ? "Unpin" : "Pin", "star",
                                      d.directive == .pin ? p.accent : p.textMuted) {
                            Task { await directive(d, .pin) }
                        }
                        controlButton(d.directive == .noFly ? "Allow" : "No-fly", "nosign",
                                      d.directive == .noFly ? p.neg : p.textMuted) {
                            Task { await directive(d, .noFly) }
                        }
                    }
                    if d.status == "CANDIDATE" {
                        controlButton("Promote", "arrow.up.circle", p.accent) { Task { await promote(d) } }
                    }
                }
            }
        }
    }

    private func controlButton(_ label: String, _ icon: String, _ color: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: icon).font(.caption.weight(.bold))
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Capsule().fill(color.opacity(0.14))).foregroundStyle(color)
        }
        .buttonStyle(.plain)
    }

    // MARK: actions

    private func directive(_ d: Dossier, _ dir: Directive) async {
        guard await BiometricGate.confirm("Confirm it's you to change \(d.symbol).") else { return }
        let current = d.directive
        let target: String? = current == dir ? nil : (dir == .pin ? "PINNED" : "BLOCKED")
        let res = await APIClient.shared.setDirective(d.symbol, target)
        if res.ok {
            self.d = await APIClient.shared.dossier(symbol)
            actionNote = nil
        } else { actionNote = res.error }
    }

    private func promote(_ d: Dossier) async {
        guard await BiometricGate.confirm("Confirm it's you to promote \(d.symbol).") else { return }
        await run(await APIClient.shared.universeAction(d.symbol, "promote"))
        self.d = await APIClient.shared.dossier(symbol)
    }

    private func run(_ res: ActionResult) async {
        actionNote = res.error ?? "Done."
    }

    private func noteRow(_ t: String) -> some View {
        Text(t).font(.caption).foregroundStyle(Theme.palette(scheme).accentText)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}
