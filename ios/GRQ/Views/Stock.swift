import SwiftUI
import UIKit

// The rich stock dossier — full parity with web app/stocks/[symbol]/page.tsx, same
// section order: hero → the bottom line (call + why) → your position → analyst
// ratings · price-target band · institutional · signals · earnings → peers +
// scoreboard → price chart → smart money → fundamentals → dossier → the record →
// trades → news → data-coverage map. All panels render off the one /api/dossier
// payload (lib/feed.ts dossierResponse) and degrade gracefully when a feed is dark.
struct StockDetailView: View {
    let symbol: String
    /// A panel key to scroll to + briefly highlight on open — set when a deep-linked
    /// per-panel share routes here (D61).
    var scrollTo: String? = nil
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var d: Dossier?
    @State private var actionNote: String?
    @State private var showChat = false
    @State private var showAlertSheet = false
    @State private var shareTarget: ShareTarget?    // nil = closed; .panel == nil = whole page
    @State private var flash: String?               // panel key to outline (deep-link landing)
    @State private var didScroll = false
    @State private var alerts: [PriceAlert] = []

    private var isMember: Bool { auth.currentUser?.role == .member }
    /// The OTHER member — the share recipient in this two-person fund.
    private var otherKey: String? { otherMemberKey(for: auth.currentUser?.email) }
    private var otherName: String { otherKey == "cam" ? "Cam" : otherKey == "graham" ? "Graham" : "the other member" }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let d {
                        // Long-press any of these panels to share THAT section with the
                        // other member (with a comment). Header/controls/alerts aren't
                        // shareable — they're personal/transient, not a "look at this".
                        Group {
                            header(d)
                            if isMember { memberControls(d) }
                            if let note = actionNote { noteRow(note) }
                            shareable(.bottomLine, bottomLineCard(d))
                            if let pos = d.position { shareable(.position, positionCard(d, pos)) }
                            if let n = d.agentNote, !n.isEmpty { shareable(.agentNote, agentNoteCard(n)) }
                            alertsCard()
                        }
                        Group {
                            shareable(.analyst, analystRatingsCard(d))
                            shareable(.priceTarget, priceTargetCard(d))
                            shareable(.institutional, institutionalCard(d))
                            shareable(.signals, signalFamiliesCard(d))
                            shareable(.earnings, earningsCard(d))
                            shareable(.peers, peersCard(d))
                            shareable(.scoreboard, scoreboardCard(d))
                            shareable(.chart, chartCard(d))
                            shareable(.smartMoney, smartMoneyCard(d))
                        }
                        Group {
                            shareable(.fundamentals, fundamentals(d))
                            shareable(.dossier, dossierCard(d))
                            shareable(.trades, tradesCard(d))
                            shareable(.news, newsCard(d))
                            shareable(.coverage, coverageCard(d))
                        }
                    } else {
                        ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(40)
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
            }
            // Once the dossier lands, jump to the shared panel and pulse its outline.
            .onChange(of: d?.symbol) { _, sym in
                guard sym != nil, let target = scrollTo, !didScroll else { return }
                didScroll = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
                    withAnimation { proxy.scrollTo(target, anchor: .top) }
                    flash = target
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.4) { withAnimation { flash = nil } }
                }
            }
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(symbol)
        .navigationBarTitleDisplayMode(.inline)
        .task {
            d = await APIClient.shared.dossier(symbol)
            await loadAlerts()
        }
        .sheet(isPresented: $showChat) {
            ChatView(symbol: symbol).environmentObject(auth)
        }
        .sheet(isPresented: $showAlertSheet, onDismiss: { Task { await loadAlerts() } }) {
            if let d {
                SetPriceAlertSheet(symbol: d.symbol, name: d.name, currency: d.currency, lastCents: d.lastCents)
            }
        }
        .sheet(item: $shareTarget) { t in
            ShareComposerSheet(symbol: symbol, name: d?.name, panel: t.panel).environmentObject(auth)
        }
        .toolbar {
            if isMember, let key = otherKey {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { shareTarget = ShareTarget(panel: nil) } label: {
                        ShareAvatarBadge(memberKey: key)
                    }
                    .accessibilityLabel("Share with \(otherName)")
                }
            }
        }
    }

    /// Wraps a panel so a long-press grows it + taps a haptic (the old context-menu
    /// feel) and opens the share composer for THAT section directly. Also a scroll
    /// anchor for deep-linked shares; `flash` briefly outlines the panel one landed on.
    @ViewBuilder
    private func shareable<V: View>(_ panel: PanelKind, _ content: V) -> some View {
        ShareablePanel(panel: panel, enabled: isMember, flashing: flash == panel.rawValue,
                       onShare: { shareTarget = ShareTarget(panel: panel) }) {
            content
        }
    }

    // MARK: header (hero)

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
                Text(d.lastResearchedAt != nil ? "researched \(relAgo(d.lastResearchedAt) ?? "")" : "not yet researched")
                    .font(.caption2).foregroundStyle(p.textMuted.opacity(0.8))
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        if let t = d.tier, !t.isEmpty { Chip(text: t, tone: .dim) }
                        if let c = d.currency, c != "CAD" { Chip(text: c, tone: .teal) }
                        if d.status == "CANDIDATE" { Chip(text: "candidate", tone: .red) }
                        if d.status == "RETIRED" { Chip(text: "retired", tone: .dim) }
                        if d.watch == "universe" { Chip(text: "in universe", tone: .green) }
                        if d.agentWatching == true { Chip(text: "agent watching", tone: .teal) }
                        if d.researching == true { Chip(text: "researching…", tone: .teal) }
                        if let dir = d.directive { Chip(text: dir.label, tone: dir == .pin ? .teal : .red) }
                    }
                }
            }
        }
    }

    // MARK: member controls

    @ViewBuilder private func memberControls(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        Card {
            VStack(alignment: .leading, spacing: 10) {
                SectionTitle(text: "Member controls")
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        controlButton("Ask GRQ", "bubble.left.and.bubble.right.fill", p.accent) { showChat = true }
                        controlButton("Alert", "bell", p.accent) { showAlertSheet = true }
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
    }

    private func controlButton(_ label: String, _ icon: String, _ color: Color, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(label, systemImage: icon).font(.caption.weight(.bold))
                .padding(.horizontal, 12).padding(.vertical, 7)
                .background(Capsule().fill(color.opacity(0.14))).foregroundStyle(color)
        }
        .buttonStyle(.plain)
    }

    // MARK: the bottom line (GRQ's call + why) — the prominent verdict, mirrors web

    private func bottomLineCard(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 14) {
                SectionTitle(text: "The bottom line")
                // Web parity: GRQ's call OR — only when there's no call — the technical
                // lean as a fallback. Never both (no second "Buy/Sell technicals" bar).
                if let r = d.resolvedRating {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("GRQ'S CALL").font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(p.textMuted)
                        RatingBar(rating: r, mascots: true)
                    }
                } else if let rl = d.recLabel, let rp = d.recPos {
                    VStack(alignment: .leading, spacing: 6) {
                        RatingBar(rating: Rating(label: rl, abbr: "", tone: toneForPos(rp), pos: rp, blurb: "technical signal only — an input, not a verdict"), mascots: true)
                        Text("No GRQ call yet — technical signal only (an input, not a verdict).")
                            .font(.caption).foregroundStyle(p.textMuted)
                    }
                } else {
                    Text("Not yet rated — GRQ hasn't filed a call on this name.").font(.subheadline).foregroundStyle(p.textMuted)
                }
                if let s = d.signals {
                    HStack(spacing: 8) {
                        SignalStrip(signals: s)
                        Text("technical indicators").font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
                    }
                }
                targetLine(d)
                if let bl = d.bottomLine, !bl.isEmpty {
                    Divider().overlay(p.cardBorder.opacity(0.5))
                    VStack(alignment: .leading, spacing: 6) {
                        Text("WHY").font(.caption2.weight(.bold)).tracking(0.8).foregroundStyle(p.textMuted)
                        MarkdownText(text: bl)
                    }
                }
            }
        }
    }

    @ViewBuilder private func targetLine(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        if let last = d.lastCents, last > 0 {
            let nearPct = d.target.nearCents.map { Double($0 - last) / Double(last) }
            let farPct = d.target.farCents.map { Double($0 - last) / Double(last) }
                ?? d.target.expectedReturnBps.map { Double($0) / 10_000 }
            if nearPct != nil || farPct != nil {
                HStack(spacing: 6) {
                    TermLink(slug: "price-target", label: "Target")
                    if let n = nearPct { Text("near").foregroundStyle(p.textMuted); pctText(n) }
                    if nearPct != nil && farPct != nil { Text("·").foregroundStyle(p.textMuted) }
                    if let f = farPct { Text("12-mo").foregroundStyle(p.textMuted); pctText(f) }
                    Spacer()
                }
                .font(.subheadline)
            }
        }
        if let band = d.analystBand {
            HStack(spacing: 6) {
                TermLink(slug: "analyst-target", label: "Analyst consensus")
                pctText(band.upsidePct)
                Text("upside").foregroundStyle(p.textMuted)
                Spacer()
            }
            .font(.subheadline)
        }
    }

    private func pctText(_ frac: Double) -> some View {
        let p = Theme.palette(scheme)
        return Text("\(frac > 0 ? "+" : "")\(Int((frac * 100).rounded()))%")
            .fontWeight(.semibold).foregroundStyle(frac > 0 ? p.pos : p.neg)
    }
    private func toneForPos(_ pos: Double) -> String {
        if pos >= 0.75 { return "emerald" }; if pos >= 0.58 { return "teal" }
        if pos >= 0.42 { return "amber" }; return "red"
    }

    // MARK: your position + the deterministic bracket

    private func positionCard(_ d: Dossier, _ pos: DossierPosition) -> some View {
        let p = Theme.palette(scheme)
        let pnlStr = (pos.unrealizedPnlCents < 0 ? "−" : "+") + Fmt.money(abs(pos.unrealizedPnlCents), d.currency)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                SectionTitle(text: "Your position")
                KeyValueRow(label: "Held", value: "\(pos.qty) sh")
                KeyValueRow(label: "Avg cost (ACB)", value: Fmt.money(pos.avgCostCents, d.currency))
                KeyValueRow(label: "Market value", value: Fmt.money(pos.marketValueCents, d.currency))
                KeyValueRow(label: "Unrealized P&L", value: pnlStr, valueColor: pos.unrealizedPnlCents >= 0 ? p.pos : p.neg)
                KeyValueRow(label: "Auto-stop (−\(Int(pos.stopPct))%)", value: Fmt.money(pos.autoStopCents, d.currency), valueColor: p.neg)
                KeyValueRow(label: "Take-profit (+\(Int(pos.takeProfitPct))%)", value: Fmt.money(pos.takeProfitCents, d.currency), valueColor: p.pos)
            }
        }
    }

    private func agentNoteCard(_ n: String) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 6) {
                SectionTitle(text: "The agent's note")
                Text(n).font(.subheadline).foregroundStyle(p.textPrimary)
            }
        }
    }

    // MARK: analyst ratings (grades + trend + recent moves)

    @ViewBuilder private func analystRatingsCard(_ d: Dossier) -> some View {
        if let g = d.grades {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        SectionTitle(text: "Analyst ratings")
                        Spacer()
                        Text("\(g.total) analysts").font(.caption2).foregroundStyle(p.textMuted)
                    }
                    Text(g.consensus).font(.subheadline.weight(.bold)).foregroundStyle(p.accentText)
                    gradeBar(g)
                    HStack(spacing: 16) {
                        tally("Sell", g.sell + g.strongSell, p.neg)
                        tally("Hold", g.hold, p.textMuted)
                        tally("Buy", g.buy + g.strongBuy, p.pos)
                    }
                    if let dir = g.trendDirection, (g.buyDelta ?? 0) != 0 || (g.sellDelta ?? 0) != 0 {
                        let tone = dir == "more bullish" ? p.pos : dir == "more bearish" ? p.neg : p.textMuted
                        let arrow = dir == "more bullish" ? "▲" : dir == "more bearish" ? "▼" : "→"
                        HStack {
                            Text("\(arrow) \(dir)").foregroundStyle(tone)
                            Spacer()
                            Text(trendDeltas(g)).foregroundStyle(p.textMuted)
                        }
                        .font(.caption2)
                    }
                    if !g.actions.isEmpty {
                        Divider().overlay(p.cardBorder.opacity(0.5))
                        Text("RECENT MOVES").font(.caption2.weight(.bold)).tracking(0.6).foregroundStyle(p.textMuted)
                        ForEach(g.actions) { a in actionRow(a) }
                    }
                }
            }
        }
    }

    private func gradeBar(_ g: DossierGrades) -> some View {
        let p = Theme.palette(scheme)
        let total = max(1, g.total)
        let segs: [(Int, Color)] = [
            (g.strongSell, p.neg), (g.sell, p.neg.opacity(0.6)),
            (g.hold, p.textMuted.opacity(0.45)),
            (g.buy, p.pos.opacity(0.7)), (g.strongBuy, p.pos),
        ]
        return GeometryReader { geo in
            HStack(spacing: 1) {
                ForEach(Array(segs.enumerated()), id: \.offset) { _, s in
                    if s.0 > 0 {
                        Rectangle().fill(s.1).frame(width: max(0, geo.size.width * CGFloat(s.0) / CGFloat(total)))
                    }
                }
            }
        }
        .frame(height: 8)
        .background(Capsule().fill(p.accent.opacity(0.1)))
        .clipShape(Capsule())
    }

    private func tally(_ label: String, _ n: Int, _ color: Color) -> some View {
        VStack(spacing: 1) {
            Text("\(n)").font(.subheadline.weight(.bold)).foregroundStyle(color)
            Text(label).font(.caption2).foregroundStyle(Theme.palette(scheme).textMuted)
        }
    }

    private func trendDeltas(_ g: DossierGrades) -> String {
        var parts: [String] = []
        if let b = g.buyDelta, b != 0 { parts.append("\(b > 0 ? "+" : "−")\(abs(b)) buy") }
        if let s = g.sellDelta, s != 0 { parts.append("\(s > 0 ? "+" : "−")\(abs(s)) sell") }
        if let m = g.trendMonths { parts.append("vs \(m)mo ago") }
        return parts.joined(separator: " · ")
    }

    private func actionRow(_ a: GradeAction) -> some View {
        let p = Theme.palette(scheme)
        let tone = a.action == "upgrade" ? p.pos : a.action == "downgrade" ? p.neg : p.textMuted
        let mark = a.action == "upgrade" ? "↑" : a.action == "downgrade" ? "↓" : a.action == "initiate" ? "✦" : "·"
        return HStack(spacing: 6) {
            Text(a.company).foregroundStyle(p.textPrimary).lineLimit(1)
            Spacer()
            Text("\(mark) \(a.toGrade)").fontWeight(.semibold).foregroundStyle(tone)
            Text(relAgo(a.date) ?? a.date).foregroundStyle(p.textMuted).monospacedDigit()
        }
        .font(.caption2)
    }

    // MARK: price-target band

    @ViewBuilder private func priceTargetCard(_ d: Dossier) -> some View {
        if let b = d.analystBand {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        SectionTitle(text: "Price target")
                        Spacer()
                        Text(b.reanchored ? "US analysts (rescaled)" : b.currency != "CAD" ? "US listing" : "Wall St.")
                            .font(.caption2).foregroundStyle(p.textMuted)
                    }
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text(Fmt.money(b.consensusCents, b.currency)).font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(p.textPrimary)
                        pctText(b.upsidePct)
                    }
                    targetBand(b)
                    HStack {
                        VStack(alignment: .leading, spacing: 1) {
                            Text("LOW").font(.caption2).foregroundStyle(p.textMuted)
                            Text(Fmt.money(b.lowCents, b.currency)).font(.caption.weight(.semibold)).foregroundStyle(p.neg)
                        }
                        Spacer()
                        VStack(spacing: 1) {
                            Text("NOW").font(.caption2).foregroundStyle(p.textMuted)
                            Text(Fmt.money(b.nowCents, b.currency)).font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary)
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("HIGH").font(.caption2).foregroundStyle(p.textMuted)
                            Text(Fmt.money(b.highCents, b.currency)).font(.caption.weight(.semibold)).foregroundStyle(p.pos)
                        }
                    }
                    .monospacedDigit()
                    if let chg = b.trendChangePct, chg != 0 {
                        HStack {
                            Text("\(chg > 0 ? "▲ targets rising" : "▼ targets falling") \(Int((chg * 100).rounded()))%")
                                .foregroundStyle(chg > 0 ? p.pos : p.neg)
                            Spacer()
                            if let n = b.trendRecentCount { Text("\(n) analysts · 3mo").foregroundStyle(p.textMuted) }
                        }
                        .font(.caption2)
                    }
                }
            }
        }
    }

    private func targetBand(_ b: AnalystBand) -> some View {
        let p = Theme.palette(scheme)
        let lo = Double(min(b.lowCents, b.nowCents))
        let hi = Double(max(b.highCents, b.nowCents))
        let pad = max(1, (hi - lo) * 0.06)
        let dMin = lo - pad, dMax = max(dMin + 1, hi + pad)
        func at(_ v: Int) -> Double { (Double(v) - dMin) / (dMax - dMin) }
        return GeometryReader { geo in
            let w = geo.size.width
            ZStack(alignment: .leading) {
                Capsule().fill(p.accent.opacity(0.12)).frame(height: 6)
                Capsule().fill(p.accent.opacity(0.35))
                    .frame(width: max(2, w * (at(b.highCents) - at(b.lowCents))), height: 6)
                    .offset(x: w * at(b.lowCents))
                Rectangle().fill(p.accent).frame(width: 9, height: 9).rotationEffect(.degrees(45))
                    .offset(x: max(0, w * at(b.consensusCents) - 4.5))
                Circle().fill(.white).frame(width: 13, height: 13)
                    .overlay(Circle().stroke(p.accent, lineWidth: 2))
                    .offset(x: max(0, w * at(b.nowCents) - 6.5))
            }
            .frame(height: 14)
        }
        .frame(height: 14)
    }

    // MARK: institutional (13F)

    @ViewBuilder private func institutionalCard(_ d: Dossier) -> some View {
        if let inst = d.institutional {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        SectionTitle(text: "Institutional · 13F")
                        Spacer()
                        Text("\(inst.investorsHoldingChange >= 0 ? "+" : "")\(inst.investorsHoldingChange) QoQ")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(inst.investorsHoldingChange >= 0 ? p.pos : p.neg)
                    }
                    Text("\(inst.investorsHolding) institutions hold").font(.subheadline).foregroundStyle(p.textPrimary)
                    ForEach(inst.holders) { h in holderRow(h) }
                    Text("13F filings (as of \(inst.date)) — US-listed; ~45-day lag, not timing.")
                        .font(.caption2).foregroundStyle(p.textMuted)
                }
            }
        }
    }

    private func holderRow(_ h: Holder) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 6) {
            Text(h.name).foregroundStyle(p.textPrimary).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            if h.isNew { Text("NEW").font(.system(size: 9, weight: .bold)).foregroundStyle(p.pos) }
            Text(String(format: "%.1f%% own", h.ownershipPct)).foregroundStyle(p.textMuted)
            if abs(h.sharesChangePct) >= 0.05 {
                Text("\(h.sharesChangePct > 0 ? "▲" : "▼") \(String(format: "%.1f%%", abs(h.sharesChangePct)))")
                    .foregroundStyle(h.sharesChangePct > 0 ? p.pos : p.neg)
            }
        }
        .font(.caption2).monospacedDigit()
    }

    // MARK: signals (per-family rationale)

    @ViewBuilder private func signalFamiliesCard(_ d: Dossier) -> some View {
        if let fams = d.signalFamilies, !fams.isEmpty {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    HStack {
                        SectionTitle(text: "Signals")
                        Spacer()
                        if let s = d.signals { TermLink(slug: "recommendation", label: "rec \(s.recommendationPct)%").font(.caption2) }
                    }
                    ForEach(fams) { f in
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 8) {
                                Text(f.family.uppercased()).font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary)
                                Chip(text: f.signal, tone: f.signal == "BUY" ? .green : f.signal == "SELL" ? .red : .dim)
                                Spacer()
                                Text("\(f.confidence)%").font(.caption2).foregroundStyle(p.textMuted).monospacedDigit()
                            }
                            Text(f.rationale).font(.caption2).foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }
    }

    // MARK: earnings

    @ViewBuilder private func earningsCard(_ d: Dossier) -> some View {
        if let e = d.earnings, e.next != nil || e.last != nil {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    SectionTitle(text: "Earnings")
                    if let n = e.next {
                        HStack { Text("Next report").foregroundStyle(p.textMuted); Spacer(); Text(n.date).fontWeight(.semibold).foregroundStyle(p.textPrimary) }
                            .font(.subheadline)
                        if n.epsEstimated != nil || n.revenueEstimated != nil {
                            HStack(spacing: 12) {
                                if let est = n.epsEstimated { Text("est EPS \(fmt2(est))") }
                                if let r = n.revenueEstimated { Text("est Rev \(fmtRev(r))") }
                            }
                            .font(.caption2).foregroundStyle(p.textMuted)
                        }
                    }
                    if let l = e.last {
                        if e.next != nil { Divider().overlay(p.cardBorder.opacity(0.5)) }
                        HStack { Text("Last report").foregroundStyle(p.textMuted); Spacer(); Text(l.date).foregroundStyle(p.textMuted) }
                            .font(.subheadline)
                        if let act = l.epsActual {
                            earningsLine("EPS", fmt2(act), l.epsEstimated.map { fmt2($0) }, beat: l.epsEstimated.map { act > $0 })
                        }
                        if let act = l.revenueActual {
                            earningsLine("Rev", fmtRev(act), l.revenueEstimated.map { fmtRev($0) }, beat: l.revenueEstimated.map { act > $0 })
                        }
                    }
                    Text("Stocks often move more on guidance than the number itself.").font(.caption2).foregroundStyle(p.textMuted)
                }
            }
        }
    }

    private func earningsLine(_ label: String, _ actual: String, _ est: String?, beat: Bool?) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 6) {
            Text(label).foregroundStyle(p.textMuted)
            Text(actual).fontWeight(.semibold).foregroundStyle(p.textPrimary)
            if let est { Text("vs \(est) est").foregroundStyle(p.textMuted) }
            Spacer()
            if let beat { Text(beat ? "▲ beat" : "▼ miss").foregroundStyle(beat ? p.pos : p.neg) }
        }
        .font(.caption2)
    }

    // MARK: valuation vs peers

    @ViewBuilder private func peersCard(_ d: Dossier) -> some View {
        if let peers = d.peers, peers.count > 1 {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    SectionTitle(text: "Valuation vs peers")
                    HStack {
                        Text("Company").frame(maxWidth: .infinity, alignment: .leading)
                        Text("P/E").frame(width: 52, alignment: .trailing)
                        Text("P/B").frame(width: 52, alignment: .trailing)
                        Text("Cap").frame(width: 56, alignment: .trailing)
                    }
                    .font(.caption2.weight(.bold)).foregroundStyle(p.textMuted)
                    ForEach(peers) { pr in peerRow(d, pr) }
                }
            }
        }
    }

    private func peerRow(_ d: Dossier, _ pr: PeerRow) -> some View {
        let p = Theme.palette(scheme)
        return HStack {
            Text(pr.isSelf ? "\(pr.symbol) · this stock" : pr.symbol)
                .fontWeight(pr.isSelf ? .bold : .regular)
                .foregroundStyle(pr.isSelf ? p.accentText : p.textPrimary)
                .lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
            Text(pr.peTtm.map { String(format: "%.1f×", $0) } ?? "—").frame(width: 52, alignment: .trailing).foregroundStyle(p.textPrimary)
            Text(pr.pbTtm.map { String(format: "%.1f×", $0) } ?? "—").frame(width: 52, alignment: .trailing).foregroundStyle(p.textMuted)
            Text(capStr(pr.marketCapM)).frame(width: 56, alignment: .trailing).foregroundStyle(p.textMuted)
        }
        .font(.caption).monospacedDigit()
        .padding(.vertical, 2)
    }

    private func capStr(_ m: Double?) -> String {
        guard let m else { return "—" }
        return m >= 1000 ? "$\(Int((m / 1000).rounded()))B" : "$\(Int(m))M"
    }

    // MARK: scoreboard (graded calls)

    @ViewBuilder private func scoreboardCard(_ d: Dossier) -> some View {
        if let rows = d.scoreboard, !rows.isEmpty {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    SectionTitle(text: "Scoreboard")
                    ForEach(rows) { s in
                        HStack {
                            Text(s.source).foregroundStyle(p.textPrimary).lineLimit(1).frame(maxWidth: .infinity, alignment: .leading)
                            if let hr = s.hitRate {
                                Text("\(Int((hr * 100).rounded()))%").foregroundStyle(hr >= 0.5 ? p.pos : p.neg)
                            } else {
                                Text("—").foregroundStyle(p.textMuted)
                            }
                            Text("\(s.hits)/\(s.misses)").foregroundStyle(p.textMuted).frame(width: 56, alignment: .trailing)
                        }
                        .font(.caption).monospacedDigit()
                    }
                    Text("Hit rate on graded calls — retros fill this in.").font(.caption2).foregroundStyle(p.textMuted)
                }
            }
        }
    }

    // MARK: price chart

    @ViewBuilder private func chartCard(_ d: Dossier) -> some View {
        if let closes = d.closes, closes.count > 1 {
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    SectionTitle(text: "Price · last \(closes.count) sessions")
                    TapeChart(points: closes.map { Double($0.c) }).frame(height: 140)
                }
            }
        }
    }

    // MARK: smart money on this name

    @ViewBuilder private func smartMoneyCard(_ d: Dossier) -> some View {
        if let sm = d.smartMoney, sm.hasAny {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SectionTitle(text: "Smart money")
                    if sm.insiderBuyers > 0 || sm.congressBuyers > 0 {
                        HStack(spacing: 12) {
                            if sm.insiderBuyers > 0 { Text("\(sm.insiderBuyers) insider buys · \(Fmt.usd(sm.insiderBuyValueUsd))").foregroundStyle(p.pos) }
                            if sm.congressBuyers > 0 { Text("\(sm.congressBuyers) congress buys").foregroundStyle(p.textMuted) }
                        }
                        .font(.caption2)
                    }
                    ForEach(sm.fundHolders) { f in
                        HStack(spacing: 6) {
                            Text(f.name).font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary).lineLimit(1)
                            if let pc = f.putCall { Text(pc).font(.system(size: 9, weight: .bold)).foregroundStyle(pc == "CALL" ? p.pos : p.neg) }
                            Spacer()
                            Text(f.action).font(.caption2).foregroundStyle(actionTone(f.action))
                            Text(String(format: "%.1f%%", f.pctOfPort)).font(.caption2).foregroundStyle(p.textMuted).monospacedDigit()
                        }
                    }
                    ForEach(sm.people) { person in
                        HStack(spacing: 6) {
                            Text(person.name).font(.caption).foregroundStyle(p.textPrimary).lineLimit(1)
                            Spacer()
                            if let side = person.lastSide { Text(side).font(.caption2).foregroundStyle(side == "BUY" ? p.pos : p.neg) }
                            if let amt = person.lastAmountRange { Text(amt).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1) }
                        }
                    }
                    Text("13F lags ~45d · most names US-listed → leads, not trades.").font(.caption2).foregroundStyle(p.textMuted)
                }
            }
        }
    }

    private func actionTone(_ a: String) -> Color {
        let p = Theme.palette(scheme)
        switch a { case "NEW", "ADD": return p.pos; case "TRIM", "EXIT": return p.neg; default: return p.textMuted }
    }

    // MARK: fundamentals

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

    // MARK: dossier (current read / narrative)

    private func dossierCard(_ d: Dossier) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                if let cr = d.currentRead {
                    HStack(spacing: 8) {
                        Chip(text: "current read", tone: .teal)
                        Text(cr.title).font(.subheadline.weight(.medium)).foregroundStyle(p.textPrimary).lineLimit(2)
                        Spacer()
                    }
                    MarkdownText(text: cr.body)
                    if !cr.sources.isEmpty { sourceChips(cr.sources) }
                } else {
                    SectionTitle(text: "Dossier")
                    MarkdownText(text: d.bodyMarkdown)
                }
            }
        }
    }

    private func sourceChips(_ sources: [String]) -> some View {
        let p = Theme.palette(scheme)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(sources.enumerated()), id: \.offset) { _, s in
                    Text(s).font(.caption2).foregroundStyle(p.textMuted)
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(p.accent.opacity(0.08)))
                }
            }
        }
    }

    // MARK: trades

    @ViewBuilder private func tradesCard(_ d: Dossier) -> some View {
        if let trades = d.trades, !trades.isEmpty {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 8) {
                    SectionTitle(text: "Trades")
                    ForEach(trades) { t in
                        HStack(spacing: 8) {
                            Text(t.side).font(.caption.weight(.bold)).foregroundStyle(t.side == "BUY" ? p.accent : Color(hex: "fbbf24"))
                            Text("\(t.qty) @ \(Fmt.money(t.priceCents, d.currency))").font(.caption).foregroundStyle(p.textPrimary).monospacedDigit()
                            if let pnl = t.realizedPnlCents { Pnl(cents: pnl).font(.caption2) }
                            Spacer()
                            Text(relAgo(t.at) ?? "").font(.caption2).foregroundStyle(p.textMuted)
                        }
                    }
                }
            }
        }
    }

    // MARK: recent news

    @ViewBuilder private func newsCard(_ d: Dossier) -> some View {
        if let news = d.news, !news.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SectionTitle(text: "Recent news")
                    ForEach(news) { n in
                        if let url = URL(string: n.url) {
                            Link(destination: url) { newsRow(n) }.buttonStyle(.plain)
                        } else {
                            newsRow(n)
                        }
                    }
                }
            }
        }
    }

    private func newsRow(_ n: NewsItem) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 2) {
            Text(n.title).font(.caption).foregroundStyle(p.textPrimary)
            Text("\(n.publisher) · \(n.at)").font(.caption2).foregroundStyle(p.textMuted)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: data coverage (10-tier map)

    @ViewBuilder private func coverageCard(_ d: Dossier) -> some View {
        if let cov = d.coverage, !cov.isEmpty {
            let p = Theme.palette(scheme)
            Card {
                VStack(alignment: .leading, spacing: 6) {
                    SectionTitle(text: "Data coverage")
                    ForEach(cov) { c in
                        HStack(alignment: .top, spacing: 8) {
                            Circle()
                                .fill(c.status == "live" ? p.pos : c.status == "partial" ? Color(hex: "f59e0b") : p.textMuted.opacity(0.3))
                                .frame(width: 8, height: 8).padding(.top, 4)
                            Text("T\(c.tier) \(c.name)").font(.caption).foregroundStyle(p.textPrimary).frame(width: 110, alignment: .leading)
                            Text(c.detail).font(.caption2).foregroundStyle(p.textMuted).frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                    Text("Green = live · amber = partial · grey = not yet wired.").font(.caption2).foregroundStyle(p.textMuted)
                }
            }
        }
    }

    // MARK: price alerts on this stock (both members)

    @ViewBuilder private func alertsCard() -> some View {
        if !alerts.isEmpty {
            Card {
                VStack(alignment: .leading, spacing: 10) {
                    SectionTitle(text: "Price alerts")
                    ForEach(alerts) { a in alertRow(a) }
                }
            }
        }
    }

    private func alertRow(_ a: PriceAlert) -> some View {
        let p = Theme.palette(scheme)
        let unit = (a.currency != "CAD") ? a.currency : "$"
        let price = "\(unit)\(String(format: "%.2f", Double(a.thresholdCents) / 100))"
        let phrase = (a.direction == "above" ? "rises above " : "falls below ") + price
        let isMine = a.mine ?? false
        return HStack(spacing: 10) {
            ownerAvatar(a.ownerKey, size: 26)
            VStack(alignment: .leading, spacing: 1) {
                Text("\(a.owner ?? "A member")\(isMine ? " (you)" : "")")
                    .font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary)
                Text("when it \(phrase)").font(.caption2).foregroundStyle(p.textMuted)
                if let n = a.note, !n.isEmpty {
                    Text("“\(n)”").font(.caption2).italic().foregroundStyle(p.textMuted.opacity(0.8))
                }
            }
            Spacer()
            if isMine {
                Button { Task { await deleteAlert(a) } } label: {
                    Image(systemName: "trash").font(.caption).foregroundStyle(p.neg)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func ownerAvatar(_ key: String?, size: CGFloat) -> some View {
        let p = Theme.palette(scheme)
        return Group {
            if key == "cam" || key == "graham" { Image(key!).resizable().scaledToFill() }
            else { Image(systemName: "person.fill").font(.system(size: size * 0.5)).foregroundStyle(p.accent) }
        }
        .frame(width: size, height: size)
        .background(Circle().fill(p.accent.opacity(0.14)))
        .clipShape(Circle())
    }

    private func loadAlerts() async { alerts = await APIClient.shared.priceAlerts(symbol: symbol) }

    private func deleteAlert(_ a: PriceAlert) async {
        let res = await APIClient.shared.deletePriceAlert(id: a.id)
        if res.ok { alerts.removeAll { $0.id == a.id } } else { actionNote = res.error }
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

    // MARK: small formatters

    private func fmt2(_ v: Double) -> String { String(format: "%.2f", v) }
    private func fmtRev(_ v: Double) -> String {
        if v >= 1e9 { return String(format: "$%.1fB", v / 1e9) }
        if v >= 1e6 { return String(format: "$%.0fM", v / 1e6) }
        return "$\(Int(v))"
    }

    private static let isoFrac: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let isoPlain = ISO8601DateFormatter()
    private static let ymd: DateFormatter = {
        let f = DateFormatter(); f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX"); f.timeZone = TimeZone(identifier: "America/Toronto"); return f
    }()
    private func parseDate(_ s: String?) -> Date? {
        guard let s, !s.isEmpty else { return nil }
        return Self.isoFrac.date(from: s) ?? Self.isoPlain.date(from: s) ?? Self.ymd.date(from: s)
    }
    /// "today" / "3d ago" / "2w ago" / "4mo ago" — mirrors the web's agoShort.
    private func relAgo(_ s: String?) -> String? {
        guard let date = parseDate(s) else { return nil }
        let days = max(0, Calendar.current.dateComponents([.day], from: date, to: Date()).day ?? 0)
        if days < 1 { return "today" }
        if days < 14 { return "\(days)d ago" }
        if days < 60 { return "\(Int((Double(days) / 7).rounded()))w ago" }
        return "\(Int((Double(days) / 30).rounded()))mo ago"
    }
}

// MARK: - Set price alert (The Wire, Phase 2)

// A sheet to set "ping me when SYMBOL crosses $X". The direction auto-suggests from
// the typed target vs the current price; the server still validates it (refusing a
// level already met) and returns the guardrail message verbatim.
struct SetPriceAlertSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    let symbol: String
    let name: String
    let currency: String?
    let lastCents: Int?

    @State private var priceText = ""
    @State private var direction = "above"
    @State private var note = ""
    @State private var busy = false
    @State private var error: String?

    private var unit: String { (currency != nil && currency != "CAD") ? currency! : "$" }

    var body: some View {
        let p = Theme.palette(scheme)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        StockLogo(symbol: symbol, size: 40)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(name).font(.headline).foregroundStyle(p.textPrimary).lineLimit(1)
                            if let last = lastCents {
                                Text("Now \(Fmt.money(last, currency))").font(.caption).foregroundStyle(p.textMuted)
                            }
                        }
                        Spacer()
                    }

                    Picker("", selection: $direction) {
                        Text("Rises above").tag("above")
                        Text("Falls below").tag("below")
                    }
                    .pickerStyle(.segmented)

                    Card {
                        HStack(spacing: 6) {
                            Text(unit).font(.title3.weight(.bold)).foregroundStyle(p.textMuted)
                            TextField(lastCents.map { "e.g. \(String(format: "%.2f", Double($0) / 100))" } ?? "Target price", text: $priceText)
                                .keyboardType(.decimalPad)
                                .font(.title3.weight(.bold))
                                .foregroundStyle(p.textPrimary)
                        }
                    }

                    Card {
                        TextField("Note (optional) — e.g. near my entry", text: $note)
                            .font(.subheadline).foregroundStyle(p.textPrimary)
                    }

                    if let error {
                        Text(error).font(.caption).foregroundStyle(p.neg)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button { Task { await submit() } } label: {
                        HStack(spacing: 8) {
                            if busy { ProgressView().tint(Color(hex: "04110d")) }
                            Text(busy ? "Setting…" : "Set alert")
                                .font(.system(size: 15, weight: .bold, design: .rounded))
                        }
                        .foregroundStyle(Color(hex: "04110d"))
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Capsule().fill(p.accent))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy)

                    Text("One-shot: it fires once when the price crosses, then clears. Manage all your alerts in More → Price alerts.")
                        .font(.caption2).foregroundStyle(p.textMuted)
                }
                .padding(16)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle("Alert · \(symbol)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
        .onChange(of: priceText) { _, new in
            if let d = Double(new.trimmingCharacters(in: .whitespaces)), let last = lastCents {
                direction = Int((d * 100).rounded()) >= last ? "above" : "below"
            }
        }
    }

    private func submit() async {
        guard let dollars = Double(priceText.trimmingCharacters(in: .whitespaces)), dollars > 0 else {
            error = "Enter a target price."; return
        }
        busy = true; error = nil
        let cents = Int((dollars * 100).rounded())
        let res = await APIClient.shared.createPriceAlert(
            symbol: symbol, direction: direction, thresholdCents: cents, currency: currency ?? "CAD", note: note)
        busy = false
        if res.ok { dismiss() } else { error = res.error }
    }
}

// MARK: - Long-press-to-share (D61) — shared by the stock panels AND the Wire cards

/// Light haptics for the share gesture (recreates the old context-menu lift feel).
private enum Haptics {
    static func rigid() { UIImpactFeedbackGenerator(style: .rigid).impactOccurred() }
}

extension View {
    /// Long-press to share: the view grows while held, then fires `onShare` + a single
    /// haptic only once the press completes (the share trigger). No haptic on touch-down —
    /// `pressing:` fires the instant a finger lands, which is indistinguishable from the
    /// start of a scroll, so a tap there buzzed on every scroll. The tight `maximumDistance`
    /// lets a drag cancel the press at once, so it never fights a scroll or page swipe.
    /// Inert when `enabled` is false. Used by the stock panels and the Wire feed.
    func shareLongPress(enabled: Bool, onShare: @escaping () -> Void) -> some View {
        ShareLongPressBox(enabled: enabled, onShare: onShare) { self }
    }
}

/// A plain View wrapper (NOT a ViewModifier — the app's own `Content` type, the content
/// layer, shadows SwiftUI's `ViewModifier.Content` associated type) that adds the grow
/// + haptic + long-press-to-share behaviour.
private struct ShareLongPressBox<Wrapped: View>: View {
    let enabled: Bool
    let onShare: () -> Void
    let wrapped: Wrapped
    @State private var pressing = false

    init(enabled: Bool, onShare: @escaping () -> Void, @ViewBuilder content: () -> Wrapped) {
        self.enabled = enabled
        self.onShare = onShare
        self.wrapped = content()
    }

    var body: some View {
        wrapped
            .scaleEffect(pressing ? 1.03 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.72), value: pressing)
            .onLongPressGesture(minimumDuration: 0.45, maximumDistance: 10, pressing: { p in
                guard enabled else { return }
                pressing = p
            }, perform: {
                guard enabled else { return }
                pressing = false
                Haptics.rigid()
                onShare()
            })
    }
}

/// Wraps a dossier panel: a long-press makes it grow + fires a haptic (like the old
/// context-menu lift), then opens the share composer directly — no menu tap. `.id()`
/// doubles as the scroll anchor for deep-linked shares; `flashing` briefly outlines it
/// on arrival.
private struct ShareablePanel<Content: View>: View {
    let panel: PanelKind
    let enabled: Bool
    let flashing: Bool
    let onShare: () -> Void
    let content: Content

    init(panel: PanelKind, enabled: Bool, flashing: Bool,
         onShare: @escaping () -> Void, @ViewBuilder content: () -> Content) {
        self.panel = panel
        self.enabled = enabled
        self.flashing = flashing
        self.onShare = onShare
        self.content = content()
    }

    var body: some View {
        content
            .id(panel.rawValue)
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(Theme.brandAccent, lineWidth: flashing ? 2 : 0)
                    .allowsHitTesting(false)
                    .animation(.easeInOut(duration: 0.3), value: flashing)
            )
            .shareLongPress(enabled: enabled, onShare: onShare)
    }
}
