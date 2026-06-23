import SwiftUI

// THE HUNT — the heart of the app, redesigned (design_handoff_the_hunt_ios) as a
// HEAT-RANKED discovery feed: a brand row, a focal hunt bar, a directed-hunt banner,
// a sort toolbar, and big "heat cards" (rank · logo · confidence gauge · price +
// sparkline · heat meter · thesis). Tapping a card pushes a "top pick" focus screen
// (hero + large 30-day chart + gauge + thesis + a "next up" list).
//
// The handoff is spec'd DARK-ONLY, but GRQ forces a per-member theme (Cam = light,
// Graham = dark — ThemeManager), so EVERY surface here is driven by Theme.palette(scheme)
// and the only fixed colours are the theme-AGNOSTIC heat ramp (Theme.heatColor, OKLCH
// L≈0.72 — reads on both) and the brand gradients. Heat/sparkline/change30d come from
// the hunt feed and degrade gracefully (heat falls back to an in-view compute; the
// sparkline simply hides) when a field is absent.

struct HuntView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var finds: [HuntFind] = []
    @State private var brief: String?
    @State private var loaded = false
    @State private var briefDraft = ""
    @State private var queuedNote: String?
    @State private var share: HuntShare?
    @State private var sortKey: HuntSort = .heat
    @State private var killed = false
    @State private var glow = false      // hunt-bar living glow (huntGlow)
    @State private var pulse = false     // HALT status dot ring (pulseDot)
    @FocusState private var editingBrief: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var isMember: Bool { auth.currentUser?.role == .member }

    enum HuntSort: String, CaseIterable {
        case heat = "HEAT", change = "CHANGE", confidence = "CONFIDENCE"
    }

    // Heat ranks the board (the design's organizing metric). `ranked` drives the rank
    // badges; `shown` is what we render (re-sorted when the user picks another key).
    // Sort descending by `key`, with the server's feed order (newest-first) as a STABLE
    // tiebreak — Swift's sort isn't guaranteed stable, so equal-heat names would otherwise
    // shuffle between renders. Keeps the board reproducible and matched to the web.
    private func stableSort(_ key: @escaping (HuntFind) -> Double) -> [HuntFind] {
        finds.enumerated()
            .sorted { a, b in
                let ka = key(a.element), kb = key(b.element)
                return ka == kb ? a.offset < b.offset : ka > kb
            }
            .map { $0.element }
    }
    private var ranked: [HuntFind] { stableSort { Double($0.resolvedHeat) } }
    private var shown: [HuntFind] {
        switch sortKey {
        case .heat:       return ranked
        case .change:     return stableSort { $0.change30d ?? -9 }
        case .confidence: return stableSort { Double($0.confidence ?? -1) }
        }
    }
    private func rank(of f: HuntFind) -> Int { (ranked.firstIndex { $0.sym == f.sym } ?? 0) + 1 }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                BrandHeader(title: "THE HUNT")
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 12) {
                        titleBlock
                        if isMember { huntBar }
                        if let brief, !brief.isEmpty {
                            DirectedBanner(brief: brief, onClear: isMember ? { Task { await refresh(nil) } } : nil)
                        }
                        if let queuedNote { noteView(queuedNote) }

                        if !loaded {
                            ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 60)
                        } else if finds.isEmpty {
                            EmptyState(title: "The hunt is quiet",
                                       message: "No leads on the board yet. Pull to refresh, or brief the agent on what to look for.")
                        } else {
                            sortToolbar
                            ForEach(shown) { f in
                                HeatCard(find: f, rank: rank(of: f), isTop: rank(of: f) == 1,
                                         isMember: isMember, ranked: ranked,
                                         onWatch: { Task { await watch(f) } },
                                         onDismiss: { Task { await dismiss(f) } },
                                         onShare: { share = HuntShare(symbol: f.sym, name: f.name) })
                            }
                        }

                        Text("The agent can't trade these itself — nothing trades outside the guardrailed universe. Targets are hypotheses, not promises.")
                            .font(.caption2).foregroundStyle(Theme.palette(scheme).textMuted.opacity(0.7))
                            .padding(.top, 6)
                    }
                    .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 32)
                }
                .refreshable { await load() }
                .scrollDismissesKeyboard(.interactively)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            // Share a find with the other member (from the card's watch/dismiss popup).
            .sheet(item: $share) { s in
                ShareComposerSheet(symbol: s.symbol, name: s.name, panel: nil).environmentObject(auth)
            }
        }
        .task { if !loaded { await load() } }
    }

    // MARK: title + HALT status

    // The "THE HUNT" wordmark now lives in the shared BrandHeader, so this is just the
    // tagline + the HALT status (no duplicate title).
    private var titleBlock: some View {
        let p = Theme.palette(scheme)
        return HStack(alignment: .center) {
            Text("AI sweeps North America for names ready to pop.")
                .font(.system(size: 12.5)).foregroundStyle(p.textMuted)
            Spacer()
            if killed { haltBadge }
        }
        .padding(.top, 2)
    }

    // The kill-switch HALT indicator (pulsing dot) — kept on the feed so a halt is
    // visible without opening More (the brand row moved to the shared BrandHeader).
    private var haltBadge: some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 5) {
            ZStack {
                // pulseDot — an expanding ring radiating off the live HALT dot.
                Circle().stroke(p.neg, lineWidth: 1.5).frame(width: 6, height: 6)
                    .scaleEffect(reduceMotion ? 1 : (pulse ? 2.6 : 1))
                    .opacity(reduceMotion ? 0 : (pulse ? 0 : 0.7))
                Circle().fill(p.neg).frame(width: 6, height: 6)
            }
            Text("HALT").font(.caption2.weight(.bold)).foregroundStyle(p.neg)
        }
        .padding(.horizontal, 9).padding(.vertical, 5)
        .background(Capsule().fill(p.neg.opacity(0.14)))
        .overlay(Capsule().strokeBorder(p.neg.opacity(0.4), lineWidth: 1))
        .onAppear {
            if !reduceMotion {
                withAnimation(.easeOut(duration: 2).repeatForever(autoreverses: false)) { pulse = true }
            }
        }
    }

    // MARK: hunt bar (focal element)

    private var huntBar: some View {
        let p = Theme.palette(scheme)
        return VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "scope")
                    .font(.system(size: 16, weight: .semibold)).foregroundStyle(p.accent)
                    .frame(width: 38, height: 38)
                    .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(p.accent.opacity(0.14)))
                    .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).strokeBorder(p.accent.opacity(0.3), lineWidth: 1))
                VStack(alignment: .leading, spacing: 2) {
                    TextField("Find me stocks ready to pop", text: $briefDraft)
                        .font(.system(size: 14.5, weight: .semibold)).foregroundStyle(p.textPrimary)
                        .focused($editingBrief).submitLabel(.search)
                        .onSubmit { Task { await refresh(briefDraft) } }
                    Text(editingBrief ? "Return runs it · leave blank to go broad"
                                       : "Tap to brief the hunt — or leave blank to go broad")
                        .font(.system(size: 11)).foregroundStyle(p.textMuted)
                }
                Spacer(minLength: 0)
            }
            Button { editingBrief = false; Task { await refresh(briefDraft) } } label: {
                Text("⚡ HUNT")
                    .font(.system(size: 14, weight: .bold, design: .rounded))
                    .foregroundStyle(Color(hex: "04110d"))
                    .frame(maxWidth: .infinity).padding(.vertical, 13)
                    .background(Capsule().fill(LinearGradient(colors: [Color(hex: "5af0d6"), Color(hex: "22c2a8")],
                                                              startPoint: .top, endPoint: .bottom)))
                    .shadow(color: p.accent.opacity(0.4), radius: 12, y: 4)
            }
            .buttonStyle(.plain)
        }
        .padding(14)
        .background(RoundedRectangle(cornerRadius: 15, style: .continuous)
            .fill(LinearGradient(colors: [p.cardHi, p.cardBg], startPoint: .topLeading, endPoint: .bottomTrailing)))
        .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous)
            .strokeBorder(LinearGradient(colors: [Color(hex: "34e0c4"), Color(hex: "7c5cff"), Color(hex: "ff7a45")],
                                         startPoint: .leading, endPoint: .trailing), lineWidth: 1.5)
            .opacity(reduceMotion ? 0.9 : (glow ? 1.0 : 0.5)))
        // huntGlow — a slow living glow on the focal hunt bar (handoff Motion). Held static
        // when the user has Reduce Motion on.
        .shadow(color: p.accent.opacity(reduceMotion ? 0.22 : (glow ? 0.5 : 0.16)), radius: 18, y: 8)
        .onAppear {
            if !reduceMotion {
                withAnimation(.easeInOut(duration: 4).repeatForever(autoreverses: true)) { glow = true }
            }
        }
    }

    private var sortToolbar: some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 6) {
            (Text("\(finds.count) ").font(.caption.weight(.bold)).foregroundStyle(p.textPrimary)
             + Text("hot names · sorted by ").font(.caption).foregroundStyle(p.textMuted))
            Menu {
                ForEach(HuntSort.allCases, id: \.self) { k in
                    Button(k.rawValue.capitalized) { sortKey = k }
                }
            } label: {
                HStack(spacing: 2) {
                    Text(sortKey.rawValue).font(.caption.weight(.bold)).foregroundStyle(p.accentText)
                    Image(systemName: "chevron.down").font(.system(size: 9, weight: .bold)).foregroundStyle(p.accentText)
                }
            }
            Spacer()
            if isMember {
                Button { Task { await refresh(nil) } } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .bold)).foregroundStyle(p.accent)
                        .padding(8).background(Circle().fill(p.accent.opacity(0.12)))
                }.buttonStyle(.plain)
            }
        }
        .padding(.top, 4)
    }

    private func noteView(_ t: String) -> some View {
        Text(t).font(.caption).foregroundStyle(Theme.palette(scheme).accentText)
    }

    // MARK: data + actions

    private func load() async {
        async let huntCall = APIClient.shared.hunt()
        async let settingsCall = APIClient.shared.settings()
        if let r = await huntCall {
            finds = r.finds
            brief = r.brief
            if briefDraft.isEmpty { briefDraft = r.brief ?? "" }
        }
        killed = (await settingsCall)?.killSwitch ?? false
        loaded = true
    }

    private func refresh(_ b: String?) async {
        queuedNote = nil
        switch await APIClient.shared.refreshHunt(brief: b) {
        case .success:
            brief = (b?.isEmpty == false) ? b : nil
            if b?.isEmpty != false { briefDraft = "" }
            queuedNote = "Hunt queued — the agent runs it on its next tick; pull to refresh shortly."
        case .failure(let m):
            queuedNote = m
        }
    }

    private func watch(_ f: HuntFind) async {
        guard isMember else { return }
        let res = await APIClient.shared.watch(f.sym, name: f.name)
        if res.ok, let i = finds.firstIndex(where: { $0.sym == f.sym }) {
            finds[i].watch = "watching"
        } else if let m = res.error { queuedNote = m }
    }

    private func dismiss(_ f: HuntFind) async {
        guard isMember else { return }
        let res = await APIClient.shared.universeAction(f.sym, "dismiss", extra: ["name": f.name])
        if res.ok {
            finds.removeAll { $0.sym == f.sym }
        } else if let m = res.error { queuedNote = m }
    }
}

