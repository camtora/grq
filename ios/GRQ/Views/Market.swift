import SwiftUI

/// The Watchlist — everything GRQ tracks: the investable set it may buy, plus the
/// candidates it's researching. Search filters both. Member actions (pin / no-fly
/// directives, promote, propose) are mock here; the real ones hit
/// /api/stocks/directive + /api/universe (member + Face ID — see IOS-PLAN.md).
struct WatchlistView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var universe: [MarketName] = []
    @State private var watchlist: [MarketName] = []
    @State private var query = ""
    @State private var showPropose = false
    @State private var proposeSymbol = ""
    @State private var promoteTarget: MarketName?
    @State private var showPromote = false

    private var isMember: Bool { auth.currentUser?.role == .member }

    // Case-insensitive search over symbol + company name.
    private func matches(_ xs: [MarketName]) -> [MarketName] {
        let q = query.trimmingCharacters(in: .whitespaces).lowercased()
        guard !q.isEmpty else { return xs }
        return xs.filter { $0.symbol.lowercased().contains(q) || $0.name.lowercased().contains(q) }
    }
    private var filteredUniverse: [MarketName] { matches(universe) }
    private var filteredWatchlist: [MarketName] { matches(watchlist) }

    var body: some View {
        NavigationStack {
            GRQScreen(title: "Watchlist", subtitle: "what GRQ tracks & may buy") {
                searchField
                summaryCard
                universeSection
                watchlistSection
            }
        }
        .task {
            let m = await APIClient.shared.market()
            universe = m.universe
            watchlist = m.watchlist
        }
        .alert("Propose a name", isPresented: $showPropose) {
            TextField("Ticker — e.g. NVDA", text: $proposeSymbol)
                .textInputAutocapitalization(.characters)
            Button("Add to watchlist") { addProposed() }
            Button("Cancel", role: .cancel) { proposeSymbol = "" }
        } message: {
            Text("Adds a candidate to the watchlist for the agent to research. It can't be traded until it's promoted into the universe.")
        }
        .confirmationDialog("Promote \(promoteTarget?.symbol ?? "") to the universe?",
                            isPresented: $showPromote, titleVisibility: .visible) {
            Button("Promote — GRQ may buy it") { promote() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("On the real fund this needs both members plus a liquidity screen.")
        }
    }

    // MARK: - Cards

    private var searchField: some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").foregroundStyle(p.textMuted)
            TextField("Search stocks", text: $query)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .foregroundStyle(p.textPrimary)
            if !query.isEmpty {
                Button { query = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(p.textMuted)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
    }

    private var summaryCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    Text("\(universe.count)")
                        .font(.system(size: 40, weight: .black, design: .rounded))
                        .foregroundStyle(Theme.brandGradient)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("INVESTABLE NAMES").font(.caption2.weight(.bold)).foregroundStyle(p.textMuted)
                        Text("the agent only ever trades these").font(.caption).foregroundStyle(p.textMuted)
                    }
                    Spacer()
                }
                if isMember {
                    Button { proposeSymbol = ""; showPropose = true } label: {
                        Label("Propose a name", systemImage: "plus.circle.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(p.accent)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    private var universeSection: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                TermLink(slug: "universe", label: "Universe").font(.caption.weight(.bold))
                Text("· GRQ's investable set").font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
                Spacer()
            }
            Card {
                VStack(spacing: 0) {
                    if filteredUniverse.isEmpty {
                        Text(query.isEmpty ? "No investable names yet." : "No matches.")
                            .font(.subheadline).foregroundStyle(p.textMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ForEach(Array(filteredUniverse.enumerated()), id: \.element.id) { idx, n in
                            universeRow(n)
                            if idx < filteredUniverse.count - 1 {
                                Divider().overlay(p.cardBorder.opacity(0.5)).padding(.vertical, 12)
                            }
                        }
                    }
                }
            }
        }
    }

    private var watchlistSection: some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 6) {
                TermLink(slug: "watchlist", label: "Watchlist").font(.caption.weight(.bold))
                Text("· candidates, not yet tradable").font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
                Spacer()
            }
            Card {
                VStack(spacing: 0) {
                    if filteredWatchlist.isEmpty {
                        Text(query.isEmpty ? "No candidates. Propose one above." : "No matches.")
                            .font(.subheadline).foregroundStyle(p.textMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    } else {
                        ForEach(Array(filteredWatchlist.enumerated()), id: \.element.id) { idx, n in
                            watchRow(n)
                            if idx < filteredWatchlist.count - 1 {
                                Divider().overlay(p.cardBorder.opacity(0.5)).padding(.vertical, 12)
                            }
                        }
                    }
                }
            }
        }
    }

    // MARK: - Rows

    private func universeRow(_ n: MarketName) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 12) {
            NavigationLink { StockDetailView(symbol: n.symbol) } label: { nameBlock(n) }
                .buttonStyle(.plain)
            Spacer(minLength: 8)
            VStack(alignment: .trailing, spacing: 2) {
                MoneyText(cents: n.lastCents).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                BpsBadge(bps: n.dayChangeBps).font(.caption)
            }
            if isMember { directiveControls(n) }
        }
        .opacity(n.directive == .noFly ? 0.5 : 1)
    }

    private func watchRow(_ n: MarketName) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 12) {
            NavigationLink { StockDetailView(symbol: n.symbol) } label: { nameBlock(n) }
                .buttonStyle(.plain)
            Spacer(minLength: 8)
            if n.lastCents > 0 {
                VStack(alignment: .trailing, spacing: 2) {
                    MoneyText(cents: n.lastCents).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    BpsBadge(bps: n.dayChangeBps).font(.caption)
                }
            }
            if isMember {
                Button { promoteTarget = n; showPromote = true } label: {
                    Text("Promote").font(.caption.weight(.bold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(p.accent.opacity(0.15)))
                        .foregroundStyle(p.accent)
                }
                .buttonStyle(.plain)
            }
        }
    }

    private func nameBlock(_ n: MarketName) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 12) {
            avatar(n.symbol, p)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Text(n.symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    if let call = n.agentCall { Chip(text: call.rawValue, tone: tone(call)) }
                }
                Text(n.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                if let s = n.signals { SignalStrip(signals: s) }
            }
        }
    }

    private func directiveControls(_ n: MarketName) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 14) {
            Button { toggleDirective(n, .pin) } label: {
                Image(systemName: n.directive == .pin ? "star.fill" : "star")
                    .foregroundStyle(n.directive == .pin ? p.accent : p.textMuted.opacity(0.45))
            }
            Button { toggleDirective(n, .noFly) } label: {
                Image(systemName: "nosign")
                    .foregroundStyle(n.directive == .noFly ? p.neg : p.textMuted.opacity(0.45))
            }
        }
        .buttonStyle(.plain)
        .font(.subheadline)
    }

    private func avatar(_ symbol: String, _ p: Palette) -> some View {
        Text(String(symbol.prefix(1)))
            .font(.headline.weight(.black))
            .foregroundStyle(Theme.brandGradient)
            .frame(width: 38, height: 38)
            .background(Circle().fill(p.accent.opacity(0.14)))
            .overlay(Circle().strokeBorder(p.accent.opacity(0.25), lineWidth: 1))
    }

    private func tone(_ c: AgentCall) -> Chip.Tone {
        switch c {
        case .buy, .accumulate: return .green
        case .avoid, .sell, .trim: return .red
        default: return .dim
        }
    }

    // MARK: - Actions (mock; real ones are member + Face ID gated server-side)

    private func toggleDirective(_ n: MarketName, _ d: Directive) {
        guard let i = universe.firstIndex(where: { $0.symbol == n.symbol }) else { return }
        universe[i].directive = (universe[i].directive == d) ? nil : d
    }

    private func promote() {
        guard let t = promoteTarget, let i = watchlist.firstIndex(where: { $0.symbol == t.symbol }) else { return }
        watchlist.remove(at: i)
        universe.append(MarketName(symbol: t.symbol, name: t.name, lastCents: t.lastCents,
                                   dayChangeBps: t.dayChangeBps, inUniverse: true,
                                   agentCall: t.agentCall, directive: nil, signals: t.signals))
        promoteTarget = nil
    }

    private func addProposed() {
        let sym = proposeSymbol.trimmingCharacters(in: .whitespaces).uppercased()
        proposeSymbol = ""
        guard !sym.isEmpty, !(universe + watchlist).contains(where: { $0.symbol == sym }) else { return }
        watchlist.append(MarketName(symbol: sym, name: sym, lastCents: 0, dayChangeBps: 0,
                                    inUniverse: false, agentCall: nil, directive: nil, signals: nil))
    }
}
