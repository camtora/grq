import SwiftUI

/// Palette resolved per active color scheme. Values are generated from
/// ../shared/tokens.json (the cross-platform source of truth). Cam = light,
/// Graham = dark.
struct Palette {
    let bodyBg, cardBg, cardBorder, textPrimary, textMuted, accent, accentText, pos, neg: Color
}

enum Theme {
    static let dark = Palette(
        bodyBg: Color(hex: "060d0c"),
        cardBg: Color(hex: "0e1a18"),
        cardBorder: Color(hex: "2dd4bf").opacity(0.20),
        textPrimary: Color(hex: "f0fdfa"),
        textMuted: Color(hex: "99f6e4"),
        accent: Color(hex: "2dd4bf"),
        accentText: Color(hex: "5eead4"),
        pos: Color(hex: "34d399"),
        neg: Color(hex: "f87171"))

    static let light = Palette(
        bodyBg: Color(hex: "f4faf8"),
        cardBg: Color(hex: "ffffff"),
        cardBorder: Color(hex: "0d9488").opacity(0.15),
        textPrimary: Color(hex: "0f3d36"),
        textMuted: Color(hex: "11665b"),
        accent: Color(hex: "0f766e"),
        accentText: Color(hex: "0d9488"),
        pos: Color(hex: "059669"),
        neg: Color(hex: "dc2626"))

    static func palette(_ scheme: ColorScheme) -> Palette { scheme == .dark ? dark : light }

    static let brandAccent = Color(hex: "14b8a6")
    static let brandGradient = LinearGradient(
        colors: [Color(hex: "5eead4"), Color(hex: "14b8a6")],
        startPoint: .topLeading, endPoint: .bottomTrailing)
}

extension Color {
    init(hex: String) {
        let s = hex.trimmingCharacters(in: CharacterSet(charactersIn: "#"))
        var v: UInt64 = 0
        Scanner(string: s).scanHexInt64(&v)
        let r = Double((v >> 16) & 0xFF) / 255
        let g = Double((v >> 8) & 0xFF) / 255
        let b = Double(v & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: 1)
    }
}
