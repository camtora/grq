import Foundation

// Codable structs mirroring ../shared/contract.ts. Money is integer cents; rates and
// day moves are basis points; dates are ISO strings on the wire.
//
// IA-v5 rebuild (2026-06-18, docs/IOS-REBUILD-PLAN.md): the app now mirrors The Hunt,
// Smart Money, Chat, the 7-point rating scale and the rich dossier. Every field the
// CURRENT backend doesn't emit yet is Optional, so the app keeps decoding live
// responses while the contract additions (Appendix A) land — the proven "client
// wired, lights up when the endpoint ships" pattern.

// MARK: - Enums

enum RiskLevel: String, Codable { case CAUTIOUS, BALANCED, AGGRESSIVE
    var label: String { rawValue.capitalized }
}
enum Role: String, Codable { case member, viewer }
enum AppTheme: String, Codable { case light, dark }

/// Retired call vocabulary — still emitted by older dossiers; mapped onto the 7-point
/// Stance client-side so the RatingBar works before the contract migration (A6).
enum AgentCall: String, Codable { case buy, accumulate, hold, watch, trim, avoid, sell }

enum Directive: String, Codable {
    case pin, noFly = "no_fly"
    var label: String { self == .pin ? "Pinned" : "No-fly" }
}
enum Edition: String, Codable { case morning, midday, evening, weekend
    var label: String { rawValue.capitalized }
}

// MARK: - The 7-point rating scale (mirrors web/lib/stance.ts)

/// GRQ's own call on a name, on the same red→amber→green axis as the signal read.
/// `pos` is the needle position 0..1 (Strong Sell 0 → Strong Buy 1) for the RatingBar.
struct Rating: Codable, Equatable {
    let label: String
    let abbr: String
    let tone: String   // "emerald" | "teal" | "amber" | "red"
    let pos: Double
    let blurb: String
}

enum Stance: String, CaseIterable {
    case strongBuy = "Strong Buy"
    case buy = "Buy"
    case weakBuy = "Weak Buy"
    case hold = "Hold"
    case weakSell = "Weak Sell"
    case sell = "Sell"
    case strongSell = "Strong Sell"

    var rating: Rating {
        switch self {
        case .strongBuy:  return Rating(label: rawValue, abbr: "SB", tone: "emerald", pos: 1.0,  blurb: "high-conviction buy at today's price")
        case .buy:        return Rating(label: rawValue, abbr: "B",  tone: "emerald", pos: 0.82, blurb: "would open or add to the position here")
        case .weakBuy:    return Rating(label: rawValue, abbr: "WB", tone: "teal",    pos: 0.64, blurb: "lean buy — worth building gradually, on dips")
        case .hold:       return Rating(label: rawValue, abbr: "H",  tone: "amber",   pos: 0.5,  blurb: "own it; nothing here warrants buying more or selling")
        case .weakSell:   return Rating(label: rawValue, abbr: "WS", tone: "amber",   pos: 0.36, blurb: "lean sell — trim, or wait for a better exit")
        case .sell:       return Rating(label: rawValue, abbr: "S",  tone: "red",     pos: 0.18, blurb: "exit the position")
        case .strongSell: return Rating(label: rawValue, abbr: "SS", tone: "red",     pos: 0.0,  blurb: "high-conviction exit / would not own")
        }
    }

    /// Resolve a stance from either the new 7-point label or the retired call word.
    static func resolve(label: String?, call: AgentCall?) -> Stance? {
        if let label, let direct = Stance(rawValue: label) { return direct }
        switch call {
        case .buy:        return .buy
        case .accumulate: return .weakBuy
        case .hold, .watch: return .hold
        case .trim, .avoid: return .weakSell
        case .sell:       return .sell
        case .none:       return nil
        }
    }
}

// MARK: - Auth / me

struct Me: Codable, Equatable {
    let email: String
    let name: String?
    let role: Role
    let theme: AppTheme
    let totalPnlCents: Int
    let contributionsCents: Int
}

