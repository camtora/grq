import SwiftUI

// MARKETS — the hub folding the four web market destinations behind one tab:
// Watchlist · Universe · Browse · Smart Money. Universe = the investable set the agent
// may buy; Watchlist = candidates being researched; Browse = screener search to add a
// name; Smart Money = what notable portfolios are doing.
struct MarketsView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var tab: MarketTab = .watchlist
    @State private var universe: [MarketName] = []
    @State private var watchlist: [MarketName] = []
    @State private var loaded = false
    @State private var actionNote: String?

    private var isMember: Bool { auth.currentUser?.role == .member }

    enum MarketTab: String, CaseIterable { case watchlist = "Watchlist", universe = "Universe", browse = "Browse", smartMoney = "Smart Money" }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top) {
                        ScreenHeader(title: "Markets", subtitle: "what GRQ tracks")
                        ChatButton()
                    }
                    selector
                    if let actionNote { Text(actionNote).font(.caption).foregroundStyle(Theme.palette(scheme).accentText) }
                    switch tab {
                    case .watchlist:  rows(watchlist, candidates: true)
                    case .universe:   rows(universe, candidates: false)
                    case .browse:     BrowseSection(isMember: isMember) { note in actionNote = note }
                    case .smartMoney: SmartMoneySection()
                    }
                }
                .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 32)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .task { if !loaded { await load() } }
    }

    private var selector: some View {
        let p = Theme.palette(scheme)
        return ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(MarketTab.allCases, id: \.self) { t in
                    Button { tab = t } label: {
                        Text(t.rawValue).font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 14).padding(.vertical, 8)
                            .background(Capsule().fill(tab == t ? p.accent.opacity(0.18) : p.cardBg))
                            .overlay(Capsule().strokeBorder(tab == t ? p.accent.opacity(0.4) : p.cardBorder, lineWidth: 1))
                            .foregroundStyle(tab == t ? p.accentText : p.textMuted)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    @ViewBuilder private func rows(_ names: [MarketName], candidates: Bool) -> some View {
        let p = Theme.palette(scheme)
        if !loaded {
            ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 40)
        } else if names.isEmpty {
            EmptyState(title: candidates ? "No candidates" : "No investable names",
                       message: candidates ? "Add one from Browse, or watch a find in The Hunt." : "Nothing promoted into the universe yet.")
        } else {
            Card {
                VStack(spacing: 0) {
                    ForEach(Array(names.enumerated()), id: \.element.id) { idx, n in
                        MarketRow(name: n, isMember: isMember, candidate: candidates,
                                  onPromote: { Task { await promote(n) } },
                                  onDirective: { dir in Task { await directive(n, dir) } })
                        if idx < names.count - 1 { Divider().overlay(p.cardBorder.opacity(0.5)).padding(.vertical, 12) }
                    }
                }
            }
        }
    }

    // MARK: data + actions

    private func load() async {
        let m = await APIClient.shared.market()
        universe = m.universe; watchlist = m.watchlist; loaded = true
    }

    private func promote(_ n: MarketName) async {
        guard await BiometricGate.confirm("Confirm it's you to promote \(n.symbol).") else { return }
        let res = await APIClient.shared.universeAction(n.symbol, "promote")
        actionNote = res.error ?? "\(n.symbol): promotion requested — needs the other member too."
        await load()
    }

    private func directive(_ n: MarketName, _ dir: Directive) async {
        guard await BiometricGate.confirm("Confirm it's you to change \(n.symbol).") else { return }
        let target: String? = n.directive == dir ? nil : (dir == .pin ? "PINNED" : "BLOCKED")
        let res = await APIClient.shared.setDirective(n.symbol, target)
        if res.ok { await load() } else { actionNote = res.error }
    }
}

// MARK: - A market row (logo · ticker · rating · price · move + member controls)

struct MarketRow: View {
    @Environment(\.colorScheme) private var scheme
    let name: MarketName
    let isMember: Bool
    let candidate: Bool
    let onPromote: () -> Void
    let onDirective: (Directive) -> Void

