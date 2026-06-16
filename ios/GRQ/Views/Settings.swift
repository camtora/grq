import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.colorScheme) private var scheme
    @State private var killOn = false
    @State private var showKillConfirm = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    riskCard
                    themeCard
                    killCard
                    membersCard
                    signOut
                }
                .padding(16)
            }
            .navigationTitle("Settings")
        }
    }

    private var riskCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack {
                Text("Risk dial").foregroundStyle(p.textPrimary)
                Spacer()
                Chip(text: "Balanced", tone: .teal)
            }
            .font(.subheadline)
        }
    }

    private var themeCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack {
                Text("Theme").foregroundStyle(p.textPrimary)
                Spacer()
                Button("Cam · light") { theme.colorScheme = .light }
                    .foregroundStyle(scheme == .light ? p.accent : p.textMuted)
                Button("Graham · dark") { theme.colorScheme = .dark }
                    .foregroundStyle(scheme == .dark ? p.accent : p.textMuted)
            }
            .font(.subheadline)
        }
    }

    private var killCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    TermLink(slug: "kill-switch", label: "Kill switch").font(.subheadline.weight(.bold))
                    Spacer()
                    Toggle("", isOn: Binding(get: { killOn }, set: { _ in showKillConfirm = true }))
                        .labelsHidden().tint(p.neg)
                }
                Text(killOn
                     ? Strings.shared.s("guardrails.killEngaged", "Kill switch ENGAGED. Nothing trades until a member releases it.")
                     : "Halt all trading instantly. Either member can flip it.")
                    .font(.caption)
                    .foregroundStyle(killOn ? p.neg : p.textMuted)
            }
        }
        .alert(killOn ? "Resume trading?" : "Halt all trading now?", isPresented: $showKillConfirm) {
            Button(killOn ? "Resume trading" : "Engage",
                   role: killOn ? .cancel : .destructive) { killOn.toggle() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(killOn ? "The order gate opens again."
                        : "Nothing trades until a member turns it back on.")
        }
    }

    private var membersCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack {
                Text("Members").foregroundStyle(p.textMuted)
                Spacer()
                Text("Cam · Graham").foregroundStyle(p.textPrimary)
            }
            .font(.subheadline)
        }
    }

    private var signOut: some View {
        Button(role: .destructive) { auth.signOut() } label: {
            Text(Strings.shared.s("auth.signOut", "Sign out")).frame(maxWidth: .infinity)
        }
        .padding(.top, 8)
    }
}
