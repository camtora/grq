import SwiftUI

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@main
struct GRQApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthManager()
    @StateObject private var theme = ThemeManager()
    @StateObject private var glossary = GlossaryPresenter()
    @StateObject private var push = PushManager.shared

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(theme)
                .environmentObject(glossary)
                .environmentObject(push)
                .tint(Theme.brandAccent)
                .preferredColorScheme(theme.colorScheme)
                .sheet(item: $glossary.entry) { entry in
                    GlossarySheet(entry: entry)
                }
                .onOpenURL { url in
                    // GoogleSignIn completes its flow by reopening the app via the
                    // reversed-client-id URL scheme; hand the callback to the SDK.
                    #if canImport(GoogleSignIn)
                    _ = GIDSignIn.sharedInstance.handle(url)
                    #endif
                }
        }
    }
}

/// Forces the per-member theme (Cam = light, Graham = dark), overridable in Settings.
final class ThemeManager: ObservableObject {
    @Published var colorScheme: ColorScheme? = nil
    func apply(_ t: AppTheme) { colorScheme = (t == .light) ? .light : .dark }
    func toggle() { colorScheme = (colorScheme == .light) ? .dark : .light }
}

/// One place any `TermLink` can pop a glossary definition (root `.sheet(item:)`).
final class GlossaryPresenter: ObservableObject {
    @Published var entry: GlossaryEntry?
    func show(_ slug: String) { entry = Content.shared.glossary(slug) }
    /// Present an entry we already hold (e.g. a Wire lesson whose slug isn't bundled).
    func present(_ entry: GlossaryEntry) { self.entry = entry }
}

struct RootView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var theme: ThemeManager
    @EnvironmentObject var glossary: GlossaryPresenter
    @EnvironmentObject var push: PushManager
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSplash = true

    var body: some View {
        Group {
            if showSplash {
                SplashView(done: { showSplash = false })
            } else if auth.isAuthenticated {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .onAppear { if let t = auth.currentUser?.theme { theme.apply(t) } }
        .onChange(of: auth.currentUser?.theme) { _, t in if let t { theme.apply(t) } }
        .onChange(of: scenePhase) { old, new in
            // Make it rain on every open — cold launch and every return from background.
            if new == .active && old == .background { showSplash = true }
        }
        // Register for push once the member is signed in (the OS prompts once); also
        // (re)upload the token in case APNs handed it to us before auth landed (D53).
        .task(id: auth.isAuthenticated) {
            if auth.isAuthenticated {
                push.registerForPush()
                await push.uploadTokenIfPossible()
            }
        }
        // A tapped notification carrying a symbol opens that stock's dossier.
        .sheet(item: $push.route) { r in
            NavigationStack { StockDetailView(symbol: r.id) }
                .environmentObject(auth)
                .environmentObject(glossary)
        }
    }
}

// The 5-tab bar with THE HUNT dead center (the star, and the default landing tab —
// the app is a toilet-reader centered on the feed). Chat is reachable from a top-right
// button on every screen (ChatButton) — the sheet is presented once, here.
// PROTOTYPE (The Wire): iOS shows max 5 tabs, so The Wire takes the 4th slot beside the
// Hunt and Markets moves to a row under More (reachable, reversible). Revisit placement
// once the feed proves out.
struct MainTabView: View {
    @EnvironmentObject private var auth: AuthManager
    @StateObject private var chat = ChatLauncher()
    @State private var selection = 2     // The Hunt

    var body: some View {
        TabView(selection: $selection) {
            TodayView().tabItem { Label("Today", systemImage: "newspaper.fill") }.tag(0)
            PortfolioView().tabItem { Label("Fund", systemImage: "briefcase.fill") }.tag(1)
            HuntView().tabItem { Label("Hunt", systemImage: "binoculars.fill") }.tag(2)
            WireView().tabItem { Label("Wire", systemImage: "dot.radiowaves.left.and.right") }.tag(3)
            MoreView().tabItem { Label("More", systemImage: "ellipsis.circle.fill") }.tag(4)
        }
        .environmentObject(chat)
        .sheet(isPresented: $chat.show) { ChatView().environmentObject(auth) }
    }
}
