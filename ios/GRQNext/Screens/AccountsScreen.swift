import SwiftUI

// Accounts — personal/external brokerage holdings (SnapTrade — TD TFSA etc.), mirroring the
// web /accounts page. VISIBILITY ONLY: read-only at the source, never traded by GRQ; both
// members see each other's. Reads GET /api/accounts (members-only). Pushed from Portfolio.
struct AccountsScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<AccountsResponse> = .loading

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { resp in content(resp) }
                .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Accounts")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ resp: AccountsResponse) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.lg) {
            // The guardrail, stated plainly (matches the web banner).
            GCard {
                HStack(alignment: .top, spacing: Space.sm) {
                    Image(systemName: "lock.fill").foregroundStyle(p.accent)
                    Text("Visibility only. GRQ can’t trade these — the connection is read-only at the source, kept separate from the fund. It’s here to see what you each hold outside the fund.")
                        .font(.caption).foregroundStyle(p.textMuted)
                }
            }
            ForEach(resp.members) { m in memberSection(m, p) }
        }
    }

    private func memberSection(_ m: MemberAccounts, _ p: Palette) -> some View {
        VStack(alignment: .leading, spacing: Space.sm) {
            HStack(spacing: 6) {
                Text(m.name).font(.headline).foregroundStyle(p.textPrimary)
                if m.isSelf { Chip(text: "you", tone: .dim) }
                Spacer()
                if !m.accounts.isEmpty {
                    Text(totalsLine(m.accounts)).font(.caption).monospacedDigit().foregroundStyle(p.textMuted)
                }
            }
            if m.accounts.isEmpty {
                GCard {
                    Text(m.connected ? "Linked — waiting on the first holdings sync." : (m.isSelf ? "Link your brokerage in SnapTrade to see your holdings here." : "\(m.name) hasn’t linked a brokerage yet."))
                        .font(.subheadline).foregroundStyle(p.textMuted)
                }
            } else {
                ForEach(m.accounts) { a in accountCard(a, p) }
            }
        }
    }

    private func accountCard(_ a: ExternalAccount, _ p: Palette) -> some View {
        GCard(padding: 0) {
            VStack(alignment: .leading, spacing: 0) {
                // Header row
                HStack {
                    VStack(alignment: .leading, spacing: 1) {
                        HStack(spacing: 6) {
                            Text(a.institution).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                            if let t = a.accountType { Chip(text: t, tone: .teal) }
                            if a.disabled { Chip(text: "reconnect", tone: .neg) }
                        }
                        if let n = a.numberMasked { Text(n).font(.caption2).monospacedDigit().foregroundStyle(p.textMuted) }
                    }
                    Spacer()
                    VStack(alignment: .trailing, spacing: 1) {
                        HStack(spacing: 4) {
                            Circle().fill(p.pos).frame(width: 6, height: 6)
                            Text(Fmt.money(a.totalValueCents, a.currency)).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary)
                        }
                        Text("prices live · holdings as of \(DateFmt.relative(a.syncedAt))").font(.caption2).foregroundStyle(p.textMuted)
                    }
                }
                .padding(Space.md)
                Divider().overlay(p.cardBorder)
                // Holdings
                if a.holdings.isEmpty {
                    Text("No holdings reported.").font(.caption).foregroundStyle(p.textMuted).padding(Space.md)
                } else {
                    ForEach(Array(a.holdings.enumerated()), id: \.element.id) { i, h in
                        NavigationLink { StockDetailView(symbol: h.symbol) } label: { holdingRow(h, p) }
                        if i < a.holdings.count - 1 { Divider().overlay(p.cardBorder) }
                    }
                }
            }
        }
    }

    private func holdingRow(_ h: ExternalHolding, _ p: Palette) -> some View {
        HStack(spacing: Space.md) {
            CompanyLogo(symbol: h.symbol, url: nil, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(h.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                if let d = h.description { Text(d).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1) }
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 1) {
                Text(Fmt.money(h.marketValueCents, h.currency)).font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(p.textPrimary)
                HStack(spacing: 6) {
                    Text("\(h.qty) sh").font(.caption2).foregroundStyle(p.textMuted)
                    if let pnl = h.openPnlCents {
                        Text(Fmt.signedMoney(pnl, h.currency)).font(.caption2).monospacedDigit().foregroundStyle(pnl >= 0 ? p.pos : p.neg)
                    }
                }
            }
        }
        .padding(Space.md)
        .contentShape(Rectangle())
    }

    /// Per-currency totals across a member's accounts, e.g. "C$12,340 · US$1,200".
    private func totalsLine(_ accounts: [ExternalAccount]) -> String {
        var by: [String: Int] = [:]
        for a in accounts { by[a.currency, default: 0] += a.totalValueCents }
        return by.sorted { $0.key < $1.key }.map { Fmt.money($0.value, $0.key) }.joined(separator: " · ")
    }

    private func load() async {
        if let r = await APIClient.shared.accounts() { state = .loaded(r) }
        else { state = .failed("Couldn’t load accounts. Pull to retry.") }
    }
}
