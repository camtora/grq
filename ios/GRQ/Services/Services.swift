import SwiftUI
import Security
import UIKit
import LocalAuthentication
import UserNotifications

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

// Live data layer for the GRQ app. The app is a thin client: it computes no money
// and holds no guardrails — it renders the API and posts intents through the same
// guarded routes the web uses (docs/IOS-PLAN.md). Auth is a GRQ-JWT held in the
// Keychain; every request carries it as `Authorization: Bearer`.

// MARK: - Keychain (it's a finance app — the token lives in the Keychain, not UserDefaults)

enum Keychain {
    private static func query(_ key: String) -> [String: Any] {
        [kSecClass as String: kSecClassGenericPassword, kSecAttrAccount as String: key]
    }

    static func save(_ key: String, _ value: String) {
        let data = Data(value.utf8)
        SecItemDelete(query(key) as CFDictionary)
        var add = query(key)
        add[kSecValueData as String] = data
        add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(add as CFDictionary, nil)
    }

    static func read(_ key: String) -> String? {
        var q = query(key)
        q[kSecReturnData as String] = true
        q[kSecMatchLimit as String] = kSecMatchLimitOne
        var out: AnyObject?
        guard SecItemCopyMatching(q as CFDictionary, &out) == errSecSuccess,
              let data = out as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    static func delete(_ key: String) {
        SecItemDelete(query(key) as CFDictionary)
    }
}

// MARK: - Auth

@MainActor
final class AuthManager: ObservableObject {
    @Published var currentUser: Me?
    @Published var authError: String?
    @Published var signingIn = false
    var isAuthenticated: Bool { currentUser != nil }

    private static let tokenKey = "grq.token"

    init() {
        // Restore the session: load the token, then validate it by fetching /me.
        if let token = Keychain.read(Self.tokenKey) {
            APIClient.shared.token = token
            Task { await restore() }
        }
    }

    /// Validate the stored token against the server. 401/expired → sign out cleanly.
    func restore() async {
        guard APIClient.shared.token != nil else { return }
        if let me = await APIClient.shared.me() {
            currentUser = me
        } else {
            signOut()
        }
    }

    /// Real login — trade a verified Google ID token for a GRQ-JWT. The Google
    /// step is behind GoogleAuth (SDK added via SPM on the Mac, P0 in IOS-PLAN).
    func signInWithGoogle() async {
        authError = nil
        signingIn = true
        defer { signingIn = false }
        do {
            let idToken = try await GoogleAuth.signIn()
            await authenticate(path: "auth/google", body: ["idToken": idToken])
        } catch {
            authError = error.localizedDescription
        }
    }

    private func authenticate(path: String, body: [String: String]) async {
        guard let auth = await APIClient.shared.login(path: path, body: body) else {
            authError = "Sign-in failed. Please try again."
            return
        }
        APIClient.shared.token = auth.token
        Keychain.save(Self.tokenKey, auth.token)
        currentUser = auth.me
    }

    func signOut() {
        // Forget this device server-side with the OLD bearer before clearing it, so the
        // next member to sign in on this phone doesn't inherit our push tokens (D53).
        let oldBearer = APIClient.shared.token
        let hex = PushManager.shared.deviceTokenHex
        currentUser = nil
        APIClient.shared.token = nil
        Keychain.delete(Self.tokenKey)
        if let hex { Task { await APIClient.shared.unregisterDeviceToken(hex, bearer: oldBearer) } }
    }
}

// MARK: - API client

struct AuthPayload: Codable { let token: String; let me: Me }
private struct MarketPayload: Codable { let universe: [MarketName]; let watchlist: [MarketName] }

final class APIClient {
    static let shared = APIClient()

    // Prod by default; overridable for the simulator via `defaults`-style key so
    // the app can point at the LAN box before the nginx mobile route is live.
    var baseURL: String = UserDefaults.standard.string(forKey: "grq.apiBase") ?? "https://grq.camerontora.ca/api"
    var token: String?

    private let decoder = JSONDecoder()

    private func request(_ method: String, _ path: String, body: [String: String]? = nil) -> URLRequest? {
        guard let url = URL(string: "\(baseURL)/\(path)") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 20
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        }
        return req
    }

