import SwiftUI

// Settings — member fund controls: the risk dial + the kill switch (Face-ID gated). Reads
// /api/fund-settings; writes /api/settings (risk) and /api/killswitch. Members only.
struct SettingsScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<FundSettings> = .loading
    @State private var busy = false
    @State private var err: String?

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { s in content(s) }
                .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
        .refreshable { await load() }
    }

    private func content(_ s: FundSettings) -> some View {
        let p = Theme.palette(scheme)
        return VStack(alignment: .leading, spacing: Space.lg) {
            if let err { Text(err).font(.caption).foregroundStyle(p.neg) }

            PanelSection("Risk dial") {
                GCard {
                    VStack(alignment: .leading, spacing: Space.sm) {
                        Picker("Risk", selection: Binding(
                            get: { s.riskLevel },
                            set: { newVal in Task { await setRisk(newVal) } }
                        )) {
                            Text("Cautious").tag(RiskLevel.CAUTIOUS)
                            Text("Balanced").tag(RiskLevel.BALANCED)
                            Text("Aggressive").tag(RiskLevel.AGGRESSIVE)
                        }
                        .pickerStyle(.segmented)
                        .disabled(busy)
                        Text("Sets position size, cash floor, stops, and trade pace. Humans-only; the §6 order gate is unchanged.")
                            .font(.caption2).foregroundStyle(p.textMuted)
                    }
                }
            }

            PanelSection("Kill switch") {
                GCard {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(s.killSwitch ? "Trading halted" : "Trading live")
                                .font(.subheadline.weight(.semibold))
                                .foregroundStyle(s.killSwitch ? p.neg : p.pos)
                            if s.killSwitch, let by = s.killSwitchBy {
                                Text("halted by \(by)").font(.caption2).foregroundStyle(p.textMuted)
                            } else {
                                Text("Nothing trades while engaged. Face ID required.").font(.caption2).foregroundStyle(p.textMuted)
                            }
                        }
                        Spacer()
                        Button(s.killSwitch ? "Resume" : "Halt") { Task { await toggleKill(!s.killSwitch) } }
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(s.killSwitch ? p.pos : p.neg)
                            .padding(.horizontal, Space.md).padding(.vertical, 8)
                            .background((s.killSwitch ? p.pos : p.neg).opacity(0.12), in: Capsule())
                            .disabled(busy)
                    }
                }
            }

            PanelSection("More") {
                GCard(padding: 0) {
                    VStack(spacing: 0) {
                        NavigationLink { FxScreen() } label: { row("Currency & FX", "dollarsign.arrow.circlepath", p) }
                        Divider().overlay(p.cardBorder)
                        NavigationLink { PriceAlertsScreen() } label: { row("Price alerts", "bell.badge", p) }
                    }
                }
            }
        }
    }

    private func row(_ title: String, _ icon: String, _ p: Palette) -> some View {
        HStack(spacing: Space.md) {
            Image(systemName: icon).foregroundStyle(p.accent).frame(width: 24)
            Text(title).foregroundStyle(p.textPrimary)
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(p.textMuted)
        }
        .padding(.horizontal, Space.lg).padding(.vertical, Space.md)
        .contentShape(Rectangle())
    }

    private func setRisk(_ level: RiskLevel) async {
        busy = true; err = nil; defer { busy = false }
        let r = await APIClient.shared.setRisk(level.rawValue)
        if case .failure(let m) = r { err = m }
        await load()
    }

    private func toggleKill(_ engage: Bool) async {
        guard await BiometricGate.confirm(engage ? "Halt all trading" : "Resume trading") else { return }
        busy = true; err = nil; defer { busy = false }
        let r = await APIClient.shared.setKillSwitch(engage)
        if case .failure(let m) = r { err = m }
        await load()
    }

    private func load() async {
        if let s = await APIClient.shared.settings() { state = .loaded(s) }
        else { state = .failed("Couldn’t load settings. Pull to retry.") }
    }
}
