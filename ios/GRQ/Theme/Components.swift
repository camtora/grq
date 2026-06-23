import SwiftUI

/// Money formatting — integer cents in, CAD strings out (mirrors web/lib/money.ts).
enum Fmt {
    private static let cad: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .currency
        f.currencyCode = "CAD"
        f.locale = Locale(identifier: "en_CA")
        return f
    }()
    // Plain grouped decimal — we prefix the currency symbol ourselves rather than
    // trust NumberFormatter's currency style, which renders USD as a bare "$" in a
    // CAD locale on iOS (the "$208.88 should be US$208.88" bug — D24).
    private static let dec: NumberFormatter = {
        let f = NumberFormatter()
        f.numberStyle = .decimal
        f.minimumFractionDigits = 2
        f.maximumFractionDigits = 2
        f.locale = Locale(identifier: "en_CA")
        return f
    }()
    /// CAD stays a bare "$"; a non-CAD listing gets an explicit symbol — "US$208.88"
    /// — so a US name can never be misread as CAD (D24).
    static func money(_ cents: Int, _ currency: String? = nil) -> String {
        let code = (currency ?? "CAD").uppercased()
        if code == "CAD" {
            return cad.string(from: NSNumber(value: Double(cents) / 100)) ?? "$0.00"
        }
        let body = dec.string(from: NSNumber(value: Double(cents) / 100)) ?? String(format: "%.2f", Double(cents) / 100)
        let symbol = code == "USD" ? "US$" : "\(code) "
        return "\(symbol)\(body)"
    }
    static func signed(_ cents: Int) -> String {
        let s = money(abs(cents))
        return cents < 0 ? "−\(s)" : "+\(s)"
    }
    static func bps(_ b: Int) -> String { String(format: "%+.2f%%", Double(b) / 100) }
    static func pctBps(_ b: Int) -> String { String(format: "%.0f%%", Double(b) / 100) }
    /// Signed whole-percent from bps — "+42%" / "−18%" (the hunt/idea upside style).
    static func pct0(_ b: Int) -> String {
        let v = Int((Double(b) / 100).rounded())
        return v < 0 ? "−\(abs(v))%" : "+\(v)%"
    }
    /// Compact USD for smart-money values — "$2.1M", "$940K".
    static func usd(_ v: Double) -> String {
        let a = abs(v)
        if a >= 1_000_000_000 { return String(format: "$%.1fB", v / 1_000_000_000) }
        if a >= 1_000_000 { return String(format: "$%.1fM", v / 1_000_000) }
        if a >= 1_000 { return String(format: "$%.0fK", v / 1_000) }
        return String(format: "$%.0f", v)
    }
}

// MARK: - Rating (the 7-point scale)

extension Theme {
    /// Map a stance tone (emerald/teal/amber/red) → a palette colour.
    static func toneColor(_ tone: String, _ scheme: ColorScheme) -> Color {
        let p = palette(scheme)
        switch tone {
        case "emerald": return p.pos
        case "teal":    return p.accent
        case "amber":   return scheme == .dark ? Color(hex: "fcd34d") : Color(hex: "b45309")
        case "red":     return p.neg
        default:        return p.textMuted
        }
    }
}

/// GRQ's call as a compact badge: the bull / bear mascot for a buy / sell, or a
/// neutral "=" for a hold. The mascot art is fixed teal/red, so the pill colour
/// (emerald·teal·amber·red) carries the strength — Strong Buy vs Weak Buy — and
/// the precise label lives on the stock page's RatingBar. `full` appends the word.
struct StanceBadge: View {
    @Environment(\.colorScheme) private var scheme
    let rating: Rating
    var full = false
    var body: some View {
        let c = Theme.toneColor(rating.tone, scheme)
        HStack(spacing: 5) {
            glyph(c)
            if full {
                Text(rating.label.uppercased()).font(.caption2.weight(.bold)).foregroundStyle(c)
            }
        }
        .padding(.horizontal, full ? 9 : 6).padding(.vertical, 4)
        .background(Capsule().fill(c.opacity(0.16)))
        .overlay(Capsule().strokeBorder(c.opacity(0.28), lineWidth: 1))
        .fixedSize()
        .accessibilityLabel(Text(rating.label))
    }
    /// bull (buy) · bear (sell) · a neutral "=" at the hold midpoint.
    @ViewBuilder private func glyph(_ c: Color) -> some View {
        if rating.pos > 0.5 {
            Image("bull-splash").resizable().scaledToFit().frame(height: 15)
        } else if rating.pos < 0.5 {
            Image("bear-splash").resizable().scaledToFit().frame(height: 15)
        } else {
            Image(systemName: "equal").font(.system(size: 13, weight: .black))
                .foregroundStyle(c).frame(height: 15)
        }
    }
}

