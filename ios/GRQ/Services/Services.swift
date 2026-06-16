import SwiftUI

/// Stub auth for the skeleton. Real flow (docs/IOS-PLAN.md): Google Sign-In →
/// POST /api/auth/google (verified server-side) → GRQ JWT in Keychain, Face ID on
/// member actions. For now, "sign in" picks a mock member and remembers it.
@MainActor
final class AuthManager: ObservableObject {
    @Published var currentUser: Me?
    var isAuthenticated: Bool { currentUser != nil }
    private let key = "grq.mockMember"

    init() {
        if let email = UserDefaults.standard.string(forKey: key) {
            currentUser = MockData.member(email)
        }
    }

    func signIn(_ email: String) {
        currentUser = MockData.member(email)
        UserDefaults.standard.set(email, forKey: key)
        APIClient.shared.token = "mock-token"
    }

    func signOut() {
        currentUser = nil
        UserDefaults.standard.removeObject(forKey: key)
        APIClient.shared.token = nil
    }
}

/// Bearer-ready client. Live calls return mock data in the skeleton; swap each to a
/// real `GET /api/*` once the read endpoints land (docs/IOS-PLAN.md).
final class APIClient {
    static let shared = APIClient()
    var baseURL = "https://grq.camerontora.ca/api"
    var token: String?

    func me() async -> Me { MockData.me }
    func portfolio() async -> Portfolio { MockData.portfolio }
    func settings() async -> FundSettings { MockData.settings }
    func today() async -> Today { MockData.today }
    func market() async -> (universe: [MarketName], watchlist: [MarketName]) {
        (MockData.universe, MockData.watchlist)
    }
    func ideas() async -> [Idea] { MockData.ideas }
    func dossier(_ symbol: String) async -> Dossier { MockData.dossier(symbol) }
}

/// Sample data so the UI is real to review. Numbers are internally consistent:
/// cash + positions = NAV = contributions + total P&L (a small "up" day).
enum MockData {
    static func member(_ email: String) -> Me {
        let isCam = email.lowercased().contains("cameron")
        return Me(email: email, name: isCam ? "Cam" : "Graham",
                  role: .member, theme: isCam ? .light : .dark,
                  totalPnlCents: 6_150, contributionsCents: 300_000)
    }
    static var me: Me { member("cameron.tora@gmail.com") }

    static let positions: [Position] = [
        Position(symbol: "SHOP.TO", qty: 8, avgCostCents: 11_500, lastCents: 11_800,
                 marketValueCents: 94_400, unrealizedPnlCents: 2_400, dayChangeBps: 210, openedAt: "2026-05-02"),
        Position(symbol: "ENB.TO", qty: 9, avgCostCents: 5_800, lastCents: 6_010,
                 marketValueCents: 54_090, unrealizedPnlCents: 1_890, dayChangeBps: 90, openedAt: "2026-04-18"),
        Position(symbol: "XIC.TO", qty: 12, avgCostCents: 3_300, lastCents: 3_340,
                 marketValueCents: 40_080, unrealizedPnlCents: 480, dayChangeBps: 40, openedAt: "2026-03-30"),
    ]

    static var portfolio: Portfolio {
        Portfolio(cashCents: 117_580, positions: positions, positionsCents: 188_570,
                  navCents: 306_150, contributionsCents: 300_000, totalPnlCents: 6_150,
                  benchmarkCents: 304_500, feeSpentMonthCents: 320, feeBudgetCentsMonth: 2_000,
                  riskLevel: .BALANCED, killSwitch: false, killSwitchBy: nil,
                  quotesAsOf: "2026-06-15T16:00:00Z")
    }

    static var settings: FundSettings {
        FundSettings(riskLevel: .BALANCED, cashFloorBps: 1_000, maxPositionBps: 2_500,
                     stopLossBps: 800, takeProfitBps: 2_000,
                     feeBudgetCentsMonth: 2_000, feeSpentMonthCents: 320,
                     killSwitch: false, killSwitchBy: nil,
                     soakDaysClean: 3, soakDaysRequired: 28,
                     soakPaperDaysClean: 0, soakPaperDaysRequired: 14)
    }

    static let tape: [NavPoint] = [
        NavPoint(at: "09:30", navCents: 304_330),
        NavPoint(at: "11:00", navCents: 305_100),
        NavPoint(at: "13:00", navCents: 304_800),
        NavPoint(at: "15:00", navCents: 305_900),
        NavPoint(at: "16:00", navCents: 306_150),
    ]

    static let lead = """
    The robot kept it boring, as instructed. A small green day — Shopify did the heavy \
    lifting, Constellation gave a little back, and we're a hair ahead of XIC. No trades: \
    nothing cleared the 3× round-trip bar, so today's receipts stay short.
    """

