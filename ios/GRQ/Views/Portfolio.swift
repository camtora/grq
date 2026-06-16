import SwiftUI

struct PortfolioView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var pf: Portfolio?

    var body: some View {
        NavigationStack {
            GRQScreen(title: "Portfolio", subtitle: "the fund") {
                if let pf {
                    heroCard(pf)
                    statRow(pf)
                    holdings(pf)
                    Text("Tap a term like ACB or weight for a plain-English definition.")
                        .font(.caption).foregroundStyle(Theme.palette(scheme).textMuted.opacity(0.7))
                } else {
                    ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(40)
                }
            }
        }
        .task { pf = await APIClient.shared.portfolio() }
    }

    private func heroCard(_ pf: Portfolio) -> some View {
        let pal = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                TermLink(slug: "nav", label: "NET ASSET VALUE").font(.caption2.weight(.bold))
                HeroAmount(cents: pf.navCents)
                HStack(spacing: 10) {
                    HStack(spacing: 6) {
                        Pnl(cents: pf.totalPnlCents).font(.subheadline.weight(.bold))
                        Text(percent(pf.totalPnlCents, pf.contributionsCents))
                            .font(.caption).foregroundStyle(pal.textMuted)
                    }
                    if let b = pf.benchmarkCents {
                        Divider().frame(height: 16).overlay(pal.cardBorder)
                        HStack(spacing: 6) {
                            TermLink(slug: "vs-xic", label: "vs XIC").font(.caption)
                            Pnl(cents: pf.navCents - b).font(.caption.weight(.semibold))
                        }
                    }
                }
            }
        }
    }

    private func statRow(_ pf: Portfolio) -> some View {
        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(label: "Cash", value: Fmt.money(pf.cashCents), term: "cash-floor",
                     note: weight(pf.cashCents, pf.navCents))
            StatCard(label: "Risk", value: pf.riskLevel.label)
            StatCard(label: "Fees (mo)", value: Fmt.money(pf.feeSpentMonthCents), term: "fee-budget",
                     note: "of \(Fmt.money(pf.feeBudgetCentsMonth))")
            StatCard(label: "Invested", value: Fmt.money(pf.positionsCents),
                     note: weight(pf.positionsCents, pf.navCents))
        }
    }

    private func holdings(_ pf: Portfolio) -> some View {
        let pal = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "Holdings")
                if pf.positions.isEmpty {
                    Text("Nothing held yet. The robot is still shopping.")
                        .font(.subheadline).foregroundStyle(pal.textMuted)
                } else {
                    ForEach(Array(pf.positions.enumerated()), id: \.element.id) { idx, pos in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(pos.symbol).font(.subheadline.weight(.bold)).foregroundStyle(pal.textPrimary)
                                    BpsBadge(bps: pos.dayChangeBps).font(.caption2)
                                }
                                Text("\(pos.qty) sh · avg \(Fmt.money(pos.avgCostCents))")
                                    .font(.caption).foregroundStyle(pal.textMuted)
                            }
                            Spacer()
                            VStack(alignment: .trailing, spacing: 2) {
                                MoneyText(cents: pos.marketValueCents).font(.subheadline.weight(.semibold))
                                    .foregroundStyle(pal.textPrimary)
                                HStack(spacing: 6) {
                                    Pnl(cents: pos.unrealizedPnlCents).font(.caption)
                                    Text(weight(pos.marketValueCents, pf.navCents))
                                        .font(.caption2).foregroundStyle(pal.textMuted)
                                }
                            }
                        }
                        if idx < pf.positions.count - 1 { Divider().overlay(pal.cardBorder.opacity(0.5)) }
                    }
                }
            }
        }
    }

    private func percent(_ pnl: Int, _ base: Int) -> String {
        guard base > 0 else { return "" }
        return String(format: "%+.2f%%", Double(pnl) / Double(base) * 100)
    }
    private func weight(_ part: Int, _ whole: Int) -> String {
        guard whole > 0 else { return "" }
        return String(format: "%.0f%% of NAV", Double(part) / Double(whole) * 100)
    }
}