/// The red→amber→green rating track with a needle at `pos`, the bull/bear mascots
/// optional at the ends. Mirrors web/components/RatingBar.tsx (GRQ's call hero).
struct RatingBar: View {
    @Environment(\.colorScheme) private var scheme
    let rating: Rating
    var note: String? = nil
    var mascots = false

    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(rating.label)
                    .font(.system(.title3, design: .rounded).weight(.black))
                    .foregroundStyle(Theme.toneColor(rating.tone, scheme))
                if let note {
                    Text(note).font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(p.textMuted)
                }
                Spacer()
            }
            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .leading) {
                    Capsule().fill(LinearGradient(
                        colors: [Color(hex: "dc2626"), Color(hex: "f59e0b"), Color(hex: "10b981")],
                        startPoint: .leading, endPoint: .trailing)).frame(height: 8).opacity(0.85)
                    Circle().fill(.white)
                        .frame(width: 16, height: 16)
                        .overlay(Circle().stroke(Theme.toneColor(rating.tone, scheme), lineWidth: 3))
                        .shadow(color: .black.opacity(0.25), radius: 3, y: 1)
                        .offset(x: max(0, min(w - 16, CGFloat(rating.pos) * w - 8)))
                }
                .frame(height: 16)
            }
            .frame(height: 16)
            if mascots {
                HStack {
                    mascot("bear-splash"); Spacer(); mascot("bull-splash")
                }
            }
            Text(rating.blurb).font(.caption).foregroundStyle(p.textMuted)
        }
    }
    private func mascot(_ name: String) -> some View {
        Image(name).resizable().scaledToFit().frame(height: 26).opacity(0.9)
    }
}

// MARK: - Markdown

/// Lightweight markdown for dossier bodies (mirrors components/Md.tsx well enough for
/// mobile): headings, bullets, and inline **bold**/*italic*/`code`/[links] per line.
struct MarkdownText: View {
    @Environment(\.colorScheme) private var scheme
    let text: String
    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(Array(blocks().enumerated()), id: \.offset) { _, block in
                switch block.kind {
                case .heading:
                    inline(block.text).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                case .bullet:
                    HStack(alignment: .top, spacing: 6) {
                        Text("•").foregroundStyle(p.accent)
                        inline(block.text).foregroundStyle(p.textPrimary.opacity(0.9))
                    }.font(.callout)
                case .body:
                    inline(block.text).font(.callout).foregroundStyle(p.textPrimary.opacity(0.9))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private enum Kind { case heading, bullet, body }
    private struct Block { let kind: Kind; let text: String }
    private func blocks() -> [Block] {
        text.split(separator: "\n", omittingEmptySubsequences: true).map { raw in
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("#") {
                return Block(kind: .heading, text: line.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces))
            }
            if line.hasPrefix("- ") || line.hasPrefix("* ") {
                return Block(kind: .bullet, text: String(line.dropFirst(2)))
            }
            return Block(kind: .body, text: line)
        }
    }
    private func inline(_ s: String) -> Text {
        // [[wiki-links]] aren't markdown — strip the brackets so they don't render raw.
        let s = s.replacingOccurrences(of: "[[", with: "").replacingOccurrences(of: "]]", with: "")
        if let a = try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace)) {
            return Text(a)
        }
        return Text(s)
    }
}