// MARK: - Heat card (the repeating feed unit)

/// A find a member chose to share with the other member, from the card's popup.
private struct HuntShare: Identifiable { let symbol: String; let name: String?; var id: String { symbol } }

struct HeatCard: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    let find: HuntFind
    let rank: Int
    let isTop: Bool
    let isMember: Bool
    let ranked: [HuntFind]
    let onWatch: () -> Void
    let onDismiss: () -> Void
    let onShare: () -> Void

    var body: some View {
        let p = Theme.palette(scheme)
        let heat = find.resolvedHeat
        let hc = Theme.heatColor(Double(heat))
        let up = (find.change30d ?? 0) >= 0
        let changeC = up ? p.pos : p.neg

        return VStack(alignment: .leading, spacing: 12) {
            // The info area is the tap target → the "top pick" focus screen.
            NavigationLink { HuntFocusView(finds: ranked, focused: find.sym) } label: {
                VStack(alignment: .leading, spacing: 12) {
                    headerRow(p, hc, heat)
                    priceSparkRow(p, changeC)
                    heatRow(p, hc, heat)
                    thesis(p)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if let sources = find.sources, !sources.isEmpty { sourceChips(sources, p) }

            Divider().overlay(p.cardBorder.opacity(0.5))
            actions(p)
        }
        .padding(EdgeInsets(top: 15, leading: 18, bottom: 15, trailing: 15))
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(LinearGradient(colors: [p.cardHi, p.cardBg], startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(alignment: .leading) {
                    Rectangle().fill(hc).frame(width: 3).shadow(color: hc.opacity(0.7), radius: 4)
                }
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        )
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
        .shadow(color: p.glow, radius: 14, y: 8)
        .contextMenu {
            if isMember {
                if find.watch != "watching" && find.watch != "universe" {
                    Button { onWatch() } label: { Label("Watch", systemImage: "star") }
                }
                Button { onShare() } label: {
                    Label("Share with \(memberName(otherMemberKey(for: auth.currentUser?.email)))", systemImage: "paperplane")
                }
                Button(role: .destructive) { onDismiss() } label: { Label("Dismiss", systemImage: "xmark.circle") }
            }
        }
    }

    // 1 — rank · logo · ticker (+ hottest) · name·tag · confidence gauge
    private func headerRow(_ p: Palette, _ hc: Color, _ heat: Int) -> some View {
        let htc = Theme.heatTextColor(Double(heat), scheme)
        return HStack(alignment: .center, spacing: 12) {
            VStack(spacing: 0) {
                Text(String(format: "%02d", rank))
                    .font(.system(size: 22, weight: .black, design: .rounded)).monospacedDigit()
                    .foregroundStyle(htc)
                Text("RANK").font(.system(size: 8, weight: .bold)).tracking(0.5).foregroundStyle(p.textMuted)
            }
            .frame(width: 30)
            HeatLogoTile(symbol: find.sym, url: find.logoUrl, heat: heat, size: 36)
            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(find.sym).font(.system(size: 18, weight: .heavy, design: .rounded))
                        .foregroundStyle(p.textPrimary).lineLimit(1).minimumScaleFactor(0.8)
                    if isTop { hottestBadge }
                }
                Text(subtitle).font(.system(size: 10.5)).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer(minLength: 4)
            ConfidenceGauge(confidence: find.confidence, size: 48)
        }
    }

    // 2 — price + change% (30-day trend) beside the sparkline
    private func priceSparkRow(_ p: Palette, _ changeC: Color) -> some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if let cur = find.cur {
                        Text(Fmt.money(cur, find.currency))
                            .font(.system(size: 16, weight: .semibold, design: .monospaced))
                            .foregroundStyle(p.textPrimary).lineLimit(1)
                    }
                    if let ch = find.change30d {
                        Text(huntPct(ch)).font(.system(size: 12, weight: .bold, design: .monospaced)).foregroundStyle(changeC)
                    }
                }
                Text("30-DAY TREND").font(.system(size: 8.5, weight: .bold)).tracking(0.5).foregroundStyle(p.textMuted)
            }
            if let spark = find.spark, spark.count >= 2 {
                HuntSparkline(points: spark, color: changeC).frame(maxWidth: .infinity, minHeight: 38, maxHeight: 38)
            } else {
                Spacer(minLength: 0)
            }
        }
    }

    // 3 — heat label · meter · score
    private func heatRow(_ p: Palette, _ hc: Color, _ heat: Int) -> some View {
        HStack(spacing: 10) {
            Text("HEAT").font(.system(size: 9, weight: .bold)).tracking(0.5).foregroundStyle(p.textMuted)
            HeatMeter(heat: heat, color: hc, height: 7)
            Text("\(heat)").font(.system(size: 13, weight: .bold, design: .monospaced))
                .foregroundStyle(Theme.heatTextColor(Double(heat), scheme))
        }
    }

    // 4 — thesis (2-line clamp; inline markdown)
    private func thesis(_ p: Palette) -> some View {
        let flat = find.body.replacingOccurrences(of: "\n", with: " ")
        let attr = (try? AttributedString(markdown: flat,
            options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(flat)
        return Text(attr).font(.system(size: 12.5)).foregroundStyle(p.textPrimary.opacity(0.85))
            .lineLimit(2).multilineTextAlignment(.leading)
    }

    // 5 — full dossier + watch toggle
    private func actions(_ p: Palette) -> some View {
        HStack(spacing: 12) {
            NavigationLink { StockDetailView(symbol: find.sym) } label: {
                Text("full dossier →").font(.caption.weight(.bold)).foregroundStyle(Color(hex: "04110d"))
                    .frame(maxWidth: .infinity).padding(.vertical, 10)
                    .background(Capsule().fill(LinearGradient(colors: [Color(hex: "5af0d6"), Color(hex: "22c2a8")],
                                                              startPoint: .top, endPoint: .bottom)))
            }.buttonStyle(.plain)
            if isMember { WatchToggle(watch: find.watch, onWatch: onWatch) }
        }
    }

    private var hottestBadge: some View {
        Text("▲ HOTTEST").font(.system(size: 8.5, weight: .bold)).foregroundStyle(Theme.hot(scheme))
            .padding(.horizontal, 6).padding(.vertical, 3)
            .background(Capsule().fill(Color(hex: "ff7a45").opacity(scheme == .dark ? 0.16 : 0.12)))
    }

    private var subtitle: String {
        if let tag = find.tag, !tag.isEmpty { return "\(find.name) · \(tag)" }
        return find.name
    }

    private func sourceChips(_ sources: [String], _ p: Palette) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(sources.prefix(8).enumerated()), id: \.offset) { _, s in
                    Text(s).font(.caption2).foregroundStyle(p.accentText.opacity(0.8))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(p.accent.opacity(0.08)))
                }
            }
        }
    }
}