    private func send<T: Decodable>(_ req: URLRequest) async -> T? {
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else { return nil }
            return try decoder.decode(T.self, from: data)
        } catch {
            return nil
        }
    }

    private func get<T: Decodable>(_ path: String) async -> T? {
        guard let req = request("GET", path) else { return nil }
        return await send(req)
    }

    /// Login POST (Google or dev). Returns token + me, or nil on any non-2xx.
    func login(path: String, body: [String: String]) async -> AuthPayload? {
        guard let req = request("POST", path, body: body) else { return nil }
        return await send(req)
    }

    // Read endpoints (shared/contract.ts). Optional = "couldn't load" → the view
    // keeps its spinner rather than showing stale or fake numbers.
    func me() async -> Me? { await get("auth/me") }
    func portfolio() async -> Portfolio? { await get("portfolio") }
    func settings() async -> FundSettings? { await get("fund-settings") }
    func today() async -> Today? { await get("today") }
    func ideas() async -> [Idea] { await get("ideas") ?? [] }
    func dossier(_ symbol: String) async -> Dossier? { await get("dossier/\(symbol)") }

    func market() async -> (universe: [MarketName], watchlist: [MarketName]) {
        let r: MarketPayload? = await get("market")
        return (r?.universe ?? [], r?.watchlist ?? [])
    }

    /// Live FMP quotes for the on-screen price overlay (the web's `/api/quotes`, now
    /// Bearer-reachable). One batched call returns prices keyed by OUR symbol. The list
    /// surfaces poll this every ~10s and overlay it on the delayed `/market`/`/dossier`
    /// snapshot. Returns nil on any failure → callers keep showing the snapshot.
    func liveQuotes(symbols: [String]) async -> [String: LiveQuote]? {
        let syms = symbols.filter { !$0.isEmpty }
        guard !syms.isEmpty else { return [:] }
        let q = syms.joined(separator: ",").addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        struct R: Decodable { let quotes: [String: LiveQuote] }
        let r: R? = await get("quotes?symbols=\(q)")
        return r?.quotes
    }

    // The Wire — the discovery feed (prototype): finds + dossiers + watchlist adds +
    // market news + lessons, woven into one scroll.
    func wire() async -> WireResponse? { await get("wire") }

    /// The notification center feed (D63) — the header bell. Members-only; Bearer-reachable.
    func notifications() async -> (items: [NotificationItem], unread: Int) {
        struct R: Decodable { let notifications: [NotificationItem]; let unread: Int }
        let r: R? = await get("notifications")
        return (r?.notifications ?? [], r?.unread ?? 0)
    }

    /// Opening the bell clears the badge — mark the caller's notifications read.
    func markNotificationsRead() async { _ = await postResult("notifications/read", [:]) }

    // The Hunt (A1) — the centerpiece feed + the on-demand refresh/brief.
    func hunt() async -> HuntResponse? { await get("hunt") }
    func refreshHunt(brief: String?) async -> ActionResult { await postResult("hunt/refresh", ["brief": brief ?? ""]) }
    func smartMoney() async -> SmartMoneyResponse? { await get("smart-money") }
    func stockExtras(_ symbol: String) async -> StockExtras? { await get("stock-extras/\(symbol)") }
    func reportForDay(_ date: String) async -> ReportDetail? { await get("reports/day/\(date)") }

    func reports() async -> [ReportSummary] {
        struct R: Decodable { let reports: [ReportSummary] }
        let r: R? = await get("reports")
        return r?.reports ?? []
    }

    func search(_ q: String) async -> [SearchHit] {
        struct R: Decodable { let matches: [SearchHit] }
        let r: R? = await get("symbol-search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")
        return r?.matches ?? []
    }

    func chatHistory(owner: String? = nil) async -> ChatThread? {
        await get(owner.map { "chat?owner=\($0.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")" } ?? "chat")
    }

    // MARK: - Writes (members; the server re-checks role + the guardrail gate)

    func setKillSwitch(_ engaged: Bool) async -> ActionResult { await postResult("killswitch", ["engaged": engaged]) }

    // FX (D62) — read the panel state; convert either direction with the amount typed in either
    // currency; approve/reject the agent's requests. `amountCents` is denominated in `inputCurrency`.
    func fxState() async -> FxState? { await get("fx") }
    func fxConvert(amountCents: Int, inputCurrency: String, from: String, to: String) async -> ActionResult {
        await postResult("fx", ["action": "convert", "amountCents": amountCents, "inputCurrency": inputCurrency, "fromCurrency": from, "toCurrency": to])
    }
    func fxApprove(id: Int, note: String? = nil) async -> ActionResult {
        var body: [String: Any] = ["action": "approve", "id": id]
        if let note, !note.isEmpty { body["note"] = note }
        return await postResult("fx", body)
    }
    func fxReject(id: Int, note: String? = nil) async -> ActionResult {
        var body: [String: Any] = ["action": "reject", "id": id]
        if let note, !note.isEmpty { body["note"] = note }
        return await postResult("fx", body)
    }

    func setDirective(_ symbol: String, _ directive: String?) async -> ActionResult {
        await postResult("stocks/directive", ["symbol": symbol, "directive": directive ?? NSNull()])
    }

    /// Universe lifecycle: add | dismiss | research | promote | demote | retire.
    func universeAction(_ symbol: String, _ action: String, extra: [String: Any] = [:]) async -> ActionResult {
        var body: [String: Any] = ["symbol": symbol, "action": action]
        body.merge(extra) { _, new in new }
        return await postResult("universe", body)
    }
    func watch(_ symbol: String, exchange: String? = nil, currency: String? = nil, name: String? = nil) async -> ActionResult {
        var extra: [String: Any] = [:]
        if let exchange { extra["exchange"] = exchange }
        if let currency { extra["currency"] = currency }
        if let name { extra["name"] = name }
        return await universeAction(symbol, "add", extra: extra)
    }

    /// Share a stock with the other member — fires an iOS push to them that
    /// deep-links to this dossier. `to` is the recipient's member key ("cam"|"graham").
    func shareStock(_ symbol: String, to key: String) async -> ActionResult {
        await postResult("stocks/share", ["symbol": symbol, "to": key])
    }

    // MARK: - Direct messages (member ↔ member — D61)

    /// The Cam↔Graham thread. Pass `since` (last seen id) to fetch only newer rows.
    func directMessages(since: Int? = nil) async -> DirectThread? {
        await get(since.map { "messages?since=\($0)" } ?? "messages")
    }

    /// Send a message or a share to the other member. A bare chat message has just
    /// `body`; a share carries `symbol` (+ optional `panel` key). The server routes it
    /// to the other member and pushes them.
    func sendMessage(body: String?, symbol: String? = nil, panel: String? = nil) async -> ActionResult {
        var payload: [String: Any] = [:]
        if let body, !body.isEmpty { payload["body"] = body }
        if let symbol { payload["symbol"] = symbol }
        if let panel { payload["panel"] = panel }
        return await postResult("messages", payload)
    }

    /// Mark the thread read (clears the inbox badge). Best-effort.
    func markMessagesRead() async { _ = await postResult("messages/read", [:]) }

    /// Cheap unread count for the inbox badge.
    func unreadMessageCount() async -> Int {
        struct R: Decodable { let unread: Int }
        let r: R? = await get("messages/unread")
        return r?.unread ?? 0
    }

    /// Unread count from the notification feed — nil on a failed fetch (so the
    /// foreground reconcile doesn't clear the lock screen on a transient error, D64).
    func notificationsUnread() async -> Int? {
        struct R: Decodable { let unread: Int }
        let r: R? = await get("notifications")
        return r?.unread
    }

    // MARK: - Push notifications (D53)

    /// Register this device's APNs token under the signed-in member. `apnsEnv` is
    /// "sandbox" (Xcode debug) or "production" (TestFlight/App Store) — they use
    /// different APNs gateways, so the server stores which one minted the token.
    func registerDeviceToken(_ token: String, apnsEnv: String) async -> ActionResult {
        await postResult("notifications/register", ["token": token, "platform": "ios", "apnsEnv": apnsEnv])
    }

    /// Forget this device server-side (sign-out). Uses an explicit bearer because the
    /// caller has usually already cleared the live session token.
    func unregisterDeviceToken(_ token: String, bearer: String?) async {
        guard let url = URL(string: "\(baseURL)/notifications/register") else { return }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.timeoutInterval = 15
        if let bearer { req.setValue("Bearer \(bearer)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["token": token])
        _ = try? await URLSession.shared.data(for: req)
    }

    func notificationPreferences() async -> NotificationPreferences? {
        await get("notifications/preferences")
    }

    /// PUT a subset of toggles; returns the full, server-canonical prefs.
    func updateNotificationPreferences(_ patch: [String: Bool]) async -> NotificationPreferences? {
        guard let url = URL(string: "\(baseURL)/notifications/preferences") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "PUT"
        req.timeoutInterval = 20
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: patch)
        return await send(req)
    }

    // MARK: - Price alerts (The Wire, Phase 2)

    /// The signed-in member's alerts (active first, then fired) — newest within each.
    func priceAlerts() async -> [PriceAlert] {
        struct R: Decodable { let alerts: [PriceAlert] }
        let r: R? = await get("notifications/price-alerts")
        return r?.alerts ?? []
    }

    /// Every member's ACTIVE alerts on one symbol (the stock page's shared view) —
    /// each carries `owner`/`ownerKey`/`mine` so we can attribute + gate delete.
    func priceAlerts(symbol: String) async -> [PriceAlert] {
        struct R: Decodable { let alerts: [PriceAlert] }
        let q = symbol.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? symbol
        let r: R? = await get("notifications/price-alerts?symbol=\(q)")
        return r?.alerts ?? []
    }

    /// Create a "ping me when SYMBOL crosses $X" alert. The server validates the level
    /// (it refuses one that's already met) and returns the guardrail message verbatim.
    func createPriceAlert(symbol: String, direction: String, thresholdCents: Int, currency: String, note: String?) async -> ActionResult {
        var body: [String: Any] = ["symbol": symbol, "direction": direction, "thresholdCents": thresholdCents, "currency": currency]
        if let note, !note.isEmpty { body["note"] = note }
        return await postResult("notifications/price-alerts", body)
    }

    func deletePriceAlert(id: Int) async -> ActionResult {
        guard let url = URL(string: "\(baseURL)/notifications/price-alerts") else { return .failure("Bad URL.") }
        var req = URLRequest(url: url)
        req.httpMethod = "DELETE"
        req.timeoutInterval = 20
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: ["id": id])
        do {
            let (_, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            return (200..<300).contains(code) ? .success : .failure("Couldn't delete (\(code)).")
        } catch { return .failure(error.localizedDescription) }
    }

    // MARK: - Low-level POST + chat stream

    /// POST JSON, decode `{ error }` on failure so the UI can show the guardrail verbatim.
    private func postResult(_ path: String, _ body: [String: Any]) async -> ActionResult {
        guard let url = URL(string: "\(baseURL)/\(path)") else { return .failure("Bad URL.") }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 20
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        do {
            let (data, resp) = try await URLSession.shared.data(for: req)
            let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
            if (200..<300).contains(code) { return .success }
            struct E: Decodable { let error: String? }
            let msg = (try? decoder.decode(E.self, from: data))?.error
            return .failure(msg ?? "Request failed (\(code)).")
        } catch {
            return .failure(error.localizedDescription)
        }
    }

    /// Stream the agent's reply (SSE: `data: {type,text}`). Members-only, cookie/Bearer
    /// resolved server-side. `onText` gets cumulative text; `onStatus` the "thinking" line.
    func chatStream(message: String, symbol: String?, owner: String?,
                    onText: @escaping (String) -> Void,
                    onStatus: @escaping (String?) -> Void) async throws {
        guard let url = URL(string: "\(baseURL)/chat") else { throw URLError(.badURL) }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.timeoutInterval = 120
        if let token { req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        var body: [String: Any] = ["message": message]
        if let symbol { body["symbol"] = symbol }
        if let owner { body["owner"] = owner }
        req.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (bytes, resp) = try await URLSession.shared.bytes(for: req)
        guard let http = resp as? HTTPURLResponse, (200..<300).contains(http.statusCode) else {
            throw URLError(.badServerResponse)
        }
        var acc = ""
        for try await line in bytes.lines {
            guard line.hasPrefix("data: ") else { continue }
            let json = String(line.dropFirst(6))
            guard let d = json.data(using: .utf8),
                  let ev = try? JSONSerialization.jsonObject(with: d) as? [String: Any] else { continue }
            let type = ev["type"] as? String
            let text = ev["text"] as? String ?? ""
            switch type {
            case "text":   acc += (acc.isEmpty ? "" : "\n\n") + text; onText(acc); onStatus(nil)
            case "status": onStatus(text)
            case "error":  onStatus("⚠️ \(text)")
            default: break
            }
        }
    }
}

/// Poll `/api/quotes` for `symbols` every ~`everySeconds` until cancelled, handing each
/// fresh snapshot to `onUpdate`. Drop into a SwiftUI `.task(id:)` keyed on the symbol set
/// so it auto-cancels on disappear (and restarts when the set changes) — the app's
/// equivalent of the web `<LiveQuotesProvider>`: one batched poll per screen, not per row.
/// Skips polling while the app is backgrounded (the OS suspends timers anyway; this also
/// avoids a burst on resume). Mirrors the calmer table cadence, not the 2.5s hero ticker.
@MainActor
func pollLiveQuotes(_ symbols: [String], everySeconds: UInt64 = 10,
                    onUpdate: @escaping ([String: LiveQuote]) -> Void) async {
    let syms = Array(Set(symbols.map { $0.uppercased() }.filter { !$0.isEmpty })).sorted()
    guard !syms.isEmpty else { return }
    while !Task.isCancelled {
        if UIApplication.shared.applicationState != .background,
           let fresh = await APIClient.shared.liveQuotes(symbols: syms) {
            onUpdate(fresh)
        }
        try? await Task.sleep(nanoseconds: everySeconds * 1_000_000_000)
    }
}

/// Result of a member write — success, or the server's guardrail message to show.
enum ActionResult {
    case success
    case failure(String)
    var ok: Bool { if case .success = self { return true }; return false }
    var error: String? { if case .failure(let m) = self { return m }; return nil }
}

// MARK: - Face ID gate (it's a finance app — sensitive actions confirm it's you)

/// Gates a sensitive member action behind biometrics (kill switch, orders, directives —
/// docs/IOS-PLAN.md). Falls through to success where no biometric is enrolled (simulator)
/// so the flow stays testable; the server still enforces the real authz.
enum BiometricGate {
    static func confirm(_ reason: String) async -> Bool {
        let ctx = LAContext()
        ctx.localizedFallbackTitle = "Use passcode"
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { return true }
        return await withCheckedContinuation { cont in
            ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, _ in
                cont.resume(returning: ok)
            }
        }
    }
}

// MARK: - Google Sign-In seam

/// The native Google flow (docs/IOS-PLAN.md). Presents Google Sign-In, returns the
/// Google ID token (its audience = the GRQ-iOS OAuth client, GIDClientID in
/// Info.plist) for the backend to verify at POST /api/auth/google. The `canImport`
/// guard keeps the app compiling even if the SPM package isn't resolved yet.
enum GoogleAuth {
    @MainActor
    static func signIn() async throws -> String {
        #if canImport(GoogleSignIn)
        guard let presenter = rootViewController() else {
            throw NSError(domain: "GRQ", code: -2,
                          userInfo: [NSLocalizedDescriptionKey: "No window available to present Google Sign-In."])
        }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
        guard let idToken = result.user.idToken?.tokenString else {
            throw NSError(domain: "GRQ", code: -3,
                          userInfo: [NSLocalizedDescriptionKey: "Google returned no ID token."])
        }
        return idToken
        #else
        throw NSError(domain: "GRQ", code: -1,
                      userInfo: [NSLocalizedDescriptionKey: "GoogleSignIn SDK isn't linked — add it via SPM (docs/IOS-PLAN.md). Use a dev login for now."])
        #endif
    }

    @MainActor
    private static func rootViewController() -> UIViewController? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        let scene = scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
        var vc = scene?.keyWindow?.rootViewController
        while let presented = vc?.presentedViewController { vc = presented }
        return vc
    }
}

