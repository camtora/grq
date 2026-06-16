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
    static func money(_ cents: Int) -> String {
        cad.string(from: NSNumber(value: Double(cents) / 100)) ?? "$0.00"
    }
    static func signed(_ cents: Int) -> String {
        let s = money(abs(cents))
        return cents < 0 ? "−\(s)" : "+\(s)"
    }
    static func bps(_ b: Int) -> String { String(format: "%+.2f%%", Double(b) / 100) }
    static func pctBps(_ b: Int) -> String { String(format: "%.0f%%", Double(b) / 100) }
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
    var body: some View { Text(Fmt.money(cents)).monospacedDigit() }
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