// MARK: - Top Pick / Stock Focus (Screen 2)

struct HuntFocusView: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var auth: AuthManager
    let finds: [HuntFind]            // heat-ranked
    @State var focused: String       // ticker in focus
    @State private var localWatch: [String: String] = [:]

    private var isMember: Bool { auth.currentUser?.role == .member }
    private var current: HuntFind? { finds.first { $0.sym == focused } }
    private var rank: Int { (finds.firstIndex { $0.sym == focused } ?? 0) + 1 }
    private var nextUp: [HuntFind] { finds.filter { $0.sym != focused } }

    var body: some View {
        let p = Theme.palette(scheme)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                topRow(p)
                if let f = current { hero(f, p) }
                if !nextUp.isEmpty { nextUpSection(p) }
            }
            .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 32)
        }
        .background(focusBackground.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }

    private var focusBackground: some View {
        let p = Theme.palette(scheme)
        return ZStack {
            p.bodyBg
            RadialGradient(colors: [Color(hex: "ff7a45").opacity(scheme == .dark ? 0.12 : 0.06), .clear],
                           center: .topTrailing, startRadius: 8, endRadius: 440)
        }
    }

    private func topRow(_ p: Palette) -> some View {
        HStack {
            Button { dismiss() } label: {
                HStack(spacing: 3) {
                    Image(systemName: "chevron.left").font(.system(size: 13, weight: .bold))
                    Text("Back to feed").font(.subheadline.weight(.semibold))
                }.foregroundStyle(p.accentText)
            }.buttonStyle(.plain)
            Spacer()
            Text("IBKR-PAPER").font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(p.textMuted)
                .padding(.horizontal, 9).padding(.vertical, 5)
                .background(Capsule().fill(p.cardBg))
                .overlay(Capsule().strokeBorder(p.cardBorder, lineWidth: 1))
        }
    }

    private func hero(_ f: HuntFind, _ p: Palette) -> some View {
        let heat = f.resolvedHeat
        let hc = Theme.heatColor(Double(heat))
        let htc = Theme.heatTextColor(Double(heat), scheme)
        let up = (f.change30d ?? 0) >= 0
        let changeC = up ? p.pos : p.neg
        let orange = Color(hex: "ff7a45")

        return VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 8) {
                if rank == 1 {
                    Text("▲ HOTTEST PICK").font(.system(size: 9.5, weight: .bold)).foregroundStyle(Theme.hot(scheme))
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(orange.opacity(scheme == .dark ? 0.16 : 0.12)))
                }
                Text("RANK \(String(format: "%02d", rank)) · HEAT \(heat)")
                    .font(.system(size: 10.5, weight: .bold, design: .monospaced)).foregroundStyle(p.textMuted)
                Spacer()
            }
            HStack(spacing: 12) {
                HeatLogoTile(symbol: f.sym, url: f.logoUrl, heat: heat, size: 48)
                VStack(alignment: .leading, spacing: 2) {
                    Text(f.sym).font(.system(size: 32, weight: .black, design: .rounded))
                        .foregroundStyle(p.textPrimary).lineLimit(1).minimumScaleFactor(0.6)
                    Text(subtitle(f)).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                }
                Spacer()
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let cur = f.cur {
                    Text(Fmt.money(cur, f.currency))
                        .font(.system(size: 26, weight: .bold, design: .monospaced)).foregroundStyle(p.textPrimary)
                }
                if let ch = f.change30d {
                    Text(huntPct(ch)).font(.system(size: 14, weight: .bold, design: .monospaced)).foregroundStyle(changeC)
                }
            }
            chartPanel(f, p, changeC)
            HStack(alignment: .center, spacing: 16) {
                ConfidenceGauge(confidence: f.confidence, size: 80)
                VStack(alignment: .leading, spacing: 6) {
                    Text("HEAT SCORE").font(.system(size: 9, weight: .bold)).tracking(0.5).foregroundStyle(p.textMuted)
                    Text("\(heat)").font(.system(size: 22, weight: .bold, design: .monospaced)).foregroundStyle(htc)
                    HeatMeter(heat: heat, color: hc, height: 9)
                }
                Spacer(minLength: 0)
            }
            MarkdownText(text: f.body)
            HStack(spacing: 12) {
                NavigationLink { StockDetailView(symbol: f.sym) } label: {
                    Text("full dossier →").font(.subheadline.weight(.bold)).foregroundStyle(Color(hex: "04110d"))
                        .frame(maxWidth: .infinity).padding(.vertical, 13)
                        .background(Capsule().fill(LinearGradient(colors: [Color(hex: "5af0d6"), Color(hex: "22c2a8")],
                                                                  startPoint: .top, endPoint: .bottom)))
                }.buttonStyle(.plain)
                if isMember { WatchToggle(watch: watchState(f), labelled: true, onWatch: { Task { await watch(f) } }) }
            }
        }
        .padding(18)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(LinearGradient(colors: [p.cardHi, p.cardBg], startPoint: .topLeading, endPoint: .bottomTrailing))
                .overlay(alignment: .top) {
                    LinearGradient(colors: [p.accent, hc], startPoint: .leading, endPoint: .trailing).frame(height: 3)
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        )
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(orange.opacity(0.18), lineWidth: 1))
        .shadow(color: orange.opacity(0.10), radius: 30, y: 10)
    }

    private func chartPanel(_ f: HuntFind, _ p: Palette, _ changeC: Color) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("30-DAY PRICE").font(.system(size: 9, weight: .bold)).tracking(0.5).foregroundStyle(p.textMuted)
                Spacer()
                if let ch = f.change30d {
                    Text(huntPct(ch)).font(.system(size: 10, weight: .bold, design: .monospaced)).foregroundStyle(changeC)
                }
            }
            if let spark = f.spark, spark.count >= 2 {
                HuntSparkline(points: spark, color: changeC, lineWidth: 2.5, gridlines: true).frame(height: 120)
            } else {
                Text("price history coming soon")
                    .font(.caption).foregroundStyle(p.textMuted)
                    .frame(maxWidth: .infinity, minHeight: 120)
            }
        }
        .padding(13)
        .background(RoundedRectangle(cornerRadius: 13, style: .continuous)
            .fill(Color.black.opacity(scheme == .dark ? 0.18 : 0.04)))
    }

    private func nextUpSection(_ p: Palette) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("NEXT UP").font(.system(size: 12, weight: .semibold, design: .rounded)).tracking(1).foregroundStyle(p.textMuted)
            ForEach(nextUp) { f in
                Button { withAnimation(.easeInOut(duration: 0.2)) { focused = f.sym } } label: { nextUpRow(f, p) }
                    .buttonStyle(.plain)
            }
        }
    }

    private func nextUpRow(_ f: HuntFind, _ p: Palette) -> some View {
        let heat = f.resolvedHeat
        let hc = Theme.heatColor(Double(heat))
        let htc = Theme.heatTextColor(Double(heat), scheme)
        let r = (finds.firstIndex { $0.sym == f.sym } ?? 0) + 1
        let up = (f.change30d ?? 0) >= 0
        return HStack(spacing: 12) {
            Text(String(format: "%02d", r)).font(.system(size: 14, weight: .black, design: .rounded)).foregroundStyle(htc).frame(width: 22)
            HeatLogoTile(symbol: f.sym, url: f.logoUrl, heat: heat, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(f.sym).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary).lineLimit(1)
                HStack(spacing: 6) {
                    if let cur = f.cur { Text(Fmt.money(cur, f.currency)).font(.system(size: 11, design: .monospaced)).foregroundStyle(p.textMuted) }
                    if let ch = f.change30d { Text(huntPct(ch)).font(.system(size: 11, weight: .semibold, design: .monospaced)).foregroundStyle(up ? p.pos : p.neg) }
                }
            }
            Spacer(minLength: 6)
            if let spark = f.spark, spark.count >= 2 {
                HuntSparkline(points: spark, color: up ? p.pos : p.neg, showDot: false).frame(width: 56, height: 24)
            }
            Text("\(heat)").font(.system(size: 13, weight: .bold, design: .monospaced)).foregroundStyle(htc)
        }
        .padding(.init(top: 10, leading: 12, bottom: 10, trailing: 14))
        .background(
            RoundedRectangle(cornerRadius: 16, style: .continuous).fill(p.cardBg)
                .overlay(alignment: .leading) { Rectangle().fill(hc).frame(width: 3) }
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        )
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
    }

    private func subtitle(_ f: HuntFind) -> String {
        if let tag = f.tag, !tag.isEmpty { return "\(f.name) · \(tag)" }
        return f.name
    }
    private func watchState(_ f: HuntFind) -> String? { localWatch[f.sym] ?? f.watch }

    private func watch(_ f: HuntFind) async {
        guard isMember else { return }
        let res = await APIClient.shared.watch(f.sym, name: f.name)
        if res.ok { localWatch[f.sym] = "watching" }
    }
}

