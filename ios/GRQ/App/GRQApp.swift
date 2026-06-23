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
                SplashView(done: { withAnimation(.easeInOut(duration: 0.5)) { showSplash = false } })
                    .transition(.opacity)
            } else if auth.isAuthenticated {
                MainTabView()
                    .transition(.opacity)
            } else {
                SignInView()
                    .transition(.opacity)
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
        // A tapped notification carrying a symbol opens that stock's dossier (scrolled
        // to a panel if the share named one — D61).
        .sheet(item: $push.route) { r in
            NavigationStack { StockDetailView(symbol: r.symbol, scrollTo: r.panel) }
                .environmentObject(auth)
                .environmentObject(glossary)
        }
    }
}

// The 6-button bar: Today · Fund · Hunt · Markets · Wire · More (Today is the default
// landing — the splash fades into it). The system TabView shows only 5 on iPhone (it
// collapses the rest into a "More" tab), and Markets being buried made it hard to reach
// — so we drive a CUSTOM bar. Visited tabs stay alive (state + nav stacks + pollers
// preserved, like the system bar) and load lazily on first tap. Chat is a top-right
// button on every screen → the unified chat sheet, presented here.
struct MainTabView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var glossary: GlossaryPresenter
    @EnvironmentObject private var push: PushManager
    @Environment(\.colorScheme) private var scheme
    @StateObject private var chat = ChatLauncher()
    @StateObject private var inbox = MessagesInbox()
    @State private var selection = 0     // Today (the splash fades into it)
    @State private var visited: Set<Int> = [0]

    private let tabs: [(title: String, icon: String)] = [
        ("Today", "newspaper.fill"),
        ("Fund", "briefcase.fill"),
        ("Hunt", "binoculars.fill"),
        ("Markets", "chart.bar.fill"),
        ("Wire", "dot.radiowaves.left.and.right"),
        ("More", "ellipsis.circle.fill"),
    ]

    var body: some View {
        ZStack {
            ForEach(0..<tabs.count, id: \.self) { i in
                if visited.contains(i) {
                    screen(i)
                        .opacity(i == selection ? 1 : 0)
                        .allowsHitTesting(i == selection)
                        .zIndex(i == selection ? 1 : 0)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .safeAreaInset(edge: .bottom, spacing: 0) { tabBar }
        .ignoresSafeArea(.keyboard, edges: .bottom)
        .environmentObject(chat)
        .environmentObject(inbox)
        // The unified chat (member thread + GRQ agent). Pushed StockDetailViews (from
        // shared-stock cards) need auth + glossary.
        .sheet(isPresented: $chat.show) {
            UnifiedChatView()
                .environmentObject(auth)
                .environmentObject(inbox)
                .environmentObject(glossary)
        }
        .task { inbox.start() }
        // A tapped message push (no symbol) opens the unified chat (member thread).
        .onChange(of: push.openMessages) { _, open in
            if open { chat.show = true; push.openMessages = false }
        }
    }

    @ViewBuilder private func screen(_ i: Int) -> some View {
        switch i {
        case 0: TodayView()
        case 1: PortfolioView()
        case 2: HuntView()
        case 3: MarketsView()
        case 4: WireView()
        default: MoreView()
        }
    }

    private var tabBar: some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 0) {
            ForEach(0..<tabs.count, id: \.self) { tabButton($0) }
        }
        .padding(.top, 8)
        .padding(.bottom, 4)
        .frame(maxWidth: .infinity)
        .background(.bar, ignoresSafeAreaEdges: .bottom)
        .overlay(alignment: .top) { Rectangle().fill(p.cardBorder).frame(height: 0.5) }
    }

    private func tabButton(_ i: Int) -> some View {
        let p = Theme.palette(scheme)
        let on = selection == i
        return Button {
            selection = i
            visited.insert(i)
        } label: {
            VStack(spacing: 3) {
                ZStack {
                    Image(systemName: tabs[i].icon).font(.system(size: 18))
                    if i == 5 && inbox.unread > 0 {
                        Text("\(min(inbox.unread, 9))")
                            .font(.system(size: 9, weight: .black)).foregroundStyle(.white)
                            .frame(width: 15, height: 15)
                            .background(Circle().fill(p.neg))
                            .offset(x: 11, y: -9)
                    }
                }
                Text(tabs[i].title).font(.system(size: 9, weight: .semibold))
            }
            .foregroundStyle(on ? p.accent : p.textMuted)
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
