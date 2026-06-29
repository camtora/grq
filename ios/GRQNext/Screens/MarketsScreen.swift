import SwiftUI

// Markets — the web's market cluster on one screen via a segmented control: Watchlist ·
// Universe · Browse · Smart Money. Reads /api/market, /api/symbol-search, /api/smart-money.
struct MarketsScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var tab = 0
    @State private var market: Loadable<MarketPair> = .loading
    @State private var smart: Loadable<SmartMoneyResponse> = .loading
    @State private var query = ""
    @State private var results: [SearchHit] = []
    @State private var searching = false

    struct MarketPair { let universe: [MarketName]; let watchlist: [MarketName] }

    var body: some View {
        ScreenScaffold(title: "Markets", refresh: refresh) {
            VStack(alignment: .leading, spacing: Space.lg) {
                Picker("", selection: $tab) {
                    Text("Watchlist").tag(0); Text("Universe").tag(1); Text("Browse").tag(2); Text("Smart $").tag(3)
                }
                .pickerStyle(.segmented)

                switch tab {
                case 0, 1: marketTab
                case 2: browseTab
                default: smartTab
                }
            }
        }
        .grqChrome()
        .task { if case .loading = market { await loadMarket() } }
    }

    // MARK: watchlist / universe

    private var marketTab: some View {
        LoadableView(state: market, retry: loadMarket) { m in
            nameList(tab == 0 ? m.watchlist : m.universe, empty: tab == 0 ? "No watchlist names yet." : "No active names yet.")
        }
    }

    private func nameList(_ items: [MarketName], empty: String) -> some View {
        let p = Theme.palette(scheme)
        return Group {
            if items.isEmpty {
                GCard { Text(empty).font(.subheadline).foregroundStyle(p.textMuted) }
            } else {
                GCard(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(items.enumerated()), id: \.element.id) { i, m in
                            NavigationLink { StockDetailView(symbol: m.symbol) } label: { MarketNameRow(m: m).padding(Space.md) }
                            if i < items.count - 1 { Divider().overlay(p.cardBorder) }
                        }
                    }
                }
            }
        }
    }

    // MARK: browse (search)

    private var browseTab: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.md) {
            HStack(spacing: Space.sm) {
                Image(systemName: "magnifyingglass").foregroundStyle(p.textMuted)
                TextField("Search any name or ticker", text: $query)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await doSearch() } }
                if !query.isEmpty {
                    Button { query = ""; results = [] } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(p.textMuted) }
                }
            }
            .padding(Space.md)
            .background(p.cardBg, in: RoundedRectangle(cornerRadius: Radius.control, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Radius.control, style: .continuous).strokeBorder(p.cardBorder))

            if searching {
                ProgressView().tint(p.accent).frame(maxWidth: .infinity, minHeight: 80)
            } else if !results.isEmpty {
                GCard(padding: 0) {
                    VStack(spacing: 0) {
                        ForEach(Array(results.enumerated()), id: \.element.id) { i, hit in
                            NavigationLink { StockDetailView(symbol: hit.symbol) } label: { searchRow(hit, p).padding(Space.md) }
                            if i < results.count - 1 { Divider().overlay(p.cardBorder) }
                        }
                    }
                }
            } else {
                GCard { Text(query.isEmpty ? "Search any North-American name or ticker to pull its dossier." : "No matches.").font(.subheadline).foregroundStyle(p.textMuted) }
            }
        }
    }

    private func searchRow(_ hit: SearchHit, _ p: Palette) -> some View {
        HStack(spacing: Space.md) {
            CompanyLogo(symbol: hit.symbol, url: nil, size: 30)
            VStack(alignment: .leading, spacing: 1) {
                Text(hit.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                Text(hit.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
            }
            Spacer()
            if let ex = hit.exchange { Text(ex).font(.caption2).foregroundStyle(p.textMuted) }
        }
        .contentShape(Rectangle())
    }

    // MARK: smart money

    private var smartTab: some View {
        LoadableView(state: smart, retry: loadSmart) { sm in smartContent(sm) }
            .task { if case .loading = smart { await loadSmart() } }
    }

    private func smartContent(_ sm: SmartMoneyResponse) -> some View {
        VStack(alignment: .leading, spacing: Space.lg) {
            if let n = sm.narrative {
                PanelSection(n.title.isEmpty ? "The read" : n.title) { GCard { MD(n.body) } }
            }
            if !sm.portfolios.isEmpty {
                PanelSection("Tracked portfolios") {
                    VStack(spacing: Space.md) { ForEach(sm.portfolios) { portfolioCard($0) } }
                }
            }
            if !sm.congress.isEmpty { leaderSection("Congress", sm.congress) }
            if !sm.funds.isEmpty { leaderSection("Funds piling in", sm.funds) }
            if !sm.insiders.isEmpty { leaderSection("Insider buys", sm.insiders) }
        }
    }

    private func portfolioCard(_ pf: SmartPortfolio) -> some View {
        let p = Theme.palette(scheme)
        return GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 1) {
                        Text(pf.name).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                        if let s = pf.subtitle { Text(s).font(.caption2).foregroundStyle(p.textMuted) }
                    }
                    Spacer()
                    if let v = pf.totalValueUsd { Text(Fmt.compact(Int(v * 100), "USD")).font(.caption).monospacedDigit().foregroundStyle(p.textMuted) }
                }
                ForEach(pf.topHoldings.prefix(5)) { h in
                    NavigationLink { StockDetailView(symbol: h.symbol) } label: {
                        HStack(spacing: 6) {
                            Text(h.symbol).font(.caption.weight(.semibold)).foregroundStyle(p.textPrimary)
                            if let ck = h.changeKind { Chip(text: ck, tone: actionChipTone(ck)) }
                            if let pc = h.putCall { Chip(text: pc, tone: pc == "PUT" ? .neg : .pos) }
                            Spacer()
                            if let w = h.weightBps { Text(String(format: "%.1f%%", Double(w) / 100)).font(.caption2).monospacedDigit().foregroundStyle(p.textMuted) }
                        }
                        .contentShape(Rectangle())
                    }
                }
            }
        }
    }

    private func leaderSection(_ title: String, _ rows: [LeaderRow]) -> some View {
        let p = Theme.palette(scheme)
        return PanelSection(title) {
            GCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(Array(rows.enumerated()), id: \.element.id) { i, r in
                        NavigationLink { StockDetailView(symbol: r.symbol) } label: {
                            HStack {
                                VStack(alignment: .leading, spacing: 1) {
                                    Text(r.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                                    Text(r.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                                }
                                Spacer()
                                VStack(alignment: .trailing, spacing: 1) {
                                    Text(r.primary).font(.caption.weight(.semibold)).foregroundStyle(p.accent)
                                    if let s = r.secondary { Text(s).font(.caption2).foregroundStyle(p.textMuted) }
                                }
                            }
                            .padding(Space.md)
                            .contentShape(Rectangle())
                        }
                        if i < rows.count - 1 { Divider().overlay(p.cardBorder) }
                    }
                }
            }
        }
    }

    // MARK: load

    private func loadMarket() async {
        let m = await APIClient.shared.market()
        market = .loaded(MarketPair(universe: m.universe, watchlist: m.watchlist))
    }
    private func loadSmart() async {
        if let sm = await APIClient.shared.smartMoney() { smart = .loaded(sm) }
        else { smart = .failed("Couldn’t load smart money. Pull to retry.") }
    }
    private func doSearch() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { results = []; return }
        searching = true
        results = await APIClient.shared.search(q)
        searching = false
    }
    private func refresh() async {
        await loadMarket()
        if case .loaded = smart { await loadSmart() }
        if tab == 2 && !query.isEmpty { await doSearch() }
    }
}
