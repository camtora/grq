import SwiftUI

// THE NOTIFICATION CENTER (D63) — the header bell + its drawer, mirroring the web
// `NotificationBell`. Reads the caller's feed from /api/notifications (Bearer-reachable,
// members-only) — GRQ's trades, risk, FX, dossiers, hunt finds, agent moves, reports,
// the other member's actions. The `messages` category is NOT here (the avatar's
// envelope badge owns Cam↔Graham DMs); the bell owns fund + agent activity.

/// One feed row — the wire shape from `lib/notifications.ts serializeNotification`.
struct NotificationItem: Decodable, Identifiable {
    let id: Int
    let at: String
    let category: String
    let severity: String   // "info" | "warning" | "critical"
    let title: String
    let body: String
    let symbol: String?    // deep-link target → the dossier
    let panel: String?     // panel within the dossier (e.g. "analyst")
    let read: Bool
}

/// Polls the feed for the bell badge + drawer list (like MessagesInbox). Provided at
/// the tab root so every screen's header bell shares one source of truth.
@MainActor
final class NotificationsInbox: ObservableObject {
    @Published var items: [NotificationItem] = []
    @Published var unread = 0
    private var started = false

    func start() {
        guard !started else { return }
        started = true
        Task { @MainActor in
            while !Task.isCancelled {
                await refresh()
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30s
            }
        }
    }

    func refresh() async {
        let r = await APIClient.shared.notifications()
        items = r.items
        unread = r.unread
    }

    /// The bell was opened → clear the badge (server + locally). The already-loaded
    /// rows keep their own `read` flags, so just-unread items still show their dot
    /// for this viewing (mirrors the web bell).
    func markRead() async {
        guard unread > 0 else { return }
        unread = 0
        await APIClient.shared.markNotificationsRead()
    }
}

/// Presents the drawer sheet from the bell (like ChatLauncher for chat).
@MainActor
final class NotificationsLauncher: ObservableObject {
    @Published var show = false
}

/// Header bell → the notification center. Members-only; carries the unread badge.
/// Lives beside ChatButton/AvatarButton in every screen header (NotificationsInbox +
/// NotificationsLauncher are provided at the tab root).
struct NotificationBell: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var notifs: NotificationsInbox
    @EnvironmentObject private var launcher: NotificationsLauncher
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Theme.palette(scheme)
        if auth.currentUser?.role == .member {
            Button { launcher.show = true } label: {
                Image(systemName: notifs.unread > 0 ? "bell.badge.fill" : "bell.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(p.accent)
                    .padding(9)
                    .background(Circle().fill(p.accent.opacity(0.12)))
                    .overlay(alignment: .topTrailing) {
                        if notifs.unread > 0 {
                            Text("\(min(notifs.unread, 9))")
                                .font(.system(size: 9, weight: .black)).foregroundStyle(.white)
                                .frame(width: 15, height: 15)
                                .background(Circle().fill(p.neg))
                                .offset(x: 2, y: -2)
                        }
                    }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(notifs.unread > 0 ? "Notifications (\(notifs.unread) unread)" : "Notifications")
        }
    }
}

/// The notification center sheet. Opening it marks everything read (the web bell does
/// the same). A row with a symbol deep-links to that dossier, scrolled to its panel.
struct NotificationsDrawer: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var glossary: GlossaryPresenter
    @EnvironmentObject private var notifs: NotificationsInbox
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let p = Theme.palette(scheme)
        NavigationStack {
            ScrollView {
                if notifs.items.isEmpty {
                    EmptyState(title: "All caught up",
                               message: "GRQ's trades, research, hunt finds and risk alerts land here as it works.")
                        .padding(.horizontal, 16).padding(.top, 40)
                } else {
                    LazyVStack(spacing: 10) {
                        ForEach(notifs.items) { n in row(n, p) }
                    }
                    .padding(16)
                }
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        // Refresh on open so the rows are current, then clear the badge.
        .task { await notifs.refresh(); await notifs.markRead() }
    }

    @ViewBuilder private func row(_ n: NotificationItem, _ p: Palette) -> some View {
        if let sym = n.symbol, !sym.isEmpty {
            NavigationLink {
                StockDetailView(symbol: sym, scrollTo: n.panel)
                    .environmentObject(auth).environmentObject(glossary)
            } label: { rowBody(n, p, chevron: true) }
            .buttonStyle(.plain)
        } else {
            rowBody(n, p, chevron: false)
        }
    }

    private func rowBody(_ n: NotificationItem, _ p: Palette, chevron: Bool) -> some View {
        Card {
            HStack(alignment: .top, spacing: 12) {
                Circle().fill(severityColor(n.severity, p))
                    .frame(width: 8, height: 8).padding(.top, 5)
                    .opacity(n.read ? 0.3 : 1)
                VStack(alignment: .leading, spacing: 3) {
                    Text(n.title).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                        .fixedSize(horizontal: false, vertical: true)
                    if !n.body.isEmpty {
                        Text(n.body).font(.caption).foregroundStyle(p.textMuted)
                            .fixedSize(horizontal: false, vertical: true).lineLimit(4)
                    }
                    HStack(spacing: 6) {
                        Text(n.category.uppercased()).font(.system(size: 9, weight: .bold)).tracking(0.8)
                            .foregroundStyle(p.accentText)
                        Text("·").font(.caption2).foregroundStyle(p.textMuted)
                        Text(timeAgo(n.at)).font(.caption2).foregroundStyle(p.textMuted)
                    }
                    .padding(.top, 1)
                }
                Spacer(minLength: 0)
                if chevron {
                    Image(systemName: "chevron.right").font(.system(size: 11, weight: .bold))
                        .foregroundStyle(p.textMuted)
                }
            }
        }
    }

    private func severityColor(_ s: String, _ p: Palette) -> Color {
        switch s {
        case "critical": return p.neg
        case "warning":  return Color(hex: "f59e0b")
        default:         return p.accent
        }
    }

    private func timeAgo(_ iso: String) -> String {
        let withFrac = ISO8601DateFormatter()
        withFrac.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let d = withFrac.date(from: iso) ?? ISO8601DateFormatter().date(from: iso)
        guard let d else { return "" }
        let s = Int(Date().timeIntervalSince(d))
        if s < 60 { return "just now" }
        if s < 3600 { return "\(s / 60)m ago" }
        if s < 86400 { return "\(s / 3600)h ago" }
        return "\(s / 86400)d ago"
    }
}
