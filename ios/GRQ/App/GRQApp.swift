import SwiftUI

#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

@main
struct GRQApp: App {
    @StateObject private var auth = AuthManager()
    @StateObject private var theme = ThemeManager()
    @StateObject private var glossary = GlossaryPresenter()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(auth)
                .environmentObject(theme)
                .environmentObject(glossary)
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
}

struct RootView: View {
    @EnvironmentObject var auth: AuthManager
    @EnvironmentObject var theme: ThemeManager
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
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            TodayView().tabItem { Label("Today", systemImage: "newspaper.fill") }
            UniverseView().tabItem { Label("Universe", systemImage: "square.grid.2x2.fill") }
            PortfolioView().tabItem { Label("Portfolio", systemImage: "briefcase.fill") }
            IdeasView().tabItem { Label("Ideas", systemImage: "lightbulb.fill") }
            SettingsView().tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}