/// Markdown that clamps long bodies behind a "Show more" toggle (components/CollapsibleMd.tsx).
struct CollapsibleMd: View {
    @Environment(\.colorScheme) private var scheme
    let text: String
    var threshold = 240
    @State private var expanded = false
    var body: some View {
        let long = text.count > threshold
        let shown = (!expanded && long) ? String(text.prefix(threshold)) + "…" : text
        VStack(alignment: .leading, spacing: 6) {
            MarkdownText(text: shown)
            if long {
                Button(expanded ? "Show less" : "Show more") { withAnimation { expanded.toggle() } }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(Theme.palette(scheme).accentText)
            }
        }
    }
}

// MARK: - Stock logo

/// Company logo with the initials-circle fallback (mirrors components/StockLogo.tsx).
struct StockLogo: View {
    @Environment(\.colorScheme) private var scheme
    let symbol: String
    var url: String? = nil
    var size: CGFloat = 38
    var body: some View {
        let p = Theme.palette(scheme)
        Group {
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { phase in
                    switch phase {
                    case .success(let img): img.resizable().scaledToFit()
                    default: initials(p)
                    }
                }
            } else {
                initials(p)
            }
        }
        .frame(width: size, height: size)
        .background(Circle().fill(p.accent.opacity(0.14)))
        .overlay(Circle().strokeBorder(p.accent.opacity(0.25), lineWidth: 1))
        .clipShape(Circle())
    }
    private func initials(_ p: Palette) -> some View {
        Text(String(symbol.prefix(1)))
            .font(.system(size: size * 0.42, weight: .black, design: .rounded))
            .foregroundStyle(Theme.brandGradient)
    }
}

/// The masthead logo (light/dark variant), used in place of the text wordmark.
struct BrandLogo: View {
    @Environment(\.colorScheme) private var scheme
    var height: CGFloat = 26
    var body: some View {
        Image(scheme == .light ? "grq-logo-light" : "grq-logo")
            .resizable().scaledToFit().frame(height: height)
    }
}

// MARK: - Screen scaffold (one flashy header per screen, ambient background, no system bar)

/// Ambient brand-glow background behind every screen.
struct ScreenBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            p.bodyBg
            RadialGradient(colors: [p.accent.opacity(scheme == .dark ? 0.16 : 0.09), .clear],
                           center: .topTrailing, startRadius: 8, endRadius: 440)
            RadialGradient(colors: [p.accent.opacity(scheme == .dark ? 0.10 : 0.05), .clear],
                           center: .bottomLeading, startRadius: 8, endRadius: 400)
        }
    }
}

/// Big bold gradient title + optional kicker — the single header for each screen.
struct ScreenHeader: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    var subtitle: String? = nil
    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 2) {
            if let subtitle {
                Text(subtitle.uppercased())
                    .font(.caption2.weight(.bold)).tracking(1.6)
                    .foregroundStyle(p.textMuted)
            }
            Text(title)
                .font(.system(size: 34, weight: .black, design: .rounded))
                .foregroundStyle(Theme.brandGradient)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 6)
    }
}

/// Standard flashy screen: ambient bg, hidden system nav bar, bold header, scroll content.
struct GRQScreen<Content: View>: View {
    private let title: String
    private let subtitle: String?
    private let content: Content
    init(title: String, subtitle: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content()
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                ScreenHeader(title: title, subtitle: subtitle)
                content
            }
            .padding(.horizontal, 16)
            .padding(.top, 4)
            .padding(.bottom, 32)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
    }
}

// MARK: - Cards

struct Card<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        let p = Theme.palette(scheme)
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(LinearGradient(colors: [p.cardHi, p.cardBg], startPoint: .top, endPoint: .bottom))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .strokeBorder(p.cardBorder, lineWidth: 1)
            )
            .shadow(color: p.glow, radius: 18, x: 0, y: 10)
    }
}