// MARK: - Shared hunt components (gauge · heat meter · sparkline · logo tile · watch)

/// Radial confidence ring (0–100). Teal progress arc from 12-o'clock, palette-driven so
/// it reads in both themes. Mirrors the handoff's r=22 / round-cap SVG gauge.
struct ConfidenceGauge: View {
    @Environment(\.colorScheme) private var scheme
    let confidence: Int?
    var size: CGFloat = 48
    var body: some View {
        let p = Theme.palette(scheme)
        let frac = confidence.map { max(0, min(1, Double($0) / 100)) } ?? 0   // no arc when unknown
        let ring = size * 0.115
        return ZStack {
            Circle().stroke(p.textMuted.opacity(0.18), lineWidth: ring)
            Circle().trim(from: 0, to: frac)
                .stroke(p.accent, style: StrokeStyle(lineWidth: ring, lineCap: .round))
                .rotationEffect(.degrees(-90))
                .shadow(color: p.accent.opacity(0.5), radius: 3)
            VStack(spacing: 0) {
                Text(confidence.map(String.init) ?? "—")
                    .font(.system(size: size * 0.30, weight: .bold, design: .monospaced)).foregroundStyle(p.textPrimary)
                Text(size >= 70 ? "CONFIDENCE" : "CONF").font(.system(size: max(7, size * 0.11), weight: .bold)).foregroundStyle(p.textMuted)
            }
        }
        .frame(width: size, height: size)
    }
}

