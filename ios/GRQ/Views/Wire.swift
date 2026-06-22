import SwiftUI

// THE WIRE — a full-screen, vertically-paged discovery feed (Reels/Stories-style). Each
// card snaps to the browsable area between the fixed header (brand + member avatar) and
// the tab bar; swipe up/down moves between them. Every kind has a purpose-built full-screen
// layout (mocked 2026-06-22): find · dossier · watch · article · lesson. Shared + read-only;
// the richer fields (targets, signals, sources, sparklines) ride on the wire.
struct WireView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var items: [WireItem] = []
    @State private var loaded = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                header
                content
            }
            .background(ScreenBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { if !loaded { await load() } }
    }

    private func load() async {
        if let r = await APIClient.shared.wire() { items = r.items }
        loaded = true
    }

    // Fixed header — brand + the member avatar top-right (matching the Hunt tab).
    private var header: some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 10) {
            BrandLogo(height: 24)
            Text("THE WIRE").font(.system(size: 13, weight: .black, design: .rounded)).tracking(1)
                .foregroundStyle(p.textMuted)
            Spacer()
            MemberAvatar(email: auth.currentUser?.email ?? "", size: 30)
        }
        .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 8)
    }

    @ViewBuilder private var content: some View {
        if !loaded {
            ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if items.isEmpty {
            EmptyState(title: "The wire is quiet",
                       message: "The agent's finds, dossiers and the board fill this in as it works.")
                .padding(.horizontal, 20).frame(maxWidth: .infinity, maxHeight: .infinity)
        } else {
            ScrollView(.vertical) {
                LazyVStack(spacing: 0) {
                    ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                        WireCardPage(item: item, index: idx, total: items.count)
                            .containerRelativeFrame(.vertical)
                    }
                }
                .scrollTargetLayout()
            }
            .scrollTargetBehavior(.paging)
            .scrollIndicators(.hidden)
        }
    }
}

// MARK: - One full-screen card

private struct WireCardPage: View {
    @EnvironmentObject private var glossary: GlossaryPresenter
    @Environment(\.colorScheme) private var scheme
    let item: WireItem
    let index: Int
    let total: Int

    var body: some View {
        switch item.kind {
        case .find:    findPage
        case .dossier: dossierPage
        case .watch:   watchPage
        case .article: articlePage
        case .lesson:  lessonPage
        }
    }

    // MARK: shared chrome

