import SwiftUI

// GRQ Next — the design system. A small, native-feeling kit every screen reuses, built on
// the SHARED palette (Theme.swift, generated from ../shared/tokens.json). Cam = light,
// Graham = dark; every colour comes from `Theme.palette(scheme)` so both themes re-skin
// for free. No hardcoded hex in screens — reach for these.

// MARK: - Spacing / radii / type

enum Space {
    static let xs: CGFloat = 4, sm: CGFloat = 8, md: CGFloat = 12, lg: CGFloat = 16, xl: CGFloat = 24
}
enum Radius {
    static let card: CGFloat = 18, pill: CGFloat = 999, control: CGFloat = 12
}

// Strip markdown to a clean one-paragraph preview (for clamped card bodies).
func plainPreview(_ md: String) -> String {
    md.replacingOccurrences(of: "`", with: "")
        .split(separator: "\n")
        .map { $0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "").replacingOccurrences(of: "*", with: "").replacingOccurrences(of: "_", with: "") }
        .map { $0.hasPrefix("- ") ? String($0.dropFirst(2)) : $0 }
        .filter { !$0.isEmpty }
        .joined(separator: " ")
}

// MARK: - Money / number formatting (cents in, never floats on the wire)

enum Fmt {
    static func money(_ cents: Int, _ currency: String = "CAD") -> String {
        let sym = currency.uppercased() == "USD" ? "US$" : "$"
        let v = Double(cents) / 100
        let neg = v < 0
        let s = String(format: "%.2f", abs(v))
        // thousands separators
        let parts = s.split(separator: ".")
        let whole = Int(parts[0]) ?? 0
        let grouped = whole.formatted(.number.grouping(.automatic))
        return (neg ? "-" : "") + sym + grouped + "." + (parts.count > 1 ? parts[1] : "00")
    }
    static func signedMoney(_ cents: Int, _ currency: String = "CAD") -> String {
        (cents >= 0 ? "+" : "") + money(cents, currency)
    }
    /// Basis points → percent string. 125 bps → "+1.25%".
    static func bps(_ bps: Int, digits: Int = 2) -> String {
        let v = Double(bps) / 100
        return (v >= 0 ? "+" : "") + String(format: "%.\(digits)f%%", v)
    }
    /// A fraction (0.12) → "12%".
    static func pct(_ fraction: Double, digits: Int = 0) -> String {
        (fraction >= 0 ? "+" : "") + String(format: "%.\(digits)f%%", fraction * 100)
    }
    static func compact(_ cents: Int, _ currency: String = "CAD") -> String {
        let sym = currency.uppercased() == "USD" ? "US$" : "$"
        let v = Double(cents) / 100
        let a = abs(v)
        let neg = v < 0 ? "-" : ""
        switch a {
        case 1_000_000_000...: return "\(neg)\(sym)\(String(format: "%.1fB", a / 1_000_000_000))"
        case 1_000_000...: return "\(neg)\(sym)\(String(format: "%.1fM", a / 1_000_000))"
        case 1_000...: return "\(neg)\(sym)\(String(format: "%.0fK", a / 1_000))"
        default: return money(cents, currency)
        }
    }
}

// MARK: - Surfaces

/// The canonical panel surface — rounded card-bg + hairline border (mirrors the web Card).
struct GCard<Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    var padding: CGFloat = Space.lg
    @ViewBuilder var content: () -> Content
    var body: some View {
        let p = Theme.palette(scheme)
        content()
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(p.cardBg, in: RoundedRectangle(cornerRadius: Radius.card, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.card, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
    }
}

/// The page background wash.
struct ScreenBackground: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View { Theme.palette(scheme).bodyBg }
}

/// Standard scrolling screen body — padded vstack on the page background, with the nav
/// title and built-in pull-to-refresh. Every tab/screen uses this for a coherent shell.
struct ScreenScaffold<Content: View>: View {
    let title: String
    var refresh: (() async -> Void)? = nil
    @ViewBuilder var content: () -> Content
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.lg) { content() }
                .padding(Space.lg)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(title)
        .refreshable { await refresh?() }
    }
}

// MARK: - Text bits

/// Section heading that sits OUTSIDE a card (mirrors the web PanelHeader).
struct SectionHeader: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    var trailing: AnyView? = nil
    init(_ title: String, trailing: AnyView? = nil) { self.title = title; self.trailing = trailing }
    var body: some View {
        let p = Theme.palette(scheme)
        HStack(alignment: .firstTextBaseline) {
            Text(title.uppercased())
                .font(.caption.weight(.semibold))
                .tracking(0.8)
                .foregroundStyle(p.textMuted)
            Spacer()
            if let trailing { trailing }
        }
    }
}

/// A titled section: the heading OUTSIDE its content, stacked (mirrors the web's
/// PanelHeader + Card). Wrapping in its own VStack keeps it a single, correctly-stacked
/// child when placed in a parent VStack.
struct PanelSection<C: View>: View {
    let title: String
    @ViewBuilder var content: () -> C
    init(_ title: String, @ViewBuilder content: @escaping () -> C) { self.title = title; self.content = content }
    var body: some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            SectionHeader(title)
            content()
        }
    }
}

