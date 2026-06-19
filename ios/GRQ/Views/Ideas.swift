import SwiftUI

// THE HUNT — the heart of the app. A vertically scrollable feed of under-the-radar
// leads ("a scrollable Instagram of stocks"): big 12-mo upside, conviction, an
// obscurity badge, the dossier narrative. Leads, not verdicts — no Buy/Hold/Sell on
// the card face (mirrors web components/IdeaCard.tsx `discovery`). Members can steer
// it with a plain-English brief, refresh it, watch ♥ or dismiss ✕ a find.
struct HuntView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var finds: [HuntFind] = []
    @State private var brief: String?
    @State private var loaded = false
    @State private var briefDraft = ""
    @State private var queuedNote: String?

    private var isMember: Bool { auth.currentUser?.role == .member }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    header
                    if isMember { huntBar }
                    if let brief, !brief.isEmpty { directedBanner(brief) }
                    if let queuedNote { note(queuedNote) }

                    if !loaded {
                        ProgressView().tint(Theme.brandAccent).frame(maxWidth: .infinity).padding(.vertical, 60)
                    } else if finds.isEmpty {
                        EmptyState(title: "The hunt is quiet",
                                   message: "No leads on the board yet. Pull to refresh, or brief the agent on what to look for.")
                    } else {
                        ForEach(finds) { f in
                            HuntCard(find: f, isMember: isMember,
                                     onWatch: { Task { await watch(f) } },
                                     onDismiss: { Task { await dismiss(f) } })
                        }
                    }

                    Text("The agent can't trade these itself — nothing trades outside the guardrailed universe. Targets are hypotheses, not promises.")
                        .font(.caption2).foregroundStyle(Theme.palette(scheme).textMuted.opacity(0.7))
                        .padding(.top, 4)
                }
                .padding(.horizontal, 16).padding(.top, 6).padding(.bottom, 32)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .toolbar(.hidden, for: .navigationBar)
            .refreshable { await load() }
        }
        .task { if !loaded { await load() } }
    }

    // MARK: header + controls

    private var header: some View {
        let p = Theme.palette(scheme)
        return HStack(alignment: .center) {
            VStack(alignment: .leading, spacing: 2) {
                Text("THE HUNT").font(.caption2.weight(.bold)).tracking(1.6).foregroundStyle(p.textMuted)
                Text("Leads from the deep")
                    .font(.system(size: 30, weight: .black, design: .rounded))
                    .foregroundStyle(Theme.brandGradient)
            }
            Spacer()
            if isMember {
                Button { Task { await refresh(nil) } } label: {
                    Image(systemName: "arrow.clockwise")
                        .font(.headline).foregroundStyle(p.accent)
                        .padding(10).background(Circle().fill(p.accent.opacity(0.12)))
                }
                .buttonStyle(.plain)
            }
            ChatButton()
        }
        .padding(.top, 4)
    }

    private var huntBar: some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 8) {
            Image(systemName: "scope").foregroundStyle(p.textMuted)
            TextField("Brief the hunt — e.g. \"emerging medical names before trial data\"", text: $briefDraft)
                .font(.subheadline).foregroundStyle(p.textPrimary)
                .submitLabel(.search)
                .onSubmit { Task { await refresh(briefDraft) } }
            if !briefDraft.isEmpty {
                Button { Task { await refresh(briefDraft) } } label: {
                    Text("Go").font(.caption.weight(.bold))
                        .padding(.horizontal, 10).padding(.vertical, 5)
                        .background(Capsule().fill(p.accent.opacity(0.15))).foregroundStyle(p.accent)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.cardBg))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
    }

    private func directedBanner(_ b: String) -> some View {
        let p = Theme.palette(scheme)
        return HStack(alignment: .top, spacing: 8) {
            Text("🎯")
            VStack(alignment: .leading, spacing: 2) {
                Text("Directed hunt").font(.caption2.weight(.bold)).foregroundStyle(p.accentText)
                Text(b).font(.caption).foregroundStyle(p.textPrimary)
                Text("focused results below — refresh ↻ to go broad again").font(.caption2).foregroundStyle(p.textMuted.opacity(0.7))
            }
            Spacer()
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.accent.opacity(0.06)))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(p.accent.opacity(0.25), lineWidth: 1))
    }

    private func note(_ t: String) -> some View {
        Text(t).font(.caption).foregroundStyle(Theme.palette(scheme).accentText)
    }

    // MARK: data + actions

    private func load() async {
        if let r = await APIClient.shared.hunt() {
            finds = r.finds
            brief = r.brief
        }
        loaded = true
    }

    private func refresh(_ b: String?) async {
        queuedNote = nil
        switch await APIClient.shared.refreshHunt(brief: b) {
        case .success:
            briefDraft = ""
            brief = (b?.isEmpty == false) ? b : nil
            queuedNote = "Hunt queued — the agent runs it on its next tick; pull to refresh shortly."
        case .failure(let m):
            queuedNote = m
        }
    }

    private func watch(_ f: HuntFind) async {
        guard isMember else { return }
        let res = await APIClient.shared.watch(f.sym, name: f.name)
        if res.ok, let i = finds.firstIndex(where: { $0.sym == f.sym }) {
            finds[i].watch = "watching"
        } else if let m = res.error { queuedNote = m }
    }

    private func dismiss(_ f: HuntFind) async {
        guard isMember else { return }
        let res = await APIClient.shared.universeAction(f.sym, "dismiss", extra: ["name": f.name])
        if res.ok {
            finds.removeAll { $0.sym == f.sym }
        } else if let m = res.error { queuedNote = m }
    }
}