    private func rail(_ kicker: String, _ tone: Chip.Tone) -> some View {
        let p = Theme.palette(scheme)
        return VStack(spacing: 6) {
            HStack {
                Chip(text: kicker, tone: tone)
                Spacer()
                Text("\(index + 1) / \(total)").font(.caption2.weight(.bold)).foregroundStyle(p.textMuted)
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.textMuted.opacity(0.18))
                    Capsule().fill(p.accent)
                        .frame(width: max(4, geo.size.width * CGFloat(index + 1) / CGFloat(max(1, total))))
                }
            }
            .frame(height: 3)
        }
    }

    @ViewBuilder private var swipeHint: some View {
        if index < total - 1 {
            VStack(spacing: 1) {
                Image(systemName: "chevron.up").font(.system(size: 11, weight: .bold))
                Text("swipe").font(.system(size: 9, weight: .semibold))
            }
            .foregroundStyle(Theme.palette(scheme).textMuted.opacity(0.55))
            .frame(maxWidth: .infinity)
        }
    }

    private func cta(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 15, weight: .bold, design: .rounded))
            .foregroundStyle(Color(hex: "04110d"))
            .frame(maxWidth: .infinity).padding(.vertical, 14)
            .background(Capsule().fill(LinearGradient(colors: [Color(hex: "5af0d6"), Color(hex: "22c2a8")],
                                                      startPoint: .top, endPoint: .bottom)))
    }

    // Logo · ticker · name · tag · live price — the shared identity row.
    private func identity(_ logoSize: CGFloat) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 12) {
            StockLogo(symbol: item.symbol ?? "?", url: item.logoUrl, size: logoSize)
            VStack(alignment: .leading, spacing: 2) {
                Text(item.symbol ?? "—").font(.title3.weight(.black)).foregroundStyle(p.textPrimary)
                if let name = item.name { Text(name).font(.subheadline).foregroundStyle(p.textMuted).lineLimit(1) }
                if let tag = item.tag { Text(tag).font(.caption2).foregroundStyle(p.textMuted.opacity(0.8)) }
            }
            Spacer(minLength: 6)
            if let cents = item.lastCents {
                VStack(alignment: .trailing, spacing: 2) {
                    MoneyText(cents: cents, currency: item.currency).font(.headline.weight(.bold)).foregroundStyle(p.textPrimary)
                    if let bps = item.dayChangeBps { BpsBadge(bps: bps).font(.caption2) }
                }
            }
        }
    }

    private func obscurityLabel(_ o: Int?) -> String? {
        switch o {
        case 5: return "🔍 deep cut"
        case 4: return "under-the-radar"
        case 3: return "lesser-known"
        default: return nil
        }
    }

    private func shortDate(_ iso: String) -> String? {
        let f = ISO8601DateFormatter()
        guard let d = f.date(from: iso) else { return nil }
        let out = DateFormatter(); out.dateFormat = "MMM d"
        return out.string(from: d)
    }

    // MARK: find — a lead, "ready to pop"

    private var findPage: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 14) {
            rail("Find", .teal)
            Spacer(minLength: 0)
            identity(46)
            if let heat = item.heat { heatRow(heat) }
            upsideBlock
            if let spark = item.spark, spark.count > 1 {
                TapeChart(points: spark).frame(height: 78)
                if let first = spark.first, let last = spark.last {
                    Text("30-day   \(Fmt.money(Int(first))) → \(Fmt.money(Int(last)))")
                        .font(.caption2).foregroundStyle(p.textMuted)
                }
            }
            if let blurb = item.blurb, !blurb.isEmpty {
                Text("“\(blurb)”").font(.callout).italic().foregroundStyle(p.textPrimary.opacity(0.9))
                    .fixedSize(horizontal: false, vertical: true).lineLimit(4)
            }
            if let sources = item.sources, !sources.isEmpty {
                Text("sources · " + sources.prefix(4).joined(separator: " · ")).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer(minLength: 0)
            NavigationLink { StockDetailView(symbol: item.symbol ?? "") } label: { cta("Open the hunt dossier  →") }.buttonStyle(.plain)
            swipeHint
        }
        .padding(.horizontal, 22).padding(.top, 10).padding(.bottom, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // The hero upside — only when we have a 12-mo number; otherwise a clean meta row
    // (no orphan "12-MONTH UPSIDE" label) for finds we couldn't price yet.
    @ViewBuilder private var upsideBlock: some View {
        let p = Theme.palette(scheme)
        if let far = item.farBps {
            VStack(alignment: .leading, spacing: 4) {
                Text("12-MONTH UPSIDE").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(p.textMuted)
                Text(Fmt.bps(far)).font(.system(size: 50, weight: .black, design: .rounded))
                    .foregroundStyle(far >= 0 ? p.pos : p.neg).monospacedDigit()
                metaRow
            }
        } else {
            metaRow
        }
    }

    @ViewBuilder private var metaRow: some View {
        let p = Theme.palette(scheme)
        HStack(spacing: 10) {
            if let near = item.nearBps {
                Text("near \(Fmt.bps(near))" + (item.nearHorizon.map { " (\($0))" } ?? ""))
                    .font(.caption).foregroundStyle(p.textMuted)
            }
            if let c = item.confidence { Text("\(c)% conviction").font(.caption).foregroundStyle(p.textMuted) }
            if let o = obscurityLabel(item.obscurity) { Text(o).font(.caption).foregroundStyle(Color(hex: "f59e0b")) }
        }
    }

    private func heatRow(_ heat: Int) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 8) {
            Text("🔥 HEAT").font(.caption2.weight(.bold)).foregroundStyle(p.accentText)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.textMuted.opacity(0.15))
                    Capsule().fill(LinearGradient(colors: [Color(hex: "f59e0b"), Color(hex: "34e0c4")], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(6, geo.size.width * CGFloat(heat) / 100))
                }
            }
            .frame(height: 8)
            Text("\(heat)").font(.caption.weight(.black)).monospacedDigit().foregroundStyle(p.textPrimary)
        }
    }

    // MARK: dossier — fresh research, GRQ's verdict

    private var dossierPage: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 14) {
            rail("Research", .green)
            Spacer(minLength: 0)
            identity(44)
            if let r = item.resolvedRating {
                VStack(alignment: .leading, spacing: 6) {
                    Text("GRQ'S CALL").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(p.textMuted)
                    RatingBar(rating: r, note: item.confidence.map { "\($0)% CONF" })
                }
            }
            if let blurb = item.blurb, !blurb.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("THE BOTTOM LINE").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(p.textMuted)
                    MarkdownText(text: blurb)
                }
            }
            if item.targetNearCents != nil || item.targetFarCents != nil {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TARGETS").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(p.textMuted)
                    if let near = item.targetNearCents { targetRow("near", near, item.nearBps, item.nearHorizon) }
                    if let far = item.targetFarCents { targetRow("12-mo", far, item.farBps, nil) }
                }
            }
            if let s = item.signals {
                HStack(spacing: 8) {
                    Text("SIGNALS").font(.caption2.weight(.bold)).tracking(1).foregroundStyle(p.textMuted)
                    SignalStrip(signals: s)
                }
            }
            Spacer(minLength: 0)
            NavigationLink { StockDetailView(symbol: item.symbol ?? "") } label: { cta("Read the full dossier  →") }.buttonStyle(.plain)
            swipeHint
        }
        .padding(.horizontal, 22).padding(.top, 10).padding(.bottom, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private func targetRow(_ label: String, _ cents: Int, _ bps: Int?, _ horizon: String?) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 8) {
            Text(label).font(.caption.weight(.semibold)).foregroundStyle(p.textMuted).frame(width: 50, alignment: .leading)
            Text(Fmt.money(cents, item.currency)).font(.subheadline.weight(.bold)).monospacedDigit().foregroundStyle(p.textPrimary)
            if let bps { Text(Fmt.bps(bps)).font(.caption.weight(.bold)).foregroundStyle(bps >= 0 ? p.pos : p.neg) }
            if let horizon { Text(horizon).font(.caption2).foregroundStyle(p.textMuted) }
            Spacer()
        }
    }

    // MARK: watch — on the board (the social signal)

    private var watchPage: some View {
        let p = Theme.palette(scheme)
        return VStack(spacing: 14) {
            rail("On the board", .dim)
            Spacer(minLength: 0)
            VStack(spacing: 10) {
                watcherAvatar(item.watcherKey, size: 84)
                Text("\(item.watcher ?? "Someone") is watching")
                    .font(.title3.weight(.bold)).foregroundStyle(p.textPrimary)
            }
            identity(44)
            if let spark = item.spark, spark.count > 1 { TapeChart(points: spark).frame(height: 64) }
            if let r = item.resolvedRating {
                HStack(spacing: 8) {
                    Text("GRQ'S CALL").font(.caption2.weight(.bold)).foregroundStyle(p.textMuted)
                    StanceBadge(rating: r, full: true)
                }
            }
            Text("On the board\(shortDate(item.at).map { " since \($0)" } ?? "") — not in the fund yet, tracking it for a cleaner entry.")
                .font(.callout).multilineTextAlignment(.center).foregroundStyle(p.textMuted)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 0)
            NavigationLink { StockDetailView(symbol: item.symbol ?? "") } label: { cta("See the dossier  →") }.buttonStyle(.plain)
            swipeHint
        }
        .padding(.horizontal, 22).padding(.top, 10).padding(.bottom, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // Member photos ship in the asset catalog (cam/graham), keyed by Person.key.
    private func watcherAvatar(_ key: String?, size: CGFloat) -> some View {
        let p = Theme.palette(scheme)
        return Group {
            if key == "cam" || key == "graham" { Image(key!).resizable().scaledToFill() }
            else { Image(systemName: "cpu").font(.system(size: size * 0.4)).foregroundStyle(p.accent) }
        }
        .frame(width: size, height: size)
        .background(Circle().fill(p.accent.opacity(0.14)))
        .clipShape(Circle())
        .overlay(Circle().strokeBorder(p.accent.opacity(0.3), lineWidth: 2))
    }

    // MARK: article — market news (full-bleed)

    private var articlePage: some View {
        let p = Theme.palette(scheme)
        return ZStack(alignment: .bottom) {
            Group {
                if let img = item.imageUrl, let u = URL(string: img) {
                    AsyncImage(url: u) { phase in
                        if case .success(let i) = phase { i.resizable().scaledToFill() }
                        else { LinearGradient(colors: [p.accent.opacity(0.25), p.cardBg], startPoint: .top, endPoint: .bottom) }
                    }
                } else {
                    LinearGradient(colors: [p.accent.opacity(0.25), p.cardBg], startPoint: .top, endPoint: .bottom)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity).clipped()

            LinearGradient(colors: [.clear, .black.opacity(0.45), .black.opacity(0.88)], startPoint: .center, endPoint: .bottom)

            VStack(alignment: .leading, spacing: 12) {
                Spacer()
                Text(item.title ?? "—").font(.title2.weight(.black)).foregroundStyle(.white).lineLimit(5)
                    .fixedSize(horizontal: false, vertical: true)
                if let pub = item.publisher { Text("\(pub)\(shortDate(item.at).map { " · \($0)" } ?? "")").font(.caption).foregroundStyle(.white.opacity(0.8)) }
                if let url = item.url, let u = URL(string: url) {
                    Link(destination: u) { cta("Read on \(item.publisher ?? "the web")  ↗") }.buttonStyle(.plain)
                }
                swipeHint.foregroundStyle(.white.opacity(0.7))
            }
            .padding(.horizontal, 22).padding(.bottom, 14)

            VStack {
                HStack {
                    Text("MARKET").font(.caption2.weight(.black)).tracking(1).foregroundStyle(.white)
                    Spacer()
                    Text("\(index + 1) / \(total)").font(.caption2.weight(.bold)).foregroundStyle(.white.opacity(0.85))
                }
                .padding(.horizontal, 22).padding(.top, 10)
                Spacer()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .clipped()
    }

    // MARK: lesson — a literacy flash card (calm, accent-tinted)

    private var lessonPage: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 16) {
            rail("Learn", .green)
            Spacer(minLength: 0)
            Image(systemName: "graduationcap.fill").font(.system(size: 34)).foregroundStyle(p.accent)
            Text(item.lessonTerm ?? "Lesson").font(.system(size: 29, weight: .black, design: .rounded))
                .foregroundStyle(p.textPrimary).fixedSize(horizontal: false, vertical: true)
            Rectangle().fill(p.accent.opacity(0.35)).frame(width: 56, height: 2)
            if let body = item.lessonBody {
                Text(body).font(.title3).foregroundStyle(p.textPrimary.opacity(0.92))
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
            Button {
                glossary.present(GlossaryEntry(slug: item.lessonSlug ?? item.id,
                                               term: item.lessonTerm ?? "Lesson", def: item.lessonBody ?? ""))
            } label: { cta("More in the glossary  →") }.buttonStyle(.plain)
            swipeHint
        }
        .padding(.horizontal, 24).padding(.top, 10).padding(.bottom, 14)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(LinearGradient(colors: [p.accent.opacity(0.10), .clear], startPoint: .top, endPoint: .center))
    }
}
