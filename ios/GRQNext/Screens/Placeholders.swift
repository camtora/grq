import SwiftUI

// Phase A scaffolds — each tab compiles + runs with the nav structure in place; the real
// screens land in Phases B–E. Kept intentionally thin so the shell is reviewable now.

private struct ComingSoon: View {
    @Environment(\.colorScheme) private var scheme
    let phase: String
    let note: String
    var body: some View {
        let p = Theme.palette(scheme)
        GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                Chip(text: phase, tone: .dim)
                Text(note).font(.subheadline).foregroundStyle(p.textMuted)
            }
        }
    }
}

struct ExperimentsScreen: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let p = Theme.palette(scheme)
        ScreenScaffold(title: "Experiments") {
            SectionHeader("Live")
            GCard(padding: 0) {
                VStack(spacing: 0) {
                    NavigationLink { HuntScreen() } label: { labRow("The Hunt", "binoculars.fill", "under-the-radar leads, heat-ranked", p) }
                    Divider().overlay(p.cardBorder)
                    NavigationLink { WireScreen() } label: { labRow("The Wire", "dot.radiowaves.left.and.right", "the woven discovery feed", p) }
                    Divider().overlay(p.cardBorder)
                    NavigationLink { ChessMovesScreen() } label: { labRow("Chess Moves", "checkerboard.rectangle", "value-chain boards & ripple plays", p) }
                    Divider().overlay(p.cardBorder)
                    NavigationLink { RaceScreen() } label: { labRow("Second Opinions", "person.2.fill", "shadow models grade the calls", p) }
                    Divider().overlay(p.cardBorder)
                    NavigationLink { BullsScreen() } label: { labRow("Bull Race", "hare.fill", "each model runs its own book", p) }
                    Divider().overlay(p.cardBorder)
                    NavigationLink { OptionsDeskScreen() } label: { labRow("Options Desk", "slider.horizontal.3", "stock-only vs +options sandbox", p) }
                    Divider().overlay(p.cardBorder)
                    NavigationLink { ReportCardScreen() } label: { labRow("Report Card", "checkmark.seal.fill", "how the calls actually did", p) }
                }
            }
            Text("Experiments are sandboxes & research — never the live fund.")
                .font(.caption2).foregroundStyle(p.textMuted)
        }
        .grqChrome()
    }

    private func labRow(_ title: String, _ icon: String, _ sub: String, _ p: Palette) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: icon).foregroundStyle(p.accent).frame(width: 24)
            VStack(alignment: .leading, spacing: 1) {
                Text(title).foregroundStyle(p.textPrimary)
                Text(sub).font(.caption2).foregroundStyle(p.textMuted)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(p.textMuted)
        }
        .padding(.horizontal, Space.lg).padding(.vertical, Space.md)
        .contentShape(Rectangle())
    }
}

struct MoreScreen: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: NextTheme
    @Environment(\.colorScheme) private var scheme
    private var isMember: Bool { auth.currentUser?.role == .member }
    var body: some View {
        let p = Theme.palette(scheme)
        ScreenScaffold(title: "More") {
            if let me = auth.currentUser {
                GCard {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(me.name ?? me.email).font(.headline).foregroundStyle(p.textPrimary)
                        Text(me.email).font(.caption).foregroundStyle(p.textMuted)
                        Text(me.role.rawValue.uppercased()).font(.caption2.weight(.bold)).tracking(0.6).foregroundStyle(p.accent).padding(.top, 2)
                    }
                }
            }
            GCard(padding: 0) {
                VStack(spacing: 0) {
                    if isMember {
                        NavigationLink { SettingsScreen() } label: { moreRow("Settings · risk & kill switch", "slider.horizontal.3", p) }
                        Divider().overlay(p.cardBorder)
                        NavigationLink { MessagesScreen() } label: { moreRow("Messages", "bubble.left.and.bubble.right.fill", p) }
                        Divider().overlay(p.cardBorder)
                    }
                    NavigationLink { ReportsScreen() } label: { moreRow("Reports", "doc.text.fill", p) }
                    Divider().overlay(p.cardBorder)
                    Button { theme.toggle() } label: { moreRow("Dark / light", "circle.lefthalf.filled", p) }.buttonStyle(.plain)
                }
            }
            Button(role: .destructive) { auth.signOut() } label: {
                Text("Sign out").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
        .grqChrome()
    }

    private func moreRow(_ title: String, _ icon: String, _ p: Palette) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: icon).foregroundStyle(p.accent).frame(width: 24)
            Text(title).foregroundStyle(p.textPrimary)
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(p.textMuted)
        }
        .padding(.horizontal, Space.lg).padding(.vertical, Space.md)
        .contentShape(Rectangle())
    }
}
