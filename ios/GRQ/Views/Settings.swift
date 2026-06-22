import SwiftUI

// MORE — the fund's controls + the long tail: profile, the risk dial, the (real,
// Face-ID-gated) kill switch, the soak gate, Reports, About, theme, sign out.
struct MoreView: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var theme: ThemeManager
    @Environment(\.colorScheme) private var scheme
    @State private var settings: FundSettings?
    @State private var killOn = false
    @State private var showKillConfirm = false
    @State private var busy = false
    @State private var note: String?

    private var isMember: Bool { auth.currentUser?.role == .member }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(alignment: .top) {
                        ScreenHeader(title: "More", subtitle: "controls & the fund")
                        ChatButton()
                    }
                    memberCard
                    if let s = settings {
                        riskCard(s)
                        if isMember { killCard }
                        soakCard(s)
                    } else {
                        ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 20)
                    }
                    NavigationLink { NotificationSettingsView() } label: { linkRow("Notifications", "bell.fill") }
                    NavigationLink { ReportsView() } label: { linkRow("Reports", "doc.text.fill") }
                    NavigationLink { AboutView() } label: { linkRow("About GRQ", "info.circle.fill") }
                    themeCard
                    if let note { Text(note).font(.caption).foregroundStyle(Theme.palette(scheme).accentText) }
                    signOutButton
                }
                .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 32)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
        }
        .task {
            let s = await APIClient.shared.settings()
            settings = s
            killOn = s?.killSwitch ?? false
        }
        .alert(killOn ? "Resume trading?" : "Halt all trading now?", isPresented: $showKillConfirm) {
            Button(killOn ? "Resume trading" : "Engage", role: killOn ? .cancel : .destructive) { Task { await toggleKill() } }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text(killOn ? "The order gate opens again." : "Nothing trades until a member turns it back on.")
        }
    }

    private func linkRow(_ title: String, _ icon: String) -> some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack {
                Image(systemName: icon).foregroundStyle(p.accent)
                Text(title).foregroundStyle(p.textPrimary)
                Spacer()
                Image(systemName: "chevron.right").font(.caption).foregroundStyle(p.textMuted.opacity(0.5))
            }
        }
    }

    private var memberCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            HStack(spacing: 12) {
                MemberAvatar(email: auth.currentUser?.email ?? "", size: 44)
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
                            value: "\(Fmt.money(s.feeSpentMonthCents)) / \(Fmt.money(s.feeBudgetCentsMonth))", term: "fee-budget")
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
                        .labelsHidden().tint(p.neg).disabled(busy)
                }
                Text(killOn
                     ? "Kill switch ENGAGED. Nothing trades until a member releases it."
                     : "Halt all trading instantly. Either member can flip it.")
                    .font(.caption).foregroundStyle(killOn ? p.neg : p.textMuted)
                Text("Confirm it's you (Face ID) before changing the fund.")
                    .font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
            }
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
            Text("Sign out").frame(maxWidth: .infinity)
        }
        .padding(.top, 4)
    }

    private func toggleKill() async {
        guard !busy else { return }
        let target = !killOn
        guard await BiometricGate.confirm(target ? "Confirm it's you to HALT trading." : "Confirm it's you to resume trading.") else { return }
        busy = true
        let res = await APIClient.shared.setKillSwitch(target)
        if res.ok { killOn = target; note = target ? "Trading halted." : "Trading resumed." }
        else { note = res.error }
        busy = false
    }
}

// MARK: - Reports (A10)

struct ReportsView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var reports: [ReportSummary] = []
    @State private var loaded = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if !loaded {
                    ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(40)
                } else if reports.isEmpty {
                    EmptyState(title: "No reports yet", message: "Daily and weekly write-ups land here as the agent files them.")
                } else {
                    ForEach(reports) { r in
                        Card {
                            VStack(alignment: .leading, spacing: 4) {
                                HStack {
                                    Chip(text: r.kind, tone: .dim)
                                    Text(r.dateISO).font(.caption2).foregroundStyle(Theme.palette(scheme).textMuted)
                                    Spacer()
                                }
                                Text(r.title).font(.subheadline.weight(.semibold)).foregroundStyle(Theme.palette(scheme).textPrimary)
                                if let s = r.summary { Text(s).font(.caption).foregroundStyle(Theme.palette(scheme).textMuted).lineLimit(3) }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Reports")
        .navigationBarTitleDisplayMode(.inline)
        .task { reports = await APIClient.shared.reports(); loaded = true }
    }
}

// MARK: - About

struct AboutView: View {
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let p = Theme.palette(scheme)
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                BrandLogo(height: 34)
                Text("Get rich quick, slowly, with receipts.").font(.callout.italic()).foregroundStyle(p.textMuted)
                Text("An autonomous, Claude-powered investing fund for Cam & Graham. A trading agent manages a real brokerage account within hard, code-enforced guardrails. The agent proposes; the deterministic gate disposes. Nothing trades while the kill switch is on, and real money never trades until the soak gate passes.")
                    .font(.callout).foregroundStyle(p.textPrimary.opacity(0.9))
                HStack(spacing: 16) {
                    member("Cam", "cam"); member("Graham", "graham")
                }
            }
            .padding(20)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("About")
        .navigationBarTitleDisplayMode(.inline)
    }
    private func member(_ name: String, _ asset: String) -> some View {
        VStack(spacing: 6) {
            Image(asset).resizable().scaledToFill().frame(width: 64, height: 64).clipShape(Circle())
                .overlay(Circle().strokeBorder(Theme.palette(scheme).accent.opacity(0.3), lineWidth: 1))
            Text(name).font(.caption.weight(.semibold)).foregroundStyle(Theme.palette(scheme).textPrimary)
        }
    }
}