/// Heat bar — accent→heatColor gradient fill, width = heat%. Track is palette-muted.
struct HeatMeter: View {
    @Environment(\.colorScheme) private var scheme
    let heat: Int
    let color: Color
    var height: CGFloat = 7
    var body: some View {
        let p = Theme.palette(scheme)
        let frac = max(0, min(1, Double(heat) / 100))
        return GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(p.textMuted.opacity(0.14))
                Capsule().fill(LinearGradient(colors: [p.accent, color], startPoint: .leading, endPoint: .trailing))
                    .frame(width: max(height, geo.size.width * frac))
            }
        }
        .frame(height: height)
    }
}

/// 30-day sparkline — area + line + glowing end-dot, coloured by change direction.
/// Normalization matches the handoff (1.5pt vertical padding).
struct HuntSparkline: View {
    let points: [Double]
    let color: Color
    var lineWidth: CGFloat = 2
    var showDot = true
    var gridlines = false
    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width, h = geo.size.height
            let pts = Self.normalize(points, w: w, h: h)
            ZStack {
                if gridlines {
                    Path { pa in
                        pa.move(to: CGPoint(x: 0, y: h * 0.34)); pa.addLine(to: CGPoint(x: w, y: h * 0.34))
                        pa.move(to: CGPoint(x: 0, y: h * 0.67)); pa.addLine(to: CGPoint(x: w, y: h * 0.67))
                    }.stroke(color.opacity(0.12), lineWidth: 1)
                }
                Self.area(pts, h: h).fill(LinearGradient(colors: [color.opacity(0.18), color.opacity(0)], startPoint: .top, endPoint: .bottom))
                Self.line(pts).stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round, lineJoin: .round))
                if showDot, let last = pts.last {
                    Circle().fill(color).frame(width: lineWidth * 2.2, height: lineWidth * 2.2)
                        .position(last).shadow(color: color.opacity(0.7), radius: 3)
                }
            }
        }
    }
    static func normalize(_ data: [Double], w: CGFloat, h: CGFloat) -> [CGPoint] {
        guard data.count > 1 else { return [] }
        let lo = data.min() ?? 0, hi = data.max() ?? 1
        let r = (hi - lo) == 0 ? 1 : (hi - lo)
        return data.enumerated().map { i, v in
            CGPoint(x: CGFloat(i) / CGFloat(data.count - 1) * w,
                    y: h - CGFloat((v - lo) / r) * (h - 3) - 1.5)
        }
    }
    static func line(_ pts: [CGPoint]) -> Path {
        var p = Path()
        guard let f = pts.first else { return p }
        p.move(to: f); pts.dropFirst().forEach { p.addLine(to: $0) }
        return p
    }
    static func area(_ pts: [CGPoint], h: CGFloat) -> Path {
        guard let f = pts.first, let l = pts.last else { return Path() }
        var p = line(pts)
        p.addLine(to: CGPoint(x: l.x, y: h)); p.addLine(to: CGPoint(x: f.x, y: h)); p.closeSubpath()
        return p
    }
}