// MARK: - Push notifications (APNs — D53)

/// A tapped notification's deep-link target (a stock to open, optionally scrolled to
/// a specific panel — D61). `id` folds in the panel so two pushes for the same symbol
/// but different panels each re-present the sheet.
struct SymbolRoute: Identifiable, Equatable {
    let symbol: String
    var panel: String? = nil
    var id: String { symbol + "#" + (panel ?? "") }
}

/// Owns the push lifecycle: ask permission, register with APNs, upload the device
/// token under the signed-in member, surface a tapped notification as a deep link.
/// The server gates WHICH notifications arrive (per-user prefs); this just plumbs the
/// device in. trades/risk/critical always arrive; everything else is the member's call.
@MainActor
final class PushManager: ObservableObject {
    static let shared = PushManager()

    /// Set when the member taps a notification carrying a `symbol` — the UI opens it.
    @Published var route: SymbolRoute?

    /// Set when the member taps a message push with no symbol — the UI opens the
    /// Cam↔Graham thread (D61).
    @Published var openMessages = false

    /// The current device token (hex). Kept so sign-out can unregister it.
    private(set) var deviceTokenHex: String?

    /// The APNs gateway this build's tokens belong to. The real environment is the
    /// `aps-environment` entitlement, which the SIGNING profile sets — NOT the build
    /// config (a dev-signed Release build run locally is still sandbox; only a
    /// distribution build is production). Read it from the embedded provisioning
    /// profile; an App Store build strips that file → default production. The server
    /// also self-heals a wrong value, so this is belt-and-suspenders.
    static var apnsEnv: String {
        #if targetEnvironment(simulator)
        return "sandbox"
        #else
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let raw = String(data: data, encoding: .isoLatin1),
              let keyRange = raw.range(of: "<key>aps-environment</key>") else {
            return "production" // no embedded profile → App Store build → production
        }
        let after = raw[keyRange.upperBound...]
        guard let open = after.range(of: "<string>"),
              let close = after.range(of: "</string>"),
              open.upperBound <= close.lowerBound else { return "production" }
        return after[open.upperBound..<close.lowerBound].contains("development") ? "sandbox" : "production"
        #endif
    }