// MARK: - Portfolio

struct Position: Codable, Identifiable {
    let symbol: String
    let qty: Int
    let avgCostCents: Int
    let lastCents: Int
    let marketValueCents: Int
    let unrealizedPnlCents: Int
    let dayChangeBps: Int
    let openedAt: String
    var currency: String? = nil // native currency of this holding ("CAD" | "USD")
    var logoUrl: String? = nil
    var id: String { symbol }
}

struct Portfolio: Codable {
    let cashCents: Int // CAD total (CAD cash + USD cash × fx)
    var cadCashCents: Int? = nil
    var usdCashCents: Int? = nil
    var fxUsdCad: Double? = nil
    let positions: [Position]
    let positionsCents: Int
    let navCents: Int
    let contributionsCents: Int
    let totalPnlCents: Int
    let benchmarkCents: Int?
    let feeSpentMonthCents: Int
    let feeBudgetCentsMonth: Int
    let riskLevel: RiskLevel
    let killSwitch: Bool
    let killSwitchBy: String?
    let quotesAsOf: String?
}

struct FundSettings: Codable {
    let riskLevel: RiskLevel
    let cashFloorBps: Int
    let maxPositionBps: Int
    let stopLossBps: Int
    let takeProfitBps: Int
    let feeBudgetCentsMonth: Int
    let feeSpentMonthCents: Int
    let killSwitch: Bool
    let killSwitchBy: String?
    let soakDaysClean: Int
    let soakDaysRequired: Int
    let soakPaperDaysClean: Int
    let soakPaperDaysRequired: Int
}

// FX-approval guardrail (D62): a CAD→USD conversion the agent requested or a member ran.
struct FxRequest: Codable, Identifiable {
    let id: Int
    let createdAt: String
    let fromCurrency: String?  // "CAD"|"USD" — direction (older rows null → CAD→USD)
    let toCurrency: String?
    let amountUsdCents: Int
    let estCadCents: Int
    let reason: String
    let symbol: String?
    let status: String // PENDING|APPROVED|REJECTED|EXECUTED|FAILED
    let requestedBy: String
    let decidedBy: String?
    let note: String?
    let executedRate: Double?
    let executedCadCents: Int?
    let executedUsdCents: Int?
    let failReason: String?
}

struct FxState: Codable {
    let cadCashCents: Int
    let usdCashCents: Int
    let fxUsdCad: Double?
    let usdPct: Double
    let fxMaxPerRequestCents: Int
    let fxMaxPerWeekCents: Int
    let usdAllocationCapPct: Int
    let pending: [FxRequest]
    let recent: [FxRequest]
}

// MARK: - Notification preferences (per-user push toggles — D53)

/// The toggleable push categories (mirrors shared/contract.ts NotificationPreferences).
/// trades + risk + critical outages are always-on server-side and aren't here. Every
/// field defaults true so a partial/missing payload reads as all-on.
struct NotificationPreferences: Codable, Equatable {
    var dossiers: Bool = true
    var hunt: Bool = true
    var agentMoves: Bool = true
    var reports: Bool = true
    var members: Bool = true
    var messages: Bool = true
    var system: Bool = true
    var priceTargets: Bool = true

    /// UI catalog: field key-path + its API JSON key + copy. Mirrors web/lib/push/categories.ts.
    static let catalog: [(key: WritableKeyPath<NotificationPreferences, Bool>, apiKey: String, label: String, desc: String)] = [
        (\.dossiers, "dossiers", "Research dossiers", "A dossier you or the agent requested is ready."),
        (\.hunt, "hunt", "The Hunt & ideas", "New hunt names, directed-hunt results, and smart-money scans."),
        (\.agentMoves, "agentMoves", "Agent universe moves", "When the agent tracks or self-promotes a name into its tradeable universe."),
        (\.reports, "reports", "Daily reports", "Morning plan, midday brief, end-of-day close, and the weekly review."),
        (\.members, "members", "Member activity", "When the other member blocks, pins, promotes, or demotes a name."),
        (\.messages, "messages", "Messages", "When the other member sends you a message or shares a stock."),
        (\.system, "system", "System health", "Agent restarts and data-feed or broker hiccups (non-critical)."),
        (\.priceTargets, "priceTargets", "Price alerts", "When a stock you set an alert on crosses your target price."),
    ]
}

