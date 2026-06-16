import SwiftUI

struct PortfolioView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var pf: Portfolio?

    var body: some View {
        NavigationStack {
            ScrollView {
                if let pf {
                    VStack(alignment: .leading, spacing: 16) {
                        stats(pf)
                        riskFees(pf)
                        holdings(pf)
                        Text("Tap a term like ACB or weight for a plain-English definition.")
                            .font(.caption)
                            .foregroundStyle(Theme.palette(scheme).textMuted.opacity(0.7))
                    }
                    .padding(16)
                } else {
                    ProgressView().padding(40)
                }
            }
            .navigationTitle("Portfolio")
        }
        .task { pf = await APIClient.shared.portfolio() }
    }

    private func stats(_ pf: Portfolio) -> some View {
        let pal = Theme.palette(scheme)
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(label: "NAV", value: Fmt.money(pf.navCents), term: "nav")
            StatCard(label: "Cash", value: Fmt.money(pf.cashCents), term: "cash-floor",
                     note: weight(pf.cashCents, pf.navCents))
            StatCard(label: "Total P&L", value: Fmt.signed(pf.totalPnlCents), term: "total-pnl",
                     valueColor: pf.totalPnlCents >= 0 ? pal.pos : pal.neg,
                     note: percent(pf.totalPnlCents, pf.contributionsCents))
            if let b = pf.benchmarkCents {
                let diff = pf.navCents - b
                StatCard(label: "vs XIC", value: Fmt.signed(diff), term: "vs-xic",
                         valueColor: diff >= 0 ? pal.pos : pal.neg,
                         note: diff >= 0 ? "ahead" : "behind")
            }
        }
    }

    private func riskFees(_ pf: Portfolio) -> some View {
        let pal = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Risk").foregroundStyle(pal.textMuted)
                    Spacer()
                    Chip(text: pf.riskLevel.label, tone: .teal)
                }
                .font(.subheadline)
                KeyValueRow(label: "Fees this month",
                            value: "\(Fmt.money(pf.feeSpentMonthCents)) / \(Fmt.money(pf.feeBudgetCentsMonth))",
                            term: "fee-budget")
                KeyValueRow(label: "Contributions", value: Fmt.money(pf.contributionsCents), term: "contributions")
            }
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
                    ForEach(pf.positions) { pos in
                        VStack(spacing: 6) {
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(pos.symbol).font(.subheadline.weight(.semibold))
                                            .foregroundStyle(pal.textPrimary)
                                        BpsBadge(bps: pos.dayChangeBps).font(.caption2)
                                    }
                                    Text("\(pos.qty) sh · avg \(Fmt.money(pos.avgCostCents))")
                                        .font(.caption).foregroundStyle(pal.textMuted)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    MoneyText(cents: pos.marketValueCents).font(.subheadline)
                                        .foregroundStyle(pal.textPrimary)
                                    HStack(spacing: 6) {
                                        Pnl(cents: pos.unrealizedPnlCents).font(.caption)
                                        Text(weight(pos.marketValueCents, pf.navCents))
                                            .font(.caption2).foregroundStyle(pal.textMuted)
                                    }
                                }
                            }
                            if pos.id != pf.positions.last?.id { Divider().overlay(pal.cardBorder) }
                        }
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
