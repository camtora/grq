import Foundation

// Codable structs mirroring ../shared/contract.ts. Money is integer cents; rates and
// day moves are basis points; dates are ISO strings on the wire.

enum RiskLevel: String, Codable { case CAUTIOUS, BALANCED, AGGRESSIVE
    var label: String { rawValue.capitalized }
}
enum Role: String, Codable { case member, viewer }
enum AppTheme: String, Codable { case light, dark }
enum AgentCall: String, Codable { case buy, accumulate, hold, watch, trim, avoid, sell }
enum Directive: String, Codable {
    case pin, noFly = "no_fly"
    var label: String { self == .pin ? "Pinned" : "No-fly" }
}
enum Edition: String, Codable { case morning, midday, evening, weekend
    var label: String { rawValue.capitalized }
}

struct Me: Codable, Equatable {
    let email: String
    let name: String?
    let role: Role
    let theme: AppTheme
    let totalPnlCents: Int
    let contributionsCents: Int
}

struct Position: Codable, Identifiable {
    let symbol: String
    let qty: Int
    let avgCostCents: Int
    let lastCents: Int
    let marketValueCents: Int
    let unrealizedPnlCents: Int
    let dayChangeBps: Int
    let openedAt: String
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

struct Signals: Codable {
    let recommendationPct: Int
    let trend: String
    let rsi: Double?
    let macd: String?
}

struct MarketName: Codable, Identifiable {
    let symbol: String
    let name: String
    let lastCents: Int
    let dayChangeBps: Int
    let inUniverse: Bool
    let agentCall: AgentCall?
    var directive: Directive? = nil
    let signals: Signals?
    var id: String { symbol }
}

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
    let call: AgentCall?
    let target: PriceTarget
    let unfamiliar: Bool
    var id: String { symbol }
}

struct Dossier: Codable, Identifiable {
    let symbol: String
    let name: String
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
    var id: String { symbol }
}

struct Mover: Codable, Identifiable {
    let symbol: String
    let name: String
    let lastCents: Int
    let dayChangeBps: Int
    var id: String { symbol }
}

struct NavPoint: Codable, Identifiable {
    let at: String
    let navCents: Int
    var id: String { at }
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
    let movers: [Mover]
    let topHitters: [Mover]
    let onTheRadar: [Idea]
}