/// Rounded-square logo tile, heat-tinted (the real company logo if we have one, else a
/// heat-coloured monogram). The heat tint reinforces the ranking; reads in both themes.
struct HeatLogoTile: View {
    @Environment(\.colorScheme) private var scheme
    let symbol: String
    var url: String? = nil
    let heat: Int
    var size: CGFloat = 36
    var body: some View {
        let hc = Theme.heatColor(Double(heat))               // decorative wash + border
        let htc = Theme.heatTextColor(Double(heat), scheme)  // legible monogram text
        let radius = size * 0.28
        let initials = String(symbol.replacingOccurrences(of: ".", with: "").prefix(2)).uppercased()
        return Group {
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFit().padding(size * 0.12)
                    default: monogram(initials, htc)
                    }
                }
            } else {
                monogram(initials, htc)
            }
        }
        .frame(width: size, height: size)
        .background(RoundedRectangle(cornerRadius: radius, style: .continuous).fill(hc.opacity(0.16)))
        .overlay(RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(hc.opacity(0.4), lineWidth: 1))
        .clipShape(RoundedRectangle(cornerRadius: radius, style: .continuous))
    }
    private func monogram(_ initials: String, _ color: Color) -> some View {
        Text(initials).font(.system(size: size * 0.36, weight: .black, design: .rounded)).foregroundStyle(color)
    }
}

