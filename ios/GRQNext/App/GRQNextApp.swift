import SwiftUI

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

// GRQ Next — the rebuilt app. Reuses the shared engine (AuthManager, APIClient, PushManager,
// Content, Theme palette, contract Models) and presents an all-new, native-feeling UI whose
// navigation mirrors the web. @main for the GRQNext target (the old GRQ target keeps its own).

@main
struct GRQNextApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @StateObject private var auth = AuthManager()
    @StateObject private var theme = NextTheme()
    @StateObject private var glossary = NextGlossary()
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
                .sheet(item: $glossary.entry) { entry in GlossarySheet(entry: entry) }
                .onOpenURL { url in
                    #if canImport(GoogleSignIn)
                    _ = GIDSignIn.sharedInstance.handle(url)
                    #endif
                }
        }
    }
}

/// Per-member theme (Cam = light, Graham = dark), overridable in Settings.
final class NextTheme: ObservableObject {
    @Published var colorScheme: ColorScheme? = nil
    func apply(_ t: AppTheme) { colorScheme = (t == .light) ? .light : .dark }
    func toggle() { colorScheme = (colorScheme == .light) ? .dark : .light }
}

/// One place any term tap can pop a glossary definition (root `.sheet(item:)`).
final class NextGlossary: ObservableObject {
    @Published var entry: GlossaryEntry?
    func show(_ slug: String) { entry = Content.shared.glossary(slug) }
    func present(_ entry: GlossaryEntry) { self.entry = entry }
}

struct RootView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: NextTheme
    @EnvironmentObject private var glossary: NextGlossary
    @EnvironmentObject private var push: PushManager
    @Environment(\.scenePhase) private var scenePhase
    @State private var showSplash = true

    var body: some View {
        Group {
            if showSplash {
                SplashScreen(done: { withAnimation(.easeInOut(duration: 0.45)) { showSplash = false } })
                    .transition(.opacity)
            } else if auth.isAuthenticated {
                MainTabView().transition(.opacity)
            } else {
                SignInScreen().transition(.opacity)
            }
        }
        .onAppear { if let t = auth.currentUser?.theme { theme.apply(t) } }
        .onChange(of: auth.currentUser?.theme) { _, t in if let t { theme.apply(t) } }
        .onChange(of: scenePhase) { old, new in
            // Make it rain on every return from background — the splash Cam loves (tap to enter).
            if new == .active && old == .background { showSplash = true }
            if new == .active { Task { await push.reconcileOnForeground() } }
        }
        .task(id: auth.isAuthenticated) {
            if auth.isAuthenticated {
                push.registerForPush()
                await push.uploadTokenIfPossible()
            }
        }
        // A tapped notification carrying a symbol opens that stock's dossier (scrolled to a
        // panel when the push named one).
        .sheet(item: $push.route) { r in
            NavigationStack { StockDetailView(symbol: r.symbol, scrollTo: r.panel) }
                .environmentObject(auth)
                .environmentObject(glossary)
        }
    }
}

/// The native 5-tab bar, mirroring the web nav:
/// Today · Portfolio · Markets · Experiments · More. Each tab is its own NavigationStack;
/// the Stock dossier pushes from anywhere. Global Chat + Notifications chrome lands in Phase D.
struct MainTabView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: NextTheme
    @EnvironmentObject private var glossary: NextGlossary

    var body: some View {
        TabView {
            NavigationStack { TodayScreen() }
                .tabItem { Label("Today", systemImage: "newspaper.fill") }
            NavigationStack { PortfolioScreen() }
                .tabItem { Label("Portfolio", systemImage: "briefcase.fill") }
            NavigationStack { MarketsScreen() }
                .tabItem { Label("Markets", systemImage: "chart.bar.fill") }
            NavigationStack { ExperimentsScreen() }
                .tabItem { Label("Experiments", systemImage: "flask.fill") }
            NavigationStack { MoreScreen() }
                .tabItem { Label("More", systemImage: "ellipsis.circle.fill") }
        }
    }
}
