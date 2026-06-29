import SwiftUI
import Charts

// Widgets layered on the design system: markdown, charts, the rating needle, and small rows.
// All theme-aware via Theme.palette(scheme).

// MARK: - Markdown (headings · bullets · inline bold/italic/links)

struct MD: View {
    @Environment(\.colorScheme) private var scheme
    let text: String
    init(_ text: String) { self.text = text }

    private enum Block: Identifiable { case h(String), bullet(String), p(String); var id: String { switch self { case .h(let s): return "h"+s; case .bullet(let s): return "b"+s; case .p(let s): return "p"+s } } }

    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 6) {
            ForEach(blocks()) { b in
                switch b {
                case .h(let s):
                    Text(inline(s)).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary).padding(.top, 2)
                case .bullet(let s):
                    HStack(alignment: .firstTextBaseline, spacing: 8) {
                        Text("•").foregroundStyle(p.accent)
                        Text(inline(s)).foregroundStyle(p.textPrimary.opacity(0.9))
                    }
                case .p(let s):
                    Text(inline(s)).foregroundStyle(p.textPrimary.opacity(0.9))
                }
            }
        }
        .font(.subheadline)
        .tint(p.accent)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func blocks() -> [Block] {
        var out: [Block] = []
        for raw in text.components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.isEmpty { continue }
            if line.hasPrefix("#") {
                out.append(.h(String(line.drop(while: { $0 == "#" }).trimmingCharacters(in: .whitespaces))))
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
                out.append(.bullet(String(line.dropFirst(2))))
            } else {
                out.append(.p(line))
            }
        }
        return out
    }

    private func inline(_ s: String) -> AttributedString {
        (try? AttributedString(markdown: s, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(s)
    }
}

// MARK: - Charts

/// The NAV tape — an area+line of the day's NAV.
struct TapeChart: View {
    @Environment(\.colorScheme) private var scheme
    let points: [NavPoint]
    var height: CGFloat = 120
    var body: some View {
        let p = Theme.palette(scheme)
        let data = Array(points.enumerated()).map { (i, pt) in IdxVal(i: i, v: Double(pt.navCents) / 100) }
        Chart(data) { d in
            AreaMark(x: .value("t", d.i), y: .value("nav", d.v))
                .foregroundStyle(LinearGradient(colors: [p.accent.opacity(0.28), p.accent.opacity(0.0)], startPoint: .top, endPoint: .bottom))
            LineMark(x: .value("t", d.i), y: .value("nav", d.v))
                .foregroundStyle(p.accent)
                .interpolationMethod(.monotone)
        }
        .chartXAxis(.hidden)
        .chartYAxis(.hidden)
        .frame(height: height)
    }
    private struct IdxVal: Identifiable { let i: Int; let v: Double; var id: Int { i } }
}

/// A price history line (daily closes), green/red by net direction.
struct PriceChart: View {
    @Environment(\.colorScheme) private var scheme
    let closes: [ClosePoint]
    var height: CGFloat = 160
    var body: some View {
        let p = Theme.palette(scheme)
        let up = (closes.last?.c ?? 0) >= (closes.first?.c ?? 0)
        let color = up ? p.pos : p.neg
        Chart(closes) { pt in
            LineMark(x: .value("t", pt.t), y: .value("c", Double(pt.c) / 100))
                .foregroundStyle(color)
                .interpolationMethod(.monotone)
        }
        .chartXAxis(.hidden)
        .chartYAxis { AxisMarks(position: .trailing) }
        .frame(height: height)
    }
}

// MARK: - Rating needle (7-point)

struct RatingBar: View {
    @Environment(\.colorScheme) private var scheme
    let rating: Rating
    var showBlurb: Bool = true
    var body: some View {
        let p = Theme.palette(scheme)
        let tone = toneColor(rating.tone, p)
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(rating.label).font(.subheadline.weight(.bold)).foregroundStyle(tone)
                if showBlurb {
                    Text(rating.blurb).font(.caption).foregroundStyle(p.textMuted).lineLimit(2)
                }
            }
            GeometryReader { geo in
                let w = geo.size.width
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(LinearGradient(colors: [p.neg, Theme.hot(scheme), p.pos], startPoint: .leading, endPoint: .trailing))
                        .frame(height: 6)
                    Circle().fill(p.cardBg)
                        .frame(width: 16, height: 16)
                        .overlay(Circle().strokeBorder(tone, lineWidth: 3))
                        .offset(x: max(0, min(w - 16, w * rating.pos - 8)))
                }
                .frame(maxHeight: .infinity, alignment: .center)
            }
            .frame(height: 16)
        }
    }
    private func toneColor(_ tone: String, _ p: Palette) -> Color {
        switch tone {
        case "emerald": return p.pos
        case "red": return p.neg
        case "amber": return Theme.hot(scheme)
        default: return p.accent
        }
    }
}

// MARK: - Small rows

/// A label-left / value-right row for fact tables.
struct KVRow: View {
    @Environment(\.colorScheme) private var scheme
    let key: String
    let value: String
    var valueColor: Color? = nil
    var body: some View {
        let p = Theme.palette(scheme)
        HStack {
            Text(key).font(.subheadline).foregroundStyle(p.textMuted)
            Spacer()
            Text(value).font(.subheadline.weight(.semibold)).monospacedDigit()
                .foregroundStyle(valueColor ?? p.textPrimary)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Dates

enum DateFmt {
    private static let iso: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter(); f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]; return f
    }()
    private static let isoPlain = ISO8601DateFormatter()
    static func date(_ s: String?) -> Date? {
        guard let s else { return nil }
        return iso.date(from: s) ?? isoPlain.date(from: s)
    }
    /// "3d ago" / "2h ago" / "just now".
    static func relative(_ s: String?) -> String {
        guard let d = date(s) else { return "" }
        let secs = Date().timeIntervalSince(d)
        if secs < 60 { return "just now" }
        if secs < 3600 { return "\(Int(secs / 60))m ago" }
        if secs < 86400 { return "\(Int(secs / 3600))h ago" }
        return "\(Int(secs / 86400))d ago"
    }
    static func short(_ s: String?) -> String {
        guard let d = date(s) else { return s ?? "" }
        let f = DateFormatter(); f.dateFormat = "MMM d"; return f.string(from: d)
    }
}
