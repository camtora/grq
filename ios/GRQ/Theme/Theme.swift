import SwiftUI

/// Palette resolved per scheme. Values generated from ../shared/tokens.json, with a
/// few extra steps (cardHi, glow) for the flashy elevated look. Cam = light, Graham = dark.
struct Palette {
    let bodyBg, cardBg, cardHi, cardBorder, textPrimary, textMuted, accent, accentText, pos, neg, glow: Color
}

enum Theme {
    static let dark = Palette(
        bodyBg: Color(hex: "060d0c"),
        cardBg: Color(hex: "0e1a18"),
        cardHi: Color(hex: "152824"),
        cardBorder: Color(hex: "2dd4bf").opacity(0.22),
        textPrimary: Color(hex: "e9fbf6"),
        textMuted: Color(hex: "8fbfb6"),
        accent: Color(hex: "2dd4bf"),
        accentText: Color(hex: "5eead4"),
        pos: Color(hex: "34d399"),
        neg: Color(hex: "f87171"),
        glow: Color(hex: "14b8a6").opacity(0.20))

    static let light = Palette(
        bodyBg: Color(hex: "eef6f4"),
        cardBg: Color(hex: "ffffff"),
        cardHi: Color(hex: "ffffff"),
        cardBorder: Color(hex: "0d9488").opacity(0.16),
        textPrimary: Color(hex: "08231f"),
        textMuted: Color(hex: "5b837c"),
        accent: Color(hex: "0d9488"),
        accentText: Color(hex: "0f766e"),
        pos: Color(hex: "059669"),
        neg: Color(hex: "dc2626"),
        glow: Color(hex: "0d9488").opacity(0.12))

    static func palette(_ scheme: ColorScheme) -> Palette { scheme == .dark ? dark : light }

    static let brandAccent = Color(hex: "14b8a6")
    static let brandGradient = LinearGradient(
        colors: [Color(hex: "5eead4"), Color(hex: "14b8a6")],
        startPoint: .topLeading, endPoint: .bottomTrailing)
    static let posGradient = LinearGradient(
        colors: [Color(hex: "5eead4"), Color(hex: "34d399")],
        startPoint: .leading, endPoint: .trailing)
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
