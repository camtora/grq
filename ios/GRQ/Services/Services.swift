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

    /// Dev login — mints a token without Google, for testing before the OAuth
    /// client exists. Only works when the server has GRQ_DEV_LOGIN=1 (off in prod).
    /// Wired to the existing "Continue as …" buttons.
    func signIn(_ email: String) {
        Task {
            authError = nil
            signingIn = true
            defer { signingIn = false }
            await authenticate(path: "auth/dev", body: ["email": email])
        }
    }

    private func authenticate(path: String, body: [String: String]) async {
        guard let auth = await APIClient.shared.login(path: path, body: body) else {
            authError = "Sign-in failed. Use Google, or (testing) ensure the server has GRQ_DEV_LOGIN=1."
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

/// A tapped notification's deep-link target (a stock to open).
struct SymbolRoute: Identifiable, Equatable { let id: String }

/// Owns the push lifecycle: ask permission, register with APNs, upload the device
/// token under the signed-in member, surface a tapped notification as a deep link.
/// The server gates WHICH notifications arrive (per-user prefs); this just plumbs the
/// device in. trades/risk/critical always arrive; everything else is the member's call.
@MainActor
final class PushManager: ObservableObject {
    static let shared = PushManager()

    /// Set when the member taps a notification carrying a `symbol` — the UI opens it.
    @Published var route: SymbolRoute?

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

    // Show banners even when the app is foregrounded (a fill mid-session still pings).
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .list])
    }

    // Tap → deep-link to the stock if the payload named one.
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                didReceive response: UNNotificationResponse,
                                withCompletionHandler completionHandler: @escaping () -> Void) {
        if let symbol = response.notification.request.content.userInfo["symbol"] as? String, !symbol.isEmpty {
            Task { @MainActor in PushManager.shared.route = SymbolRoute(id: symbol) }
        }
        completionHandler()
    }
}