    static let movers: [Mover] = [
        Mover(symbol: "SHOP.TO", name: "Shopify", lastCents: 11_800, dayChangeBps: 210),
        Mover(symbol: "ENB.TO", name: "Enbridge", lastCents: 6_010, dayChangeBps: 90),
        Mover(symbol: "CSU.TO", name: "Constellation Software", lastCents: 480_000, dayChangeBps: -120),
    ]
    static let hitters: [Mover] = [
        Mover(symbol: "SHOP.TO", name: "Shopify", lastCents: 11_800, dayChangeBps: 210),
        Mover(symbol: "ENB.TO", name: "Enbridge", lastCents: 6_010, dayChangeBps: 90),
        Mover(symbol: "XIC.TO", name: "iShares Core TSX", lastCents: 3_340, dayChangeBps: 40),
    ]

    static let ideas: [Idea] = [
        Idea(symbol: "LMN.TO", name: "Lumine Group", call: .accumulate,
             target: PriceTarget(nearCents: 4_200, nearHorizon: "2–6 weeks", farCents: 4_800,
                                  expectedReturnBps: 1_800, confidence: 72), unfamiliar: true),
        Idea(symbol: "DSG.TO", name: "Descartes Systems", call: .watch,
             target: PriceTarget(nearCents: 14_500, nearHorizon: "1–3 months", farCents: 16_000,
                                  expectedReturnBps: 900, confidence: 64), unfamiliar: true),
    ]

    static let universe: [MarketName] = [
        MarketName(symbol: "SHOP.TO", name: "Shopify", lastCents: 11_800, dayChangeBps: 210, inUniverse: true,
                   agentCall: .hold, signals: Signals(recommendationPct: 61, trend: "uptrend", rsi: 58, macd: "rising")),
        MarketName(symbol: "ENB.TO", name: "Enbridge", lastCents: 6_010, dayChangeBps: 90, inUniverse: true,
                   agentCall: .accumulate, signals: Signals(recommendationPct: 55, trend: "uptrend", rsi: 49, macd: "flat")),
        MarketName(symbol: "XIC.TO", name: "iShares Core S&P/TSX", lastCents: 3_340, dayChangeBps: 40, inUniverse: true,
                   agentCall: .hold, signals: Signals(recommendationPct: 50, trend: "mixed", rsi: 52, macd: "flat")),
    ]
    static let watchlist: [MarketName] = [
        MarketName(symbol: "LMN.TO", name: "Lumine Group", lastCents: 4_050, dayChangeBps: 150, inUniverse: false,
                   agentCall: .accumulate, signals: Signals(recommendationPct: 68, trend: "uptrend", rsi: 61, macd: "rising")),
        MarketName(symbol: "DSG.TO", name: "Descartes Systems", lastCents: 14_200, dayChangeBps: -30, inUniverse: false,
                   agentCall: .watch, signals: Signals(recommendationPct: 47, trend: "mixed", rsi: 45, macd: "falling")),
    ]

    static func dossier(_ symbol: String) -> Dossier {
        let n = (universe + watchlist).first { $0.symbol == symbol }
        return Dossier(
            symbol: symbol,
            name: n?.name ?? symbol,
            bodyMarkdown: """
            Business — \(n?.name ?? symbol) is a placeholder dossier in the skeleton. The real one \
            is the agent's write-up: the business, recent news, the bull and bear case, and a verdict.

            Bull — durable demand, a widening moat, sensible capital allocation.

            Bear — valuation leaves little room for a stumble; watch the next print.
            """,
            call: n?.agentCall ?? .watch,
            target: PriceTarget(nearCents: 4_200, nearHorizon: "2–6 weeks", farCents: 4_800,
                                expectedReturnBps: 1_800, confidence: 72),
            signals: n?.signals,
            analystTargetCents: 4_600,
            marketCapCents: 85_000_000_000,
            peRatio: 34.2,
            freeCashFlowCents: 1_250_000_000,
            dividendYieldBps: 0,
            filedAt: "2026-06-14")
    }

    static var currentEdition: Edition {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/Toronto") ?? .current
        let h = cal.component(.hour, from: Date())
        let wd = cal.component(.weekday, from: Date()) // 1 = Sun, 7 = Sat
        if wd == 1 || wd == 7 { return .weekend }
        if h < 9 { return .morning }
        if h < 16 { return .midday }
        return .evening
    }

    static var today: Today {
        Today(edition: currentEdition, dateISO: "2026-06-15",
              navCents: 306_150, dayPnlCents: 1_820, dayPnlBps: 60, benchmarkBps: 40,
              tape: tape, leadStoryMarkdown: lead,
              movers: movers, topHitters: hitters, onTheRadar: ideas)
    }
}
