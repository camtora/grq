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
    /// Basis points → percent. 60 bps → "+0.60%".
    static func bps(_ b: Int) -> String { String(format: "%+.2f%%", Double(b) / 100) }
}

struct Card<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    private let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        let p = Theme.palette(scheme)
        content
            .padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(RoundedRectangle(cornerRadius: 16).fill(p.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(p.cardBorder))
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
                    TermLink(slug: term, label: label.uppercased()).font(.caption2.weight(.semibold))
                } else {
                    Text(label.uppercased()).font(.caption2.weight(.semibold))
                        .foregroundStyle(p.textMuted.opacity(0.7))
                }
                Text(value).font(.title3.weight(.semibold).monospacedDigit())
                    .foregroundStyle(valueColor ?? p.textPrimary)
                if let note {
                    Text(note).font(.caption2).foregroundStyle(p.textMuted.opacity(0.6))
                }
            }
        }
    }
}

struct Chip: View {
    enum Tone { case teal, red, green, dim }
    @Environment(\.colorScheme) private var scheme
    let text: String
    var tone: Tone = .teal

    var body: some View {
        let p = Theme.palette(scheme)
        let color: Color = {
            switch tone {
            case .teal: return p.accent
            case .red: return p.neg
            case .green: return p.pos
            case .dim: return p.textMuted
            }
        }()
        Text(text.uppercased())
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(color.opacity(0.15)))
            .foregroundStyle(color)
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

/// An underlined term that pops its plain-English definition (the literacy pillar).
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
            .font(.caption.weight(.bold)).tracking(1.2)
            .foregroundStyle(Theme.palette(scheme).textMuted.opacity(0.7))
            .frame(maxWidth: .infinity, alignment: .leading)
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

/// A minimal sparkline for The Tape.
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
