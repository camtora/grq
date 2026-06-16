import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.colorScheme) private var scheme
    @State private var settings: FundSettings?
    @State private var killOn = false
    @State private var showKillConfirm = false

    var body: some View {
        NavigationStack {
            GRQScreen(title: "Settings", subtitle: "risk dial & controls") {
                memberCard
                if let s = settings {
                    riskCard(s)
                    killCard
                    soakCard(s)
                } else {
                    ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 20)
                }
                themeCard
                signOutButton
            }
        }
        .task {
            let s = await APIClient.shared.settings()
            settings = s
            killOn = s?.killSwitch ?? false
        }
    }

    private var memberCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack(spacing: 12) {
                Circle().fill(Theme.brandGradient).frame(width: 44, height: 44)
                    .overlay(Text(String((auth.currentUser?.name ?? "?").prefix(1)))
                        .font(.headline.weight(.black)).foregroundStyle(Color.black.opacity(0.8)))
                VStack(alignment: .leading, spacing: 2) {
                    Text(auth.currentUser?.name ?? "Member").font(.headline).foregroundStyle(p.textPrimary)
                    Text(auth.currentUser?.email ?? "").font(.caption).foregroundStyle(p.textMuted)
                }
                Spacer()
                Chip(text: auth.currentUser?.role.rawValue ?? "member", tone: .teal)
            }
        }
    }

    private func riskCard(_ s: FundSettings) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Risk dial").font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                    Spacer()
                    Chip(text: s.riskLevel.label, tone: .teal)
                }
                KeyValueRow(label: "Cash floor", value: Fmt.pctBps(s.cashFloorBps), term: "cash-floor")
                KeyValueRow(label: "Max position", value: Fmt.pctBps(s.maxPositionBps), term: "weight")
                KeyValueRow(label: "Stop-loss", value: Fmt.pctBps(s.stopLossBps), term: "stop-loss")
                KeyValueRow(label: "Take-profit", value: Fmt.pctBps(s.takeProfitBps), term: "take-profit")
                Divider().overlay(p.cardBorder)
                KeyValueRow(label: "Fees this month",
                            value: "\(Fmt.money(s.feeSpentMonthCents)) / \(Fmt.money(s.feeBudgetCentsMonth))",
                            term: "fee-budget")
            }
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
                    .font(.caption).foregroundStyle(killOn ? p.neg : p.textMuted)
                Text(Strings.shared.s("guardrails.faceIdReason", "Confirm it's you before changing the fund."))
                    .font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
            }
        }
        .alert(killOn ? "Resume trading?" : "Halt all trading now?", isPresented: $showKillConfirm) {
            Button(killOn ? "Resume trading" : "Engage", role: killOn ? .cancel : .destructive) { killOn.toggle() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(killOn ? "The order gate opens again." : "Nothing trades until a member turns it back on.")
        }
    }

    private func soakCard(_ s: FundSettings) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                TermLink(slug: "soak", label: "Soak").font(.subheadline.weight(.bold))
                KeyValueRow(label: "Clean (total)", value: "\(s.soakDaysClean) / \(s.soakDaysRequired) days")
                KeyValueRow(label: "On IBKR paper", value: "\(s.soakPaperDaysClean) / \(s.soakPaperDaysRequired) days")
                Text("Real money never trades until the soak gate passes.")
                    .font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
            }
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

    private var signOutButton: some View {
        Button(role: .destructive) { auth.signOut() } label: {
            Text(Strings.shared.s("auth.signOut", "Sign out")).frame(maxWidth: .infinity)
        }
        .padding(.top, 4)
    }
}
