import SwiftUI

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
    @State private var splashDone = false

    var body: some View {
        Group {
            if !splashDone {
                SplashView(done: { splashDone = true })
            } else if auth.isAuthenticated {
                MainTabView()
            } else {
                SignInView()
            }
        }
        .onAppear { if let t = auth.currentUser?.theme { theme.apply(t) } }
        .onChange(of: auth.currentUser?.theme) { _, t in if let t { theme.apply(t) } }
    }
}

struct MainTabView: View {
    var body: some View {
        TabView {
            TodayView()
                .tabItem { Label(Strings.shared.s("tabs.today.label", "Today"), systemImage: "newspaper") }
            MarketView()
                .tabItem { Label(Strings.shared.s("tabs.market.label", "Market"), systemImage: "chart.line.uptrend.xyaxis") }
            PortfolioView()
                .tabItem { Label(Strings.shared.s("tabs.portfolio.label", "Portfolio"), systemImage: "briefcase") }
            IdeasView()
                .tabItem { Label(Strings.shared.s("tabs.ideas.label", "Ideas"), systemImage: "lightbulb") }
            SettingsView()
                .tabItem { Label(Strings.shared.s("tabs.settings.label", "Settings"), systemImage: "gearshape") }
        }
    }
}