// MARK: - Hunt card (the big "stock post")

struct HuntCard: View {
    @Environment(\.colorScheme) private var scheme
    let find: HuntFind
    let isMember: Bool
    let onWatch: () -> Void
    let onDismiss: () -> Void

    var body: some View {
        let p = Theme.palette(scheme)
        Card {
            VStack(alignment: .leading, spacing: 12) {
                // Identity row
                HStack(spacing: 12) {
                    StockLogo(symbol: find.sym, url: find.logoUrl, size: 44)
                    VStack(alignment: .leading, spacing: 2) {
                        NavigationLink { StockDetailView(symbol: find.sym) } label: {
                            Text(find.sym).font(.title3.weight(.black)).foregroundStyle(p.textPrimary)
                        }.buttonStyle(.plain)
                        Text(find.name).font(.caption).foregroundStyle(p.textMuted).lineLimit(1)
                    }
                    Spacer()
                    if let label = find.obscurityLabel {
                        Text(label).font(.caption2.weight(.semibold))
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(Capsule().fill(Color(hex: "f59e0b").opacity(0.12)))
                            .foregroundStyle(scheme == .dark ? Color(hex: "fcd34d") : Color(hex: "b45309"))
                    }
                }

                // The headline: upside + conviction
                HStack(alignment: .bottom, spacing: 16) {
                    if let far = find.farBps {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(Fmt.pct0(far))
                                .font(.system(size: 34, weight: .black, design: .rounded)).monospacedDigit()
                                .foregroundStyle(far > 0 ? p.pos : p.neg)
                            Text("12-MO UPSIDE").font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(p.textMuted)
                        }
                    } else {
                        Text("early look — no target yet").font(.subheadline).foregroundStyle(p.textMuted)
                    }
                    Spacer()
                    if let c = find.confidence {
                        VStack(alignment: .trailing, spacing: 1) {
                            Text("\(c)%").font(.title2.weight(.black)).foregroundStyle(p.accentText)
                            Text("CONVICTION").font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(p.textMuted)
                        }
                    }
                }

                if find.cur != nil || find.nearBps != nil {
                    HStack(spacing: 12) {
                        if let cur = find.cur { Text("now \(Fmt.money(cur, find.currency))") }
                        if let near = find.nearBps {
                            Text("near \(Fmt.pct0(near))").foregroundStyle(near > 0 ? p.pos : p.neg)
                        }
                    }
                    .font(.caption).foregroundStyle(p.textMuted)
                }

                CollapsibleMd(text: find.body, threshold: 200)

                if let sources = find.sources, !sources.isEmpty {
                    sourceChips(sources, p)
                }

                Divider().overlay(p.cardBorder.opacity(0.5))

                // Actions
                HStack(spacing: 14) {
                    NavigationLink { StockDetailView(symbol: find.sym) } label: {
                        Text("Full dossier →").font(.caption.weight(.semibold)).foregroundStyle(p.accentText)
                    }.buttonStyle(.plain)
                    Spacer()
                    if isMember {
                        if find.watch == "universe" {
                            Text("✓ universe").font(.caption.weight(.semibold)).foregroundStyle(p.pos)
                        } else if find.watch == "watching" {
                            Text("♥ watching").font(.caption.weight(.semibold)).foregroundStyle(p.accent)
                        } else {
                            Button(action: onWatch) {
                                Label("Watch", systemImage: "heart").font(.caption.weight(.bold)).foregroundStyle(p.accent)
                            }.buttonStyle(.plain)
                        }
                        Button(action: onDismiss) {
                            Image(systemName: "xmark.circle").foregroundStyle(p.textMuted)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func sourceChips(_ sources: [String], _ p: Palette) -> some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(Array(sources.prefix(8).enumerated()), id: \.offset) { _, s in
                    Text(s).font(.caption2).foregroundStyle(p.accentText.opacity(0.8))
                        .padding(.horizontal, 8).padding(.vertical, 3)
                        .background(Capsule().fill(p.accent.opacity(0.08)))
                }
            }
        }
    }
}