/// The hero money figure — big, rounded, gradient.
struct HeroAmount: View {
    let cents: Int
    var size: CGFloat = 42
    var body: some View {
        Text(Fmt.money(cents))
            .font(.system(size: size, weight: .black, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(Theme.brandGradient)
    }
}

struct StatCard: View {
    @Environment(\.colorScheme) private var scheme
    let label: String
    let value: String
    var term: String? = nil
    var valueColor: Color? = nil
    var note: String? = nil

    var body: some View {
        let p = Theme.palette(scheme)
        Card {
            VStack(alignment: .leading, spacing: 6) {
                if let term {
                    TermLink(slug: term, label: label.uppercased())
                        .font(.caption2.weight(.bold))
                } else {
                    Text(label.uppercased()).font(.caption2.weight(.bold)).tracking(0.5)
                        .foregroundStyle(p.textMuted)
                }
                Text(value).font(.system(.title3, design: .rounded).weight(.bold)).monospacedDigit()
                    .foregroundStyle(valueColor ?? p.textPrimary)
                if let note {
                    Text(note).font(.caption2).foregroundStyle(p.textMuted.opacity(0.8))
                }
            }
        }
    }
}

// MARK: - Atoms

struct Chip: View {
    enum Tone { case teal, red, green, dim }
    @Environment(\.colorScheme) private var scheme
    let text: String
    var tone: Tone = .teal

    var body: some View {
        if tone == .green {
            Text(text.uppercased()).font(.caption2.weight(.bold))
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(Capsule().fill(Theme.posGradient))
                .foregroundStyle(Color.black.opacity(0.82))
                .shadow(color: Theme.palette(scheme).pos.opacity(0.45), radius: 6, y: 2)
        } else {
            Text(text.uppercased()).font(.caption2.weight(.bold))
                .padding(.horizontal, 9).padding(.vertical, 4)
                .background(Capsule().fill(toneColor().opacity(0.16)))
                .foregroundStyle(toneColor())
        }
    }
    private func toneColor() -> Color {
        let p = Theme.palette(scheme)
        switch tone { case .red: return p.neg; case .dim: return p.textMuted; default: return p.accent }
    }
}

struct Pnl: View {
    @Environment(\.colorScheme) private var scheme
    let cents: Int
    var body: some View {
        let p = Theme.palette(scheme)
        Text(Fmt.signed(cents)).monospacedDigit()
            .foregroundStyle(cents > 0 ? p.pos : cents < 0 ? p.neg : p.textMuted)
    }
}

struct MoneyText: View {
    let cents: Int
    var currency: String? = nil
    var body: some View { Text(Fmt.money(cents, currency)).monospacedDigit() }
}

struct BpsBadge: View {
    @Environment(\.colorScheme) private var scheme
    let bps: Int
    var body: some View {
        let p = Theme.palette(scheme)
        let c = bps > 0 ? p.pos : bps < 0 ? p.neg : p.textMuted
        HStack(spacing: 2) {
            Image(systemName: bps > 0 ? "arrow.up.right" : bps < 0 ? "arrow.down.right" : "minus")
                .font(.system(size: 9, weight: .bold))
            Text(Fmt.bps(bps)).monospacedDigit()
        }
        .foregroundStyle(c)
    }
}

/// Tappable glossary term — teal, underlined (literacy pillar).
struct TermLink: View {
    @EnvironmentObject private var glossary: GlossaryPresenter
    @Environment(\.colorScheme) private var scheme
    let slug: String
    let label: String
    var body: some View {
        Button { glossary.show(slug) } label: {
            Text(label).underline().foregroundStyle(Theme.palette(scheme).accentText)
        }
        .buttonStyle(.plain)
    }
}

struct SectionTitle: View {
    @Environment(\.colorScheme) private var scheme
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.caption.weight(.bold)).tracking(1.4)
            .foregroundStyle(Theme.palette(scheme).textMuted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct KeyValueRow: View {
    @Environment(\.colorScheme) private var scheme
    let label: String
    let value: String
    var term: String? = nil
    var valueColor: Color? = nil
    var body: some View {
        let p = Theme.palette(scheme)
        HStack {
            if let term { TermLink(slug: term, label: label) }
            else { Text(label).foregroundStyle(p.textMuted) }
            Spacer()
            Text(value).monospacedDigit().foregroundStyle(valueColor ?? p.textPrimary)
        }
        .font(.subheadline)
    }
}

struct SignalStrip: View {
    @Environment(\.colorScheme) private var scheme
    let signals: Signals
    var body: some View {
        HStack(spacing: 6) {
            pill("trend", signals.trend)
            if let rsi = signals.rsi { pill("rsi", String(Int(rsi))) }
            if let macd = signals.macd { pill("macd", macd) }
        }
        .font(.caption2)
    }
    private func pill(_ k: String, _ v: String) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 3) {
            Text(k.uppercased()).foregroundStyle(p.textMuted.opacity(0.7))
            Text(v).foregroundStyle(p.accentText)
        }
        .padding(.horizontal, 7).padding(.vertical, 3)
        .background(Capsule().fill(p.accent.opacity(0.12)))
    }
}

// MARK: - Charts

struct Sparkline: Shape {
    let points: [Double]
    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard points.count > 1, let lo = points.min(), let hi = points.max(), hi > lo else {
            path.move(to: CGPoint(x: rect.minX, y: rect.midY))
            path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
            return path
        }
        let stepX = rect.width / CGFloat(points.count - 1)
        for (i, v) in points.enumerated() {
            let x = rect.minX + CGFloat(i) * stepX
            let y = rect.maxY - CGFloat((v - lo) / (hi - lo)) * rect.height
            if i == 0 { path.move(to: CGPoint(x: x, y: y)) } else { path.addLine(to: CGPoint(x: x, y: y)) }
        }
        return path
    }
}

