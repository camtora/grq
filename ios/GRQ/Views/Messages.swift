import SwiftUI

// Member-to-member messaging (D61). The two-person fund's own Cam↔Graham thread,
// distinct from the read-only agent chat (Chat.swift). Three surfaces share it:
//   • ShareComposerSheet — share the whole page or one panel, with a comment.
//   • MemberChatPane      — the chat thread (attachments deep-link to the dossier),
//     hosted inside UnifiedChatView beside the GRQ agent chat.
//   • MessagesInbox       — the unread badge on the More tab.
// All post to /api/messages (lib/messages.ts) and push the other member.

// MARK: - Member helpers (keyed to the bundled avatar assets "cam"/"graham")

/// The signed-in member's stable key from their email, or nil if not a named member.
func grqMemberKey(for email: String?) -> String? {
    guard let email = email?.lowercased() else { return nil }
    if email.hasPrefix("cameron") { return "cam" }
    if email.hasPrefix("g.j.appleby") { return "graham" }
    return nil
}

/// In the two-person fund, the OTHER member's key — the share/message recipient.
func otherMemberKey(for email: String?) -> String? {
    switch grqMemberKey(for: email) {
    case "cam": return "graham"
    case "graham": return "cam"
    default: return nil
    }
}

func memberName(_ key: String?) -> String {
    switch key { case "cam": return "Cam"; case "graham": return "Graham"; default: return "the other member" }
}

// MARK: - Share composer

/// Drives the share composer: which panel (nil = the whole page). Identifiable so the
/// stock page can present it via `.sheet(item:)`.
struct ShareTarget: Identifiable {
    let panel: PanelKind?
    var id: String { panel?.rawValue ?? "__page" }
}

/// The other member's headshot with a small share glyph — the stock page's top-right
/// "share with <them>" button. One tap opens the composer for the whole page.
struct ShareAvatarBadge: View {
    @Environment(\.colorScheme) private var scheme
    let memberKey: String
    var body: some View {
        let p = Theme.palette(scheme)
        Image(memberKey).resizable().scaledToFill()
            .frame(width: 28, height: 28).clipShape(Circle())
            .overlay(Circle().strokeBorder(p.accent.opacity(0.35), lineWidth: 1))
            .overlay(alignment: .bottomTrailing) {
                Image(systemName: "paperplane.circle.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(p.accent)
                    .background(Circle().fill(p.bodyBg))
                    .offset(x: 3, y: 3)
            }
    }
}

/// Share a stock — the whole page or one panel — with the other member, plus an
/// optional comment. Sends a DirectMessage that pushes them and deep-links back here.
struct ShareComposerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var scheme
    @EnvironmentObject private var auth: AuthManager
    let symbol: String
    let name: String?
    let panel: PanelKind?    // nil = whole page

    @State private var comment = ""
    @State private var busy = false
    @State private var sent = false
    @State private var error: String?

    private var otherKey: String? { otherMemberKey(for: auth.currentUser?.email) }
    private var otherName: String { memberName(otherKey) }

    var body: some View {
        let p = Theme.palette(scheme)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    HStack(spacing: 12) {
                        if let k = otherKey {
                            Image(k).resizable().scaledToFill()
                                .frame(width: 44, height: 44).clipShape(Circle())
                                .overlay(Circle().strokeBorder(p.accent.opacity(0.25), lineWidth: 1))
                        }
                        VStack(alignment: .leading, spacing: 2) {
                            Text("To \(otherName)").font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                        }
                        Spacer()
                    }

                    Card {
                        HStack(spacing: 12) {
                            StockLogo(symbol: symbol, size: 40)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(name ?? symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary).lineLimit(1)
                                Text(panel.map { "\(symbol) · \($0.label)" } ?? "\(symbol) · whole page")
                                    .font(.caption2).foregroundStyle(p.accentText)
                            }
                            Spacer()
                        }
                    }

                    Card {
                        TextField("Add a comment (optional)…", text: $comment, axis: .vertical)
                            .lineLimit(2...5)
                            .font(.subheadline).foregroundStyle(p.textPrimary)
                    }

                    if let error {
                        Text(error).font(.caption).foregroundStyle(p.neg)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Button { Task { await send() } } label: {
                        HStack(spacing: 8) {
                            if busy { ProgressView().tint(Color(hex: "04110d")) }
                            Image(systemName: sent ? "checkmark" : "paperplane.fill")
                            Text(sent ? "Sent" : "Send to \(otherName)")
                                .font(.system(size: 15, weight: .bold, design: .rounded))
                        }
                        .foregroundStyle(Color(hex: "04110d"))
                        .frame(maxWidth: .infinity).padding(.vertical, 14)
                        .background(Capsule().fill(p.accent))
                    }
                    .buttonStyle(.plain)
                    .disabled(busy || sent || otherKey == nil)
                }
                .padding(16)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle(panel == nil ? "Share \(symbol)" : "Share panel")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
        }
    }

    private func send() async {
        busy = true; error = nil
        let res = await APIClient.shared.sendMessage(
            body: comment.trimmingCharacters(in: .whitespacesAndNewlines), symbol: symbol, panel: panel?.rawValue)
        busy = false
        if res.ok {
            sent = true
            try? await Task.sleep(nanoseconds: 700_000_000)
            dismiss()
        } else { error = res.error }
    }
}

// MARK: - The thread

/// Owns the unread-count badge on the More tab. Polls cheaply; reset to 0 the moment
/// the thread is opened.
@MainActor
final class MessagesInbox: ObservableObject {
    @Published var unread = 0
    private var started = false