// MARK: - Notification settings (per-user push toggles — D53)

struct NotificationSettingsView: View {
    @Environment(\.colorScheme) private var scheme
    @State private var prefs = NotificationPreferences()
    @State private var loaded = false
    @State private var note: String?

    private let alwaysOn: [(String, String)] = [
        ("Trades", "Every buy, sell, stop, and take-profit fill."),
        ("Risk & safety", "Kill switch, drawdown halt, and daily-loss pause."),
        ("Critical outages", "Agent crashes and total data-feed failures."),
    ]

    var body: some View {
        let p = Theme.palette(scheme)
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("What pings your phone. Per-person — you and Graham each set your own.")
                    .font(.caption).foregroundStyle(p.textMuted)

                if !loaded {
                    ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 30)
                } else {
                    ForEach(Array(NotificationPreferences.catalog.enumerated()), id: \.offset) { _, c in
                        toggleCard(c.label, c.desc, c.key, c.apiKey)
                    }
                    alwaysOnCard
                    if let note { Text(note).font(.caption).foregroundStyle(p.accentText) }
                }
            }
            .padding(16)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Notifications")
        .navigationBarTitleDisplayMode(.inline)
        .task {
            if let fetched = await APIClient.shared.notificationPreferences() { prefs = fetched }
            loaded = true
        }
    }

    private func toggleCard(_ label: String, _ desc: String, _ kp: WritableKeyPath<NotificationPreferences, Bool>, _ apiKey: String) -> some View {
        let p = Theme.palette(scheme)
        let binding = Binding(get: { prefs[keyPath: kp] }, set: { update(kp, apiKey, $0) })
        return Card {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    Text(desc).font(.caption).foregroundStyle(p.textMuted)
                }
                Spacer(minLength: 8)
                Toggle("", isOn: binding).labelsHidden().tint(p.accent)
            }
        }
    }

    private var alwaysOnCard: some View {
        let p = Theme.palette(scheme)
        return Card {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Text("Always on").font(.caption.weight(.bold)).foregroundStyle(p.textMuted)
                    Text("can't be turned off")
                        .font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
                        .padding(.horizontal, 8).padding(.vertical, 2)
                        .overlay(Capsule().strokeBorder(p.cardBorder, lineWidth: 1))
                }
                ForEach(alwaysOn, id: \.0) { item in
                    HStack(alignment: .top, spacing: 6) {
                        Text("●").font(.caption2).foregroundStyle(p.accent.opacity(0.7))
                        Text("**\(item.0)** — \(item.1)").font(.caption).foregroundStyle(p.textMuted)
                    }
                }
            }
        }
    }

    private func update(_ kp: WritableKeyPath<NotificationPreferences, Bool>, _ apiKey: String, _ value: Bool) {
        let prev = prefs
        prefs[keyPath: kp] = value
        note = nil
        Task {
            if let saved = await APIClient.shared.updateNotificationPreferences([apiKey: value]) {
                prefs = saved
            } else {
                prefs = prev
                note = "Couldn't save — check your connection and try again."
            }
        }
    }
}

// MARK: - Member avatar (headshot by email)

struct MemberAvatar: View {
    @Environment(\.colorScheme) private var scheme
    let email: String
    var size: CGFloat = 44
    var body: some View {
        let p = Theme.palette(scheme)
        Group {
            if email.hasPrefix("cameron") { Image("cam").resizable().scaledToFill() }
            else if email.hasPrefix("g.j.appleby") { Image("graham").resizable().scaledToFill() }
            else {
                Circle().fill(Theme.brandGradient).overlay(
                    Text(String((email.first.map(String.init) ?? "?")).uppercased())
                        .font(.headline.weight(.black)).foregroundStyle(Color.black.opacity(0.8)))
            }
        }
        .frame(width: size, height: size).clipShape(Circle())
        .overlay(Circle().strokeBorder(p.accent.opacity(0.25), lineWidth: 1))
    }
}