struct SparkArea: Shape {
    let points: [Double]
    func path(in rect: CGRect) -> Path {
        var path = Path()
        guard points.count > 1, let lo = points.min(), let hi = points.max(), hi > lo else { return path }
        let stepX = rect.width / CGFloat(points.count - 1)
        path.move(to: CGPoint(x: rect.minX, y: rect.maxY))
        for (i, v) in points.enumerated() {
            let x = rect.minX + CGFloat(i) * stepX
            let y = rect.maxY - CGFloat((v - lo) / (hi - lo)) * rect.height
            path.addLine(to: CGPoint(x: x, y: y))
        }
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}

/// Gradient area + gradient line — the premium "tape".
struct TapeChart: View {
    @Environment(\.colorScheme) private var scheme
    let points: [Double]
    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            SparkArea(points: points)
                .fill(LinearGradient(colors: [p.accent.opacity(0.32), p.accent.opacity(0.0)],
                                     startPoint: .top, endPoint: .bottom))
            Sparkline(points: points)
                .stroke(Theme.posGradient, style: StrokeStyle(lineWidth: 2.5, lineCap: .round, lineJoin: .round))
        }
    }
}

// MARK: - Buttons, states, sheets

struct GradientButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .frame(maxWidth: .infinity).padding(.vertical, 15)
            .background(Capsule().fill(Theme.brandGradient))
            .foregroundStyle(Color.black.opacity(0.85))
            .shadow(color: Theme.brandAccent.opacity(0.5), radius: 16, y: 8)
            .scaleEffect(configuration.isPressed ? 0.97 : 1)
            .animation(.spring(response: 0.3, dampingFraction: 0.7), value: configuration.isPressed)
    }
}

struct EmptyState: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let message: String
    var body: some View {
        let p = Theme.palette(scheme)
        Card {
            VStack(spacing: 8) {
                Text(title).font(.headline).foregroundStyle(p.textPrimary)
                Text(message).font(.subheadline).foregroundStyle(p.textMuted)
                    .multilineTextAlignment(.center)
            }
            .frame(maxWidth: .infinity).padding(.vertical, 24)
        }
    }
}

struct GlossarySheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    let entry: GlossaryEntry
    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 14) {
            Text(entry.term).font(.title3.bold()).foregroundStyle(p.textPrimary)
            Text(entry.def).font(.body).foregroundStyle(p.textMuted)
            Spacer()
            Button { dismiss() } label: {
                Text("Got it").frame(maxWidth: .infinity).padding(.vertical, 12)
                    .background(Capsule().fill(p.accent.opacity(0.15)))
                    .foregroundStyle(p.accent)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(p.bodyBg.ignoresSafeArea())
        .presentationDetents([.height(300), .medium])
    }
}