/// A per-user price alert (The Wire, Phase 2). Set on the stock page; the agent
/// runner pushes you when the price crosses, then one-shots it (active → false).
struct PriceAlert: Codable, Identifiable, Equatable {
    let id: Int
    let symbol: String
    let direction: String   // "above" | "below"
    let thresholdCents: Int
    let currency: String
    var note: String? = nil
    let active: Bool
    let createdAt: String
    var firedAt: String? = nil
    // Attribution — set only on a stock's "alerts on this stock" view (both members'
    // alerts). nil on the personal manager list. `mine` ⇒ the caller can delete it.
    var owner: String? = nil
    var ownerKey: String? = nil
    var mine: Bool? = nil
}

// MARK: - Signals (advisory technicals consensus)

struct Signals: Codable {
    let recommendationPct: Int
    let trend: String
    let rsi: Double?
    let macd: String?
}

// MARK: - Live quotes (the /api/quotes price overlay)

/// One symbol's live FMP price + day move, keyed by OUR symbol in the response map.
/// `changePct` is a PERCENT (e.g. -4.4 = -4.40%), matching the web endpoint.
struct LiveQuote: Codable, Equatable {
    let priceCents: Int
    let changePct: Double
}

extension Dictionary where Key == String, Value == LiveQuote {
    /// Live price for `symbol`, or `fallback` (the delayed snapshot) until a poll lands.
    func priceCents(_ symbol: String, fallback: Int) -> Int {
        self[symbol.uppercased()]?.priceCents ?? fallback
    }
    /// Live day move in basis points (percent × 100), or the snapshot's `fallback` bps.
    func dayBps(_ symbol: String, fallback: Int) -> Int {
        guard let q = self[symbol.uppercased()] else { return fallback }
        return Int((q.changePct * 100).rounded())
    }
}

// MARK: - Market names (universe / watchlist)

struct MarketName: Codable, Identifiable {
    let symbol: String
    let name: String
    var currency: String? = nil   // listing currency — labels the price (US$ vs C$), nil ⇒ CAD
    let lastCents: Int
    let dayChangeBps: Int
    let inUniverse: Bool
    let agentCall: AgentCall?
    var directive: Directive? = nil
    let signals: Signals?
    var logoUrl: String? = nil     // A2
    var rating: Rating? = nil      // A6 — else derived from agentCall

    /// GRQ's call, preferring the live rating, falling back to the legacy call word.
    var resolvedRating: Rating? {
        rating ?? Stance.resolve(label: nil, call: agentCall)?.rating
    }
    var id: String { symbol }
}

// MARK: - Ideas / targets / dossier

struct PriceTarget: Codable {
    let nearCents: Int?
    let nearHorizon: String?
    let farCents: Int?
    let expectedReturnBps: Int?
    let confidence: Int?
}

struct Idea: Codable, Identifiable {
    let symbol: String
    let name: String
    var currency: String? = nil
    let call: AgentCall?
    let target: PriceTarget
    let unfamiliar: Bool
    var logoUrl: String? = nil
    var rating: Rating? = nil
    var resolvedRating: Rating? { rating ?? Stance.resolve(label: nil, call: call)?.rating }
    var id: String { symbol }
}