/// ★/☆ watch control (icon form on cards, labelled form on the hero). Shows a settled
/// state for already-watched / in-universe names.
struct WatchToggle: View {
    @Environment(\.colorScheme) private var scheme
    let watch: String?
    var labelled = false
    let onWatch: () -> Void
    var body: some View {
        let p = Theme.palette(scheme)
        return Group {
            if watch == "universe" {
                content(icon: "checkmark.seal.fill", text: "in universe", color: p.pos, active: true, p: p)
            } else if watch == "watching" {
                content(icon: "star.fill", text: "watching", color: p.accent, active: true, p: p)
            } else {
                Button(action: onWatch) { content(icon: "star", text: "watch", color: p.accent, active: false, p: p) }
                    .buttonStyle(.plain)
            }
        }
    }
    @ViewBuilder private func content(icon: String, text: String, color: Color, active: Bool, p: Palette) -> some View {
        if labelled {
            HStack(spacing: 6) { Image(systemName: icon); Text(text) }
                .font(.subheadline.weight(.semibold)).foregroundStyle(color)
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(Capsule().fill(color.opacity(active ? 0.16 : 0.06)))
                .overlay(Capsule().strokeBorder(color.opacity(active ? 0.45 : 0.22), lineWidth: 1))
        } else {
            Image(systemName: icon).font(.system(size: 16)).foregroundStyle(color)
                .frame(width: 38, height: 38)
                .background(RoundedRectangle(cornerRadius: 10, style: .continuous).fill(color.opacity(active ? 0.16 : 0.05)))
                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(color.opacity(active ? 0.45 : 0.2), lineWidth: 1))
        }
    }
}

/// The directed-hunt banner — an orange-tinted pill naming the active brief.
struct DirectedBanner: View {
    @Environment(\.colorScheme) private var scheme
    let brief: String
    var onClear: (() -> Void)? = nil
    var body: some View {
        let p = Theme.palette(scheme)
        let orange = Color(hex: "ff7a45")
        return HStack(alignment: .top, spacing: 8) {
            Circle().fill(orange).frame(width: 8, height: 8).shadow(color: orange.opacity(0.6), radius: 4).padding(.top, 4)
            (Text("Directed hunt: ").font(.caption.weight(.bold)).foregroundStyle(Theme.hot(scheme))
             + Text(brief).font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary))
            Spacer(minLength: 0)
            if let onClear {
                Button(action: onClear) {
                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).foregroundStyle(p.textMuted)
                }.buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(orange.opacity(scheme == .dark ? 0.10 : 0.07)))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).strokeBorder(orange.opacity(0.3), lineWidth: 1))
    }
}

/// Signed whole-percent from a fraction — "+12%" / "−98%".
func huntPct(_ frac: Double) -> String {
    let v = Int((frac * 100).rounded())
    return v < 0 ? "−\(abs(v))%" : "+\(v)%"
}