    /// Ask for permission (the OS prompts once) and register with APNs. Safe to call
    /// on every authenticated launch — iOS dedupes, and a token can rotate.
    func registerForPush() {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            guard granted else { return }
            Task { @MainActor in UIApplication.shared.registerForRemoteNotifications() }
        }
    }

    /// APNs handed us a token (via the AppDelegate). Stash + upload it.
    func didRegister(deviceToken: Data) {
        deviceTokenHex = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { await uploadTokenIfPossible() }
    }

    /// Upload the stored token if we have one and we're signed in. Called both when the
    /// token lands and right after sign-in (covers either ordering of the two events).
    func uploadTokenIfPossible() async {
        guard let hex = deviceTokenHex, APIClient.shared.token != nil else { return }
        _ = await APIClient.shared.registerDeviceToken(hex, apnsEnv: Self.apnsEnv)
    }

    /// Wipe every delivered notification + zero the app badge. Triggered by the silent
    /// "clear" push (member opened the web bell) and by the foreground reconcile (D64).
    func clearDelivered() async {
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        try? await UNUserNotificationCenter.current().setBadgeCount(0)
    }

    /// On app foreground: if the server says nothing's unread, clear the delivered pile.
    /// The catch-up net for a silent "clear" push iOS throttled or never delivered (the
    /// app was force-quit). Does nothing on a failed fetch (notificationsUnread → nil).
    func reconcileOnForeground() async {
        guard APIClient.shared.token != nil else { return }
        if let unread = await APIClient.shared.notificationsUnread(), unread == 0 {
            await clearDelivered()
        }
    }
}