struct Dossier: Codable, Identifiable {
    let symbol: String
    let name: String
    var currency: String? = nil
    let lastCents: Int?
    let bodyMarkdown: String
    let call: AgentCall?
    let target: PriceTarget
    let signals: Signals?
    let analystTargetCents: Int?
    let marketCapCents: Int?
    let peRatio: Double?
    let freeCashFlowCents: Int?
    let dividendYieldBps: Int?
    let filedAt: String?
    // A5 enrichment (all optional — present once the dossier feed grows):
    var logoUrl: String? = nil
    var status: String? = nil          // ACTIVE | CANDIDATE | RETIRED
    var watch: String? = nil           // none | watching | universe
    var rating: Rating? = nil
    var ratingLabel: String? = nil     // 7-point label if sent directly
    var recLabel: String? = nil        // technical-lean label (signal consensus)
    var recPos: Double? = nil
    var bottomLine: String? = nil
    var researching: Bool? = nil
    var directive: Directive? = nil
    // Stock-page parity (2026-06-23) — every panel the web page shows. All optional so
    // the app keeps decoding older payloads and lights up as the endpoint emits them.
    var tier: String? = nil
    var agentWatching: Bool? = nil
    var agentNote: String? = nil
    var lastResearchedAt: String? = nil
    var position: DossierPosition? = nil
    var analystBand: AnalystBand? = nil
    var grades: DossierGrades? = nil
    var earnings: DossierEarnings? = nil
    var signalFamilies: [SignalFamily]? = nil
    var peers: [PeerRow]? = nil
    var institutional: Institutional? = nil
    var scoreboard: [ScoreRow]? = nil
    var closes: [ClosePoint]? = nil
    var news: [NewsItem]? = nil
    var coverage: [CoverageRow]? = nil
    var record: [RecordEntry]? = nil
    var trades: [TradeRow]? = nil
    var smartMoney: DossierSmartMoney? = nil
    var currentRead: CurrentRead? = nil

    var resolvedRating: Rating? { rating ?? Stance.resolve(label: ratingLabel, call: call)?.rating }
    var id: String { symbol }
}

// MARK: - Dossier panels (stock-page parity — mirror shared/contract.ts)

/// Held position + the deterministic bracket (stop/take-profit off the risk dial).
struct DossierPosition: Codable {
    let qty: Int
    let avgCostCents: Int
    let openedAt: String
    let marketValueCents: Int
    let unrealizedPnlCents: Int
    let stopPct: Double
    let takeProfitPct: Double
    let autoStopCents: Int
    let takeProfitCents: Int
}

/// Analyst price-target band, re-anchored to this listing's currency where needed.
struct AnalystBand: Codable {
    let nowCents: Int
    let consensusCents: Int
    let lowCents: Int
    let highCents: Int
    let currency: String
    let upsidePct: Double
    let reanchored: Bool
    var trendChangePct: Double? = nil
    var trendRecentCount: Int? = nil
}

struct GradeAction: Codable, Identifiable {
    let company: String
    let action: String      // upgrade | downgrade | maintain | initiate
    let fromGrade: String
    let toGrade: String
    let date: String
    var id: String { company + date + toGrade }
}

struct DossierGrades: Codable {
    let consensus: String
    let total: Int
    let strongBuy: Int
    let buy: Int
    let hold: Int
    let sell: Int
    let strongSell: Int
    var trendDirection: String? = nil
    var buyDelta: Int? = nil
    var sellDelta: Int? = nil
    var trendMonths: Int? = nil
    var actions: [GradeAction] = []
}

struct EarningsRow: Codable {
    let date: String
    var epsEstimated: Double? = nil
    var epsActual: Double? = nil
    var revenueEstimated: Double? = nil
    var revenueActual: Double? = nil
}
struct DossierEarnings: Codable {
    var next: EarningsRow? = nil
    var last: EarningsRow? = nil
}

struct SignalFamily: Codable, Identifiable {
    let family: String      // trend | rsi | macd | volatility
    let signal: String      // BUY | SELL | HOLD
    let confidence: Int
    let rationale: String
    var id: String { family }
}

