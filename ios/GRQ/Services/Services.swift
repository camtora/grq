import SwiftUI
import Security
import UIKit

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
