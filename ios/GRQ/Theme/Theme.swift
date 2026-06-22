import SwiftUI
import Foundation

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

    /// The Hunt's "heat" ramp — a theme-AGNOSTIC hue-coded colour (mirrors
    /// web/lib/heat.ts). Lightness 0.72 was chosen to read on both the dark
    /// near-black and the light card; hue sweeps teal-green (cool, low heat) →
    /// amber/orange (hot) as heat climbs. So heat looks the same for Cam (light)
    /// and Graham (dark) — only the surfaces around it flip with the palette.
    static func heatColor(_ heat: Double) -> Color {
        let h = 175 - max(0, min(100, heat)) / 100 * 150   // 175 → 25
        return Color(oklchL: 0.72, c: 0.17, h: h)
    }

    /// Heat colour for TEXT glyphs (rank · heat score · monogram). The L0.72 ramp reads on
    /// the dark near-black but is too pale for text on Cam's WHITE cards, so light mode
    /// drops lightness to ~0.55 (same hue/chroma) to clear contrast. Decorative FILLS
    /// (rails, meters, tile washes) keep the brighter `heatColor`.
    static func heatTextColor(_ heat: Double, _ scheme: ColorScheme) -> Color {
        let h = 175 - max(0, min(100, heat)) / 100 * 150
        return Color(oklchL: scheme == .dark ? 0.72 : 0.55, c: 0.17, h: h)
    }

    /// The "hot / hottest" orange accent. #ff7a45 pops on dark but fails as label TEXT on
    /// white, so light mode uses a deeper burnt orange. Fills/glows keep the bright tone.
    static func hot(_ scheme: ColorScheme) -> Color {
        scheme == .dark ? Color(hex: "ff7a45") : Color(hex: "c2410c")
    }
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

    /// OKLCH → sRGB (Björn Ottosson's transform). `l` lightness 0–1, `c` chroma,
    /// `h` hue in degrees. SwiftUI/UIKit have no native OKLCH, so we convert to
    /// linear sRGB and hand SwiftUI the linear-space colour. Used for the heat ramp
    /// (kept identical to the web so a "heat 88" name is the same orange everywhere).
    init(oklchL l: Double, c: Double, h: Double, opacity: Double = 1) {
        let hr = h * .pi / 180
        let a = c * cos(hr)
        let b = c * sin(hr)
        let l_ = l + 0.3963377774 * a + 0.2158037573 * b
        let m_ = l - 0.1055613458 * a - 0.0638541728 * b
        let s_ = l - 0.0894841775 * a - 1.2914855480 * b
        let lc = l_ * l_ * l_, mc = m_ * m_ * m_, sc = s_ * s_ * s_
        let r =  4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc
        let g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc
        let bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.7076147010 * sc
        let cl = { (v: Double) in min(1, max(0, v)) }
        self.init(.sRGBLinear, red: cl(r), green: cl(g), blue: cl(bl), opacity: opacity)
    }
}