struct PeerRow: Codable, Identifiable {
    let symbol: String
    let name: String
    let isSelf: Bool
    var peTtm: Double? = nil
    var pbTtm: Double? = nil
    var marketCapM: Double? = nil
    var id: String { symbol }
    enum CodingKeys: String, CodingKey {
        case symbol, name, peTtm, pbTtm, marketCapM
        case isSelf = "self"
    }
}

struct Holder: Codable, Identifiable {
    let name: String
    let isNew: Bool
    let ownershipPct: Double
    let sharesChangePct: Double
    var id: String { name }
}
struct Institutional: Codable {
    let investorsHolding: Int
    let investorsHoldingChange: Int
    let date: String
    var holders: [Holder] = []
}

struct ScoreRow: Codable, Identifiable {
    let source: String
    let grades: Int
    let hits: Int
    let misses: Int
    let neutral: Int
    var hitRate: Double? = nil
    var id: String { source }
}

struct ClosePoint: Codable, Identifiable {
    let t: Double   // epoch ms
    let c: Int      // close cents
    var id: Double { t }
}

struct NewsItem: Codable, Identifiable {
    let title: String
    let url: String
    let publisher: String
    let at: String
    var id: String { url }
}

struct CoverageRow: Codable, Identifiable {
    let tier: Int
    let name: String
    let status: String   // live | partial | none
    let detail: String
    var id: Int { tier }
}

struct RecordEntry: Codable, Identifiable {
    let id: Int
    let kind: String     // RESEARCH | DECISION | TRADE | NOTE | LESSON | SYSTEM
    let title: String
    let body: String
    let at: String
    var agentVersion: String? = nil
    var sources: [String] = []
}

struct TradeRow: Codable, Identifiable {
    let id: Int
    let side: String     // BUY | SELL
    let qty: Int
    let priceCents: Int
    var realizedPnlCents: Int? = nil
    let at: String
}

struct SmartFundHolder: Codable, Identifiable {
    let name: String
    let firm: String
    let asOf: String
    let pctOfPort: Double
    let action: String       // NEW | ADD | TRIM | HOLD | EXIT
    var putCall: String? = nil
    var id: String { name + firm }
}
struct SmartPerson: Codable, Identifiable {
    let name: String
    let role: String
    var lastSide: String? = nil
    var lastAmountRange: String? = nil
    var lastTxnDate: String? = nil
    var id: String { name }
}
struct DossierSmartMoney: Codable {
    let hasAny: Bool
    let congressBuyers: Int
    let congressSellers: Int
    let insiderBuyers: Int
    let insiderBuyValueUsd: Double
    var fundHolders: [SmartFundHolder] = []
    var people: [SmartPerson] = []
}

struct CurrentRead: Codable {
    let title: String
    let body: String
    let at: String
    var sources: [String] = []
}

// MARK: - Today / The Daily

struct Mover: Codable, Identifiable {
    let symbol: String
    let name: String
    var currency: String? = nil
    let lastCents: Int
    let dayChangeBps: Int
    var logoUrl: String? = nil
    var id: String { symbol }
}

struct NavPoint: Codable, Identifiable {
    let at: String
    let navCents: Int
    var id: String { at }
}

/// Live market-indices strip (A4) — folded into /api/today or its own endpoint.
struct IndexQuote: Codable, Identifiable {
    let symbol: String
    let name: String
    let priceCents: Int?
    let changeBps: Int?
    var id: String { symbol }
}

struct Today: Codable {
    let edition: Edition
    let dateISO: String
    let navCents: Int
    let dayPnlCents: Int
    let dayPnlBps: Int
    let benchmarkBps: Int?
    let tape: [NavPoint]
    let leadStoryMarkdown: String?
    let leadTitle: String
    let movers: [Mover]
    let topHitters: [Mover]
    let onTheRadar: [Idea]
    var indices: [IndexQuote]? = nil
}

// MARK: - The Hunt (A1)

