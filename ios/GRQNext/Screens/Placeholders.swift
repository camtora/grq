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
    private let items: [(String, String)] = [
        ("The Hunt", "binoculars.fill"),
        ("The Wire", "dot.radiowaves.left.and.right"),
        ("Second Opinions", "person.2.fill"),
        ("Bull Race", "hare.fill"),
        ("Options Desk", "slider.horizontal.3"),
        ("Chess Moves", "checkerboard.rectangle"),
        ("Report Card", "checkmark.seal.fill"),
    ]
    var body: some View {
        let p = Theme.palette(scheme)
        ScreenScaffold(title: "Experiments") {
            SectionHeader("Labs")
            GCard(padding: 0) {
                VStack(spacing: 0) {
                    ForEach(items.indices, id: \.self) { i in
                        HStack(spacing: Space.md) {
                            Image(systemName: items[i].1).foregroundStyle(p.accent).frame(width: 24)
                            Text(items[i].0).foregroundStyle(p.textPrimary)
                            Spacer()
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(p.textMuted)
                        }
                        .padding(.horizontal, Space.lg).padding(.vertical, Space.md)
                        if i < items.count - 1 { Divider().overlay(p.cardBorder) }
                    }
                }
            }
            ComingSoon(phase: "Phase E", note: "The Hunt + Wire come first; Chess/Race/Bulls/Options need new mobile endpoints, then go native.")
        }
        .grqChrome()
    }
}

struct MoreScreen: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: NextTheme
    @Environment(\.colorScheme) private var scheme
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
            PanelSection("Settings") {
                GCard(padding: 0) {
                    VStack(spacing: 0) {
                        NavigationLink { ReportsScreen() } label: { moreRow("Reports", "doc.text.fill", p) }
                        Divider().overlay(p.cardBorder)
                        Button { theme.toggle() } label: { moreRow("Dark / light", "circle.lefthalf.filled", p) }.buttonStyle(.plain)
                    }
                }
            }
            ComingSoon(phase: "Phase D (cont.)", note: "Coming next: chat, notifications, FX approvals, risk dial, kill switch, price alerts, About.")
            Button(role: .destructive) { auth.signOut() } label: {
                Text("Sign out").frame(maxWidth: .infinity)
            }
            .buttonStyle(.bordered)
        }
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