/// Minimal app delegate — SwiftUI has no lifecycle hook for remote-notification
/// registration, so we adapt one in (GRQApp `@UIApplicationDelegateAdaptor`). It does
/// notifications ONLY; auth stays in AuthManager.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Task { @MainActor in PushManager.shared.didRegister(deviceToken: deviceToken) }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("[push] APNs registration failed: \(error.localizedDescription)")
    }

    // A silent (content-available) push carrying `clear` means the member triaged the
    // notifications on the web bell — wipe the delivered pile + badge here (D64).
    func application(_ application: UIApplication,
                     didReceiveRemoteNotification userInfo: [AnyHashable: Any],
                     fetchCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        if userInfo["clear"] != nil {
            Task { await PushManager.shared.clearDelivered() }
        }
        completionHandler(.noData)
    }

    // Show banners even when the app is foregrounded (a fill mid-session still pings).
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    // Tap → deep-link to the stock if the payload named one (scrolled to a panel if
    // the share named one); otherwise a message push opens the Cam↔Graham thread.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        let info = response.notification.request.content.userInfo
        if let symbol = info["symbol"] as? String, !symbol.isEmpty {
            let panel = (info["panel"] as? String).flatMap { $0.isEmpty ? nil : $0 }
            Task { @MainActor in PushManager.shared.route = SymbolRoute(symbol: symbol, panel: panel) }
        } else if (info["category"] as? String) == "messages" {
            Task { @MainActor in PushManager.shared.openMessages = true }
        }
        completionHandler()
    }
}
