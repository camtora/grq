import SwiftUI

// Reusable list rows (presentation only — call sites wrap in NavigationLink to push the
// stock dossier). Theme-aware.

struct MoverRow: View {
    @Environment(\.colorScheme) private var scheme
    let mover: Mover
    var body: some View {
        let p = Theme.palette(scheme)
        HStack(spacing: Space.md) {
            CompanyLogo(symbol: mover.symbol, url: mover.logoUrl, size: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(mover.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                Text(mover.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(Fmt.money(mover.lastCents, mover.currency ?? "CAD")).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary)
                BpsBadge(bps: mover.dayChangeBps)
            }
        }
        .contentShape(Rectangle())
    }
}

struct IdeaRow: View {
    @Environment(\.colorScheme) private var scheme
    let idea: Idea
    var body: some View {
        let p = Theme.palette(scheme)
        HStack(spacing: Space.md) {
            CompanyLogo(symbol: idea.symbol, url: idea.logoUrl, size: 32)
            VStack(alignment: .leading, spacing: 1) {
                Text(idea.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                Text(idea.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 3) {
                if let r = idea.resolvedRating { Chip(text: r.abbr, tone: chipTone(r.tone)) }
                if let bps = idea.target.expectedReturnBps {
                    Text(Fmt.bps(bps, digits: 0) + " 12-mo").font(.caption2).monospacedDigit().foregroundStyle(bps >= 0 ? p.pos : p.neg)
                }
            }
        }
        .contentShape(Rectangle())
    }
}

struct PositionRow: View {
    @Environment(\.colorScheme) private var scheme
    let pos: Position
    var body: some View {
        let p = Theme.palette(scheme)
        let cur = pos.currency ?? "CAD"
        HStack(spacing: Space.md) {
            CompanyLogo(symbol: pos.symbol, url: pos.logoUrl, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(pos.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                Text("\(pos.qty) sh · \(Fmt.money(pos.avgCostCents, cur)) avg").font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(Fmt.money(pos.marketValueCents, cur)).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary)
                HStack(spacing: 6) {
                    PnlText(cents: pos.unrealizedPnlCents, currency: cur, font: .caption.weight(.semibold))
                    BpsBadge(bps: pos.dayChangeBps)
                }
            }
        }
        .contentShape(Rectangle())
    }
}

struct MarketNameRow: View {
    @Environment(\.colorScheme) private var scheme
    let m: MarketName
    var body: some View {
        let p = Theme.palette(scheme)
        HStack(spacing: Space.md) {
            CompanyLogo(symbol: m.symbol, url: m.logoUrl, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 6) {
                    Text(m.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    if let dir = m.directive { Chip(text: dir.label, tone: .amber) }
                }
                Text(m.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(Fmt.money(m.lastCents, m.currency ?? "CAD")).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary)
                HStack(spacing: 6) {
                    if let r = m.resolvedRating { Chip(text: r.abbr, tone: chipTone(r.tone)) }
                    BpsBadge(bps: m.dayChangeBps)
                }
            }
        }
        .contentShape(Rectangle())
    }
}

func chipTone(_ tone: String) -> ChipTone {
    switch tone {
    case "emerald": return .pos
    case "red": return .neg
    case "amber": return .amber
    default: return .teal
    }
}

/// NEW/ADD → positive, TRIM/EXIT → negative, else dim (smart-money action badges).
func actionChipTone(_ a: String) -> ChipTone {
    switch a.uppercased() {
    case "NEW", "ADD", "BUY": return .pos
    case "TRIM", "EXIT", "SELL": return .neg
    default: return .dim
    }
}
