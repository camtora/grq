import SwiftUI

// THE FUND — the portfolio: NAV, total P&L vs the benchmark, the risk/cash/fees grid,
// and holdings with logos, day moves and weights.
struct PortfolioView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var pf: Portfolio?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                BrandHeader(title: "THE FUND")
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
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
                    .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 32)
                }
                .refreshable { pf = await APIClient.shared.portfolio() }
            }
            .background(ScreenBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
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
                        Text(percent(pf.totalPnlCents, pf.contributionsCents)).font(.caption).foregroundStyle(pal.textMuted)
                    }
                    if let b = pf.benchmarkCents {
                        Divider().frame(height: 16).overlay(pal.cardBorder)
                        HStack(spacing: 6) {
                            TermLink(slug: "vs-xic", label: "vs XIC").font(.caption)
                            Pnl(cents: pf.navCents - b).font(.caption.weight(.semibold))
                        }
                    }
                }
                if pf.killSwitch {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.octagon.fill").foregroundStyle(pal.neg)
                        Text("Kill switch engaged\(pf.killSwitchBy.map { " by \($0)" } ?? "") — nothing trades.")
                            .font(.caption.weight(.semibold)).foregroundStyle(pal.neg)
                    }
                }
            }
        }
    }

    private func statRow(_ pf: Portfolio) -> some View {
        // Currency split (D62): the fund now holds CAD + USD. cashCents is the CAD total;
        // cadCashCents is the raw CAD, so USD-in-CAD = cashCents − cadCashCents.
        let cadCash = pf.cadCashCents ?? pf.cashCents
        let usdCash = pf.usdCashCents ?? 0
        let fx = pf.fxUsdCad ?? 0
        let usdCashInCad = pf.cashCents - cadCash
        let usdPosInCad = pf.positions
            .filter { ($0.currency ?? "CAD") == "USD" }
            .reduce(0) { $0 + Int(Double($1.marketValueCents) * (fx > 0 ? fx : 1)) }
        let usdPct = pf.navCents > 0 ? Double(usdCashInCad + usdPosInCad) / Double(pf.navCents) * 100 : 0
        let holdsUsd = usdCash > 0 || usdPosInCad > 0
        return LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
            StatCard(label: "Cash",
                     value: holdsUsd ? Fmt.money(cadCash) : Fmt.money(pf.cashCents),
                     term: "cash-floor",
                     note: holdsUsd ? "US\(Fmt.money(usdCash)) · \(String(format: "%.0f%% in USD", usdPct))"
                                    : weight(pf.cashCents, pf.navCents))
            StatCard(label: "Risk", value: pf.riskLevel.label)
            StatCard(label: "Fees (mo)", value: Fmt.money(pf.feeSpentMonthCents), term: "fee-budget", note: "of \(Fmt.money(pf.feeBudgetCentsMonth))")
            StatCard(label: "Invested", value: Fmt.money(pf.positionsCents), note: weight(pf.positionsCents, pf.navCents))
        }
    }

    private func holdings(_ pf: Portfolio) -> some View {
        let pal = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                SectionTitle(text: "Holdings")
                if pf.positions.isEmpty {
                    Text("Nothing held yet. The robot is still shopping.").font(.subheadline).foregroundStyle(pal.textMuted)
                } else {
                    ForEach(Array(pf.positions.enumerated()), id: \.element.id) { idx, pos in
                        NavigationLink { StockDetailView(symbol: pos.symbol) } label: {
                            HStack(spacing: 12) {
                                StockLogo(symbol: pos.symbol, url: pos.logoUrl, size: 36)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(pos.symbol).font(.subheadline.weight(.bold)).foregroundStyle(pal.textPrimary)
                                        BpsBadge(bps: pos.dayChangeBps).font(.caption2)
                                    }
                                    Text("\(pos.qty) sh · now \(Fmt.money(pos.lastCents)) · avg \(Fmt.money(pos.avgCostCents))")
                                        .font(.caption).foregroundStyle(pal.textMuted)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 2) {
                                    MoneyText(cents: pos.marketValueCents).font(.subheadline.weight(.semibold)).foregroundStyle(pal.textPrimary)
                                    HStack(spacing: 6) {
                                        Pnl(cents: pos.unrealizedPnlCents).font(.caption)
                                        Text(weight(pos.marketValueCents, pf.navCents)).font(.caption2).foregroundStyle(pal.textMuted)
                                    }
                                }
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
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
