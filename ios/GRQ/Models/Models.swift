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
    var logoUrl: String? = nil
    var id: String { symbol }
}

struct Portfolio: Codable {
    let cashCents: Int
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

// MARK: - Signals (advisory technicals consensus)

struct Signals: Codable {
    let recommendationPct: Int
    let trend: String
    let rsi: Double?
    let macd: String?
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

    var resolvedRating: Rating? { rating ?? Stance.resolve(label: ratingLabel, call: call)?.rating }
    var id: String { symbol }
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