struct HuntFind: Codable, Identifiable {
    let sym: String
    let name: String
    var logoUrl: String? = nil
    var currency: String? = nil
    let cur: Int?              // current price, cents
    let nearBps: Int?         // near-term upside
    let farBps: Int?          // 12-month upside
    let nearDays: Int?
    let confidence: Int?      // 0–100 conviction
    let body: String          // dossier narrative (markdown)
    var sources: [String]? = nil
    let obscurity: Int?       // 1–5 (5 = deepest cut)
    var watch: String? = nil  // none | watching | universe
    // Heat-feed enrichment (the redesign — design_handoff_the_hunt_ios). All optional
    // so the app keeps decoding older payloads; they light up once the hunt endpoint
    // emits them (the proven "client wired, lights up when the endpoint ships" pattern).
    var heat: Int? = nil          // 0–100 "ready to pop" score (server, computeHeat)
    var change30d: Double? = nil  // 30-day momentum as a fraction (+0.12 = +12%)
    var spark: [Double]? = nil    // ~30 daily closes (cents) for the sparkline
    var tag: String? = nil        // "NYSE · Health" (exchange · sector)
    var id: String { sym }

    /// Heat, preferring the server's score, else derived in-view from the inputs we
    /// have — mirrors web/lib/heat.ts (60/25/15 confidence/momentum/obscurity, weights
    /// renormalize as inputs drop out). Keeps the feed rankable before the field ships.
    var resolvedHeat: Int {
        if let heat { return heat }
        var parts: [(w: Double, v: Double)] = []
        if let c = confidence { parts.append((0.6, min(100, max(0, Double(c))))) }
        if let ch = change30d { parts.append((0.25, min(100, max(0, ((ch + 0.2) / 0.5) * 100)))) }
        if let o = obscurity { parts.append((0.15, min(100, max(0, Double(o) * 20)))) }
        guard !parts.isEmpty else { return 50 }
        let wsum = parts.reduce(0) { $0 + $1.w }
        let score = parts.reduce(0) { $0 + $1.w * $1.v } / wsum
        return Int(min(100, max(0, score)).rounded())
    }

    /// 1–5 obscurity → label, matching components/IdeaCard.tsx.
    var obscurityLabel: String? {
        switch obscurity {
        case 5: return "🔍 deep cut"
        case 4: return "under-the-radar"
        case 3: return "lesser-known"
        case 2: return "some coverage"
        case 1: return "well-followed"
        default: return nil
        }
    }
}

struct HuntResponse: Codable {
    var brief: String? = nil
    let finds: [HuntFind]
}

// MARK: - The Wire (the discovery feed — prototype, iOS-first)

/// One scrollable feed of heterogeneous typed cards (mirrors shared/contract.ts WireItem).
/// Flat + mostly-optional: each card sets only the fields its `kind` needs; the server
/// already weaves kinds so we render top-to-bottom. v1 is shared + read-only.
enum WireKind: String, Codable { case find, dossier, watch, article, lesson }

struct WireItem: Codable, Identifiable {
    let id: String
    let kind: WireKind
    let at: String
    // stock-bearing cards (find / dossier / watch / stock-tied article)
    var symbol: String? = nil
    var name: String? = nil
    var currency: String? = nil
    var logoUrl: String? = nil
    var lastCents: Int? = nil
    var dayChangeBps: Int? = nil
    // discovery economics (find / dossier)
    var call: AgentCall? = nil
    var farBps: Int? = nil
    var nearBps: Int? = nil
    var nearDays: Int? = nil
    var nearHorizon: String? = nil
    var targetNearCents: Int? = nil
    var targetFarCents: Int? = nil
    var confidence: Int? = nil
    var heat: Int? = nil
    var obscurity: Int? = nil
    var change30d: Double? = nil
    var spark: [Double]? = nil
    var signals: Signals? = nil
    var sources: [String]? = nil
    var blurb: String? = nil
    var bullets: [String]? = nil   // a few clean, pre-stripped bullets — the card body (no markdown)
    var tag: String? = nil
    // watch attribution
    var watcher: String? = nil
    var watcherKey: String? = nil   // "cam" | "graham" | "agent" → the bundled avatar image
    // article
    var title: String? = nil
    var publisher: String? = nil
    var imageUrl: String? = nil
    var url: String? = nil
    var relatedTickers: [String]? = nil   // tracked names the article touches → tap to the dossier
    // lesson
    var lessonTerm: String? = nil
    var lessonBody: String? = nil
    var lessonSlug: String? = nil
    var lessonExample: String? = nil           // a "here's what that looks like" line
    var lessonRelated: [WireRelatedTerm]? = nil // tappable related terms