    var body: some View {
        let p = Theme.palette(scheme)
        HStack(spacing: 12) {
            NavigationLink { StockDetailView(symbol: name.symbol) } label: {
                HStack(spacing: 12) {
                    StockLogo(symbol: name.symbol, url: name.logoUrl, size: 38)
                    VStack(alignment: .leading, spacing: 3) {
                        HStack(spacing: 6) {
                            Text(name.symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                                .lineLimit(1).minimumScaleFactor(0.8)
                            if let r = name.resolvedRating { StanceBadge(rating: r) }
                        }
                        Text(name.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                    }
                }
            }
            .buttonStyle(.plain)
            Spacer(minLength: 8)
            if name.lastCents > 0 {
                VStack(alignment: .trailing, spacing: 2) {
                    MoneyText(cents: name.lastCents, currency: name.currency)
                        .font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary).lineLimit(1)
                    BpsBadge(bps: name.dayChangeBps).font(.caption)
                }
                .fixedSize(horizontal: true, vertical: false)
                .layoutPriority(1)
            }
            if isMember {
                if candidate {
                    Button(action: onPromote) {
                        Text("Promote").font(.caption.weight(.bold))
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(Capsule().fill(p.accent.opacity(0.15))).foregroundStyle(p.accent)
                    }.buttonStyle(.plain)
                } else {
                    HStack(spacing: 12) {
                        Button { onDirective(.pin) } label: {
                            Image(systemName: name.directive == .pin ? "star.fill" : "star")
                                .foregroundStyle(name.directive == .pin ? p.accent : p.textMuted.opacity(0.45))
                        }
                        Button { onDirective(.noFly) } label: {
                            Image(systemName: "nosign").foregroundStyle(name.directive == .noFly ? p.neg : p.textMuted.opacity(0.45))
                        }
                    }
                    .buttonStyle(.plain).font(.subheadline)
                }
            }
        }
        .opacity(name.directive == .noFly ? 0.55 : 1)
    }
}

// MARK: - Browse (screener search → add)

struct BrowseSection: View {
    @Environment(\.colorScheme) private var scheme
    let isMember: Bool
    let onNote: (String) -> Void
    @State private var query = ""
    @State private var results: [SearchHit] = []
    @State private var searching = false

    var body: some View {
        let p = Theme.palette(scheme)
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").foregroundStyle(p.textMuted)
                TextField("Search a ticker or company — e.g. ANET", text: $query)
                    .textInputAutocapitalization(.characters).autocorrectionDisabled()
                    .submitLabel(.search).onSubmit { Task { await run() } }
                    .foregroundStyle(p.textPrimary)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))

            if !isMember {
                Text("Browse + add is members-only.").font(.caption).foregroundStyle(p.textMuted)
            } else if searching {
                ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 20)
            } else if !results.isEmpty {
                Card {
                    VStack(spacing: 0) {
                        ForEach(Array(results.enumerated()), id: \.element.id) { idx, hit in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(hit.symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                                    Text(hit.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                                }
                                Spacer()
                                if let ex = hit.exchange { Text(ex).font(.caption2).foregroundStyle(p.textMuted) }
                                Button { Task { await add(hit) } } label: {
                                    Text("Watch").font(.caption.weight(.bold))
                                        .padding(.horizontal, 10).padding(.vertical, 5)
                                        .background(Capsule().fill(p.accent.opacity(0.15))).foregroundStyle(p.accent)
                                }.buttonStyle(.plain)
                            }
                            if idx < results.count - 1 { Divider().overlay(p.cardBorder.opacity(0.5)).padding(.vertical, 10) }
                        }
                    }
                }
            } else if !query.isEmpty {
                Text("No matches — try a different ticker.").font(.subheadline).foregroundStyle(p.textMuted)
            }
        }
    }

    private func run() async {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return }
        searching = true
        results = await APIClient.shared.search(q)
        searching = false
    }

    private func add(_ hit: SearchHit) async {
        let res = await APIClient.shared.watch(hit.symbol, exchange: hit.exchange, currency: hit.currency, name: hit.name)
        onNote(res.error ?? "\(hit.symbol) added to the watchlist — dossier queued.")
    }
}