enum ChipTone { case teal, pos, neg, amber, dim }

struct Chip: View {
    @Environment(\.colorScheme) private var scheme
    let text: String
    var tone: ChipTone = .teal
    var body: some View {
        let p = Theme.palette(scheme)
        let (fg, bg): (Color, Color) = {
            switch tone {
            case .teal: return (p.accent, p.accent.opacity(0.12))
            case .pos: return (p.pos, p.pos.opacity(0.12))
            case .neg: return (p.neg, p.neg.opacity(0.12))
            case .amber: return (Theme.hot(scheme), Theme.hot(scheme).opacity(0.12))
            case .dim: return (p.textMuted, p.textMuted.opacity(0.12))
            }
        }()
        Text(text.uppercased())
            .font(.system(size: 10, weight: .bold))
            .tracking(0.6)
            .foregroundStyle(fg)
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(bg, in: Capsule())
    }
}

/// P&L coloured + signed.
struct PnlText: View {
    @Environment(\.colorScheme) private var scheme
    let cents: Int
    var currency: String = "CAD"
    var font: Font = .body.weight(.semibold)
    var body: some View {
        let p = Theme.palette(scheme)
        Text(Fmt.signedMoney(cents, currency))
            .font(font).monospacedDigit()
            .foregroundStyle(cents >= 0 ? p.pos : p.neg)
    }
}

/// A bps day-move badge ("+1.2%", coloured).
struct BpsBadge: View {
    @Environment(\.colorScheme) private var scheme
    let bps: Int
    var body: some View {
        let p = Theme.palette(scheme)
        Text(Fmt.bps(bps, digits: 2)).font(.caption.weight(.semibold)).monospacedDigit()
            .foregroundStyle(bps >= 0 ? p.pos : p.neg)
    }
}

/// Label + big value tile for stat strips.
struct StatTile: View {
    @Environment(\.colorScheme) private var scheme
    let label: String
    let value: String
    var note: String? = nil
    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.6).foregroundStyle(p.textMuted)
            Text(value).font(.title3.weight(.bold)).monospacedDigit().foregroundStyle(p.textPrimary)
            if let note { Text(note).font(.caption2).foregroundStyle(p.textMuted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Brand + controls

struct BrandMark: View {
    @Environment(\.colorScheme) private var scheme
    var height: CGFloat = 28
    var body: some View {
        Image(scheme == .dark ? "grq-logo" : "grq-logo-light")
            .resizable().scaledToFit().frame(height: height)
    }
}

/// The primary CTA — a teal gradient pill with dark text.
struct GradientButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Color(hex: "04110d"))
            .padding(.vertical, 14).frame(maxWidth: .infinity)
            .background(Theme.brandGradient, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

// MARK: - Company logo (remote, monogram fallback)

struct CompanyLogo: View {
    @Environment(\.colorScheme) private var scheme
    let symbol: String
    var url: String?
    var size: CGFloat = 36
    var body: some View {
        let p = Theme.palette(scheme)
        Group {
            if let url, let u = URL(string: url) {
                AsyncImage(url: u) { phase in
                    if let img = phase.image { img.resizable().scaledToFit() } else { monogram(p) }
                }
            } else { monogram(p) }
        }
        .frame(width: size, height: size)
        .background(p.cardHi, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
    private func monogram(_ p: Palette) -> some View {
        Text(String(symbol.prefix(2)).uppercased())
            .font(.system(size: size * 0.36, weight: .bold)).foregroundStyle(p.accent)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }
}

// MARK: - Async load state (standardises screens)

enum Loadable<T> {
    case loading
    case loaded(T)
    case failed(String)
}

/// Renders loading / error / content for an async fetch, with pull-to-refresh built in.
struct LoadableView<T, Content: View>: View {
    @Environment(\.colorScheme) private var scheme
    let state: Loadable<T>
    let retry: () async -> Void
    @ViewBuilder let content: (T) -> Content
    var body: some View {
        let p = Theme.palette(scheme)
        switch state {
        case .loading:
            ProgressView().tint(p.accent).frame(maxWidth: .infinity, minHeight: 200)
        case .failed(let msg):
            ContentUnavailableView {
                Label("Couldn’t load", systemImage: "wifi.exclamationmark")
            } description: { Text(msg) } actions: {
                Button("Retry") { Task { await retry() } }.buttonStyle(.bordered).tint(p.accent)
            }
            .frame(maxWidth: .infinity, minHeight: 200)
        case .loaded(let value):
            content(value)
        }
    }
}

// MARK: - Glossary sheet (literacy — tap a term)

struct GlossarySheet: View {
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    let entry: GlossaryEntry
    var body: some View {
        let p = Theme.palette(scheme)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.md) {
                    Text(entry.term).font(.title2.weight(.bold)).foregroundStyle(p.textPrimary)
                    Text(entry.def).font(.body).foregroundStyle(p.textPrimary.opacity(0.85))
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(Space.xl)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}