    /// GRQ's call as a 7-point Rating (for StanceBadge), derived from `call` (A6).
    var resolvedRating: Rating? { Stance.resolve(label: nil, call: call)?.rating }
}

/// A glossary term a lesson card links to — self-contained so a tap presents it
/// directly (the bundled glossary is only a subset of the server's).
struct WireRelatedTerm: Codable, Identifiable, Equatable {
    let slug: String
    let term: String
    let def: String
    var id: String { slug }
}

struct WireResponse: Codable { let items: [WireItem] }

// MARK: - Smart Money (A3)

struct SmartHolding: Codable, Identifiable {
    let symbol: String
    let name: String?
    var changeKind: String? = nil   // NEW | ADD | TRIM | EXIT
    var valueUsd: Double? = nil
    var weightBps: Int? = nil
    var putCall: String? = nil       // "PUT" | "CALL"
    var overlap: String? = nil       // universe | watching
    var id: String { symbol }
}

struct SmartPortfolio: Codable, Identifiable {
    let slug: String
    let name: String
    var subtitle: String? = nil
    var asOf: String? = nil
    var totalValueUsd: Double? = nil
    let topHoldings: [SmartHolding]
    var id: String { slug }
}

struct LeaderRow: Codable, Identifiable {
    let symbol: String
    let name: String
    let primary: String      // e.g. "5 funds" / "$2.1M"
    var secondary: String? = nil
    var overlap: String? = nil
    var id: String { symbol + primary }
}

struct SmartCluster: Codable, Identifiable {
    let symbol: String
    let insiders: Int
    var totalValueUsd: Double? = nil
    var id: String { symbol }
}

struct SmartNarrative: Codable {
    let title: String
    let body: String
    var at: String? = nil
    var sources: [String]? = nil
}

struct SmartMoneyResponse: Codable {
    var portfolios: [SmartPortfolio] = []
    var congress: [LeaderRow] = []
    var funds: [LeaderRow] = []
    var insiders: [LeaderRow] = []
    var clusters: [SmartCluster] = []
    var narrative: SmartNarrative? = nil
    var updatedAt: String? = nil

    // Tolerate a partial payload — any missing section defaults to empty (Swift's
    // synthesized decoder would otherwise throw on a missing non-optional array).
    enum CodingKeys: String, CodingKey { case portfolios, congress, funds, insiders, clusters, narrative, updatedAt }
    init() {}
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        portfolios = (try? c.decode([SmartPortfolio].self, forKey: .portfolios)) ?? []
        congress = (try? c.decode([LeaderRow].self, forKey: .congress)) ?? []
        funds = (try? c.decode([LeaderRow].self, forKey: .funds)) ?? []
        insiders = (try? c.decode([LeaderRow].self, forKey: .insiders)) ?? []
        clusters = (try? c.decode([SmartCluster].self, forKey: .clusters)) ?? []
        narrative = try? c.decode(SmartNarrative.self, forKey: .narrative)
        updatedAt = try? c.decode(String.self, forKey: .updatedAt)
    }
}

// MARK: - Stock extras (lazy earnings + analyst grades — A7)
// Mirrors web /api/stock-extras → { earnings: FmpEarnings|null, grades: FmpGrades|null }.