    func start() {
        guard !started else { return }
        started = true
        Task { @MainActor in
            while !Task.isCancelled {
                unread = await APIClient.shared.unreadMessageCount()
                try? await Task.sleep(nanoseconds: 30_000_000_000) // 30s
            }
        }
    }
    func reset() { unread = 0 }
    func refresh() async { unread = await APIClient.shared.unreadMessageCount() }
}

/// The Cam↔Graham chat pane — content only (the host supplies nav chrome). Loads the
/// thread, marks it read, then polls for new messages while open. A shared stock renders
/// as a tappable card that deep-links to the dossier (scrolled to the shared panel).
struct MemberChatPane: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var inbox: MessagesInbox
    @Environment(\.colorScheme) private var scheme

    @State private var messages: [DirectMessage] = []
    @State private var draft = ""
    @State private var busy = false
    @State private var loaded = false

    private var otherName: String { memberName(otherMemberKey(for: auth.currentUser?.email)) }

    var body: some View {
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        if messages.isEmpty && loaded {
                            Text("No messages yet. Say hi to \(otherName), or share a stock from any dossier — long-press a panel to send just that part.")
                                .font(.subheadline).foregroundStyle(Theme.palette(scheme).textMuted)
                                .frame(maxWidth: .infinity).padding(.top, 40)
                        }
                        ForEach(messages) { m in bubble(m) }
                        Color.clear.frame(height: 1).id("bottom")
                    }
                    .padding(16)
                }
                .onChange(of: messages.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
            }
            composer
        }
        .task {
            if messages.isEmpty, let t = await APIClient.shared.directMessages() { messages = t.messages }
            loaded = true
            await APIClient.shared.markMessagesRead(); inbox.reset()
            // Poll for new messages while the pane is open (.task cancels on disappear).
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                if Task.isCancelled { break }
                await fetchDelta()
            }
        }
    }

    private var composer: some View {
        let p = Theme.palette(scheme)
        return HStack(alignment: .bottom, spacing: 8) {
            TextField("Message \(otherName)", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .padding(.horizontal, 12).padding(.vertical, 9)
                .background(RoundedRectangle(cornerRadius: 16, style: .continuous).fill(p.cardBg))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
                .disabled(busy)
            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up.circle.fill").font(.system(size: 30))
                    .foregroundStyle(draft.trimmingCharacters(in: .whitespaces).isEmpty || busy ? p.textMuted.opacity(0.4) : p.accent)
            }
            .disabled(busy || draft.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(12)
        .background(p.bodyBg.opacity(0.6))
    }

    private func bubble(_ m: DirectMessage) -> some View {
        let p = Theme.palette(scheme)
        let mine = m.mine
        return HStack {
            if mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    avatar(m.fromKey).frame(width: 20, height: 20)
                    Text(mine ? "You" : m.fromName).font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(p.textMuted)
                }
                if let sym = m.symbol {
                    NavigationLink { StockDetailView(symbol: sym, scrollTo: m.panel) } label: {
                        attachmentCard(sym, m.panelLabel)
                    }
                    .buttonStyle(.plain)
                }
                if !m.body.isEmpty { MarkdownText(text: m.body) }
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(mine ? p.accent.opacity(0.12) : p.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
            if !mine { Spacer(minLength: 40) }
        }
    }

    private func attachmentCard(_ symbol: String, _ panelLabel: String?) -> some View {
        let p = Theme.palette(scheme)
        return HStack(spacing: 10) {
            StockLogo(symbol: symbol, size: 34)
            VStack(alignment: .leading, spacing: 1) {
                Text(symbol).font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                Text(panelLabel ?? "Open dossier").font(.caption2).foregroundStyle(p.accentText)
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption2).foregroundStyle(p.textMuted)
        }
        .padding(10)
        .frame(minWidth: 210, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 14, style: .continuous).fill(p.accent.opacity(0.10)))
    }

    private func avatar(_ key: String?) -> some View {
        let p = Theme.palette(scheme)
        return Group {
            if key == "cam" || key == "graham" { Image(key!).resizable().scaledToFill() }
            else { Image(systemName: "person.fill").foregroundStyle(p.accent) }
        }
        .background(Circle().fill(p.accent.opacity(0.14)))
        .clipShape(Circle())
    }

    @MainActor private func fetchDelta() async {
        let since = messages.last?.id
        guard let t = await APIClient.shared.directMessages(since: since) else { return }
        let known = Set(messages.map { $0.id })
        let fresh = t.messages.filter { !known.contains($0.id) }
        guard !fresh.isEmpty else { return }
        messages.append(contentsOf: fresh)
        await APIClient.shared.markMessagesRead(); inbox.reset()
    }

    @MainActor private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !busy else { return }
        draft = ""; busy = true
        let res = await APIClient.shared.sendMessage(body: text)
        busy = false
        if res.ok { await fetchDelta() } else { draft = text }
    }
}

// MARK: - Unified chat sheet (member thread + GRQ agent, behind a switcher)

/// The one chat sheet the home chat button opens. Defaults to the member thread
/// (Cam↔Graham), with a segmented switch to the read-only GRQ agent chat (D61).
struct UnifiedChatView: View {
    enum Mode: Hashable { case member, agent }
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @State private var mode: Mode = .member

    private var memberLabel: String {
        let n = memberName(otherMemberKey(for: auth.currentUser?.email))
        return n == "the other member" ? "Member" : n
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Picker("", selection: $mode) {
                    Text(memberLabel).tag(Mode.member)
                    Text("GRQ").tag(Mode.agent)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 4)

                if mode == .member { MemberChatPane() } else { AgentChatPane() }
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle(mode == .member ? memberLabel : "GRQ Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { ChatCloseButton() } }
        }
    }
}
