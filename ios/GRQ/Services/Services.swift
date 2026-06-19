import SwiftUI
import Security
import UIKit
import LocalAuthentication

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
        currentUser = nil
        APIClient.shared.token = nil
        Keychain.delete(Self.tokenKey)
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