struct EarningsInfo: Codable {
    let date: String                 // YYYY-MM-DD
    var upcoming: Bool? = nil
    var epsEstimated: Double? = nil
    var epsActual: Double? = nil
    var revenueEstimated: Double? = nil
    var revenueActual: Double? = nil
}

struct GradesInfo: Codable {
    var consensus: String? = nil
    var total: Int? = nil
    var strongBuy: Int? = nil
    var buy: Int? = nil
    var hold: Int? = nil
    var sell: Int? = nil
    var strongSell: Int? = nil
}

struct StockExtras: Codable {
    var earnings: EarningsInfo? = nil
    var grades: GradesInfo? = nil
}

// MARK: - Browse search (A7 — /api/symbol-search)

struct SearchHit: Codable, Identifiable {
    let symbol: String
    let name: String
    var exchange: String? = nil
    var currency: String? = nil
    var id: String { symbol + (exchange ?? "") }
}

// MARK: - Chat

struct ChatMessage: Codable, Identifiable {
    let id: ChatID
    let email: String
    let role: String       // user | assistant
    let content: String
}

/// The chat id is a number on stored rows and a string for locally-minted ones.
enum ChatID: Codable, Hashable {
    case int(Int), string(String)
    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if let i = try? c.decode(Int.self) { self = .int(i) }
        else { self = .string(try c.decode(String.self)) }
    }
    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self { case .int(let i): try c.encode(i); case .string(let s): try c.encode(s) }
    }
    var stringValue: String { switch self { case .int(let i): return String(i); case .string(let s): return s } }
}

struct ChatThread: Codable {
    let owner: String
    let messages: [ChatMessage]
}

// MARK: - Direct messages (member ↔ member — D61)

/// A message in the two-person Cam↔Graham thread (mirrors shared/contract.ts
/// DirectMessage). A bare DM is just `body`; a "share" also carries `symbol`
/// (+ optional `panel`) so tapping it deep-links to that dossier panel.
struct DirectMessage: Codable, Identifiable {
    let id: Int
    let at: String
    let fromKey: String?    // "cam" | "graham"
    let fromName: String
    let mine: Bool
    let body: String
    let symbol: String?
    let panel: String?
    let panelLabel: String?
    let readAt: String?
}

struct DirectThread: Codable {
    let messages: [DirectMessage]
    let unread: Int
}

/// The shareable panels on the stock page — rawValue matches web/lib/panels.ts keys
/// (the share's `panel`) AND the `.id()` SwiftUI scroll anchors in StockDetailView.
enum PanelKind: String, CaseIterable {
    case bottomLine, position, agentNote, analyst, priceTarget, institutional, signals,
         earnings, peers, scoreboard, chart, smartMoney, fundamentals, dossier,
         trades, news, coverage

    var label: String {
        switch self {
        case .bottomLine:    return "The bottom line"
        case .position:      return "Your position"
        case .agentNote:     return "The agent's note"
        case .analyst:       return "Analyst ratings"
        case .priceTarget:   return "Price target"
        case .institutional: return "Institutional · 13F"
        case .signals:       return "Signals"
        case .earnings:      return "Earnings"
        case .peers:         return "Valuation vs peers"
        case .scoreboard:    return "Scoreboard"
        case .chart:         return "Price chart"
        case .smartMoney:    return "Smart money"
        case .fundamentals:  return "Fundamentals"
        case .dossier:       return "Dossier"
        case .trades:        return "Trades"
        case .news:          return "Recent news"
        case .coverage:      return "Data coverage"
        }
    }
}

// MARK: - Reports (A10)

struct ReportSummary: Codable, Identifiable {
    let id: String
    let kind: String        // EOD | WEEKLY | …
    let dateISO: String
    let title: String
    var summary: String? = nil
}

struct ReportDetail: Codable {
    let id: String
    let title: String
    let dateISO: String
    let bodyMarkdown: String
}
