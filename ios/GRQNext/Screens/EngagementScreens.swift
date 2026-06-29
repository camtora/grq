import SwiftUI

// Phase D — the engagement layer: the notification center (bell drawer) and Ask Alfred
// (the streaming agent chat). Members-only surfaces; reads/writes the live API.

// MARK: - Notification inbox (poller for the bell badge + drawer)

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
        let (items, unread) = await APIClient.shared.notifications()
        self.items = items
        self.unread = unread
    }
    func markRead() async {
        await APIClient.shared.markNotificationsRead()
        unread = 0
        await refresh()
    }
}

struct NotificationCenterView: View {
    @EnvironmentObject private var notifs: NotificationsInbox
    @EnvironmentObject private var glossary: NextGlossary
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        let p = Theme.palette(scheme)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.sm) {
                    if notifs.items.isEmpty {
                        ContentUnavailableView("No notifications", systemImage: "bell.slash", description: Text("Trades, risk, finds, and reports land here."))
                            .padding(.top, 60)
                    } else {
                        ForEach(notifs.items) { n in
                            if let s = n.symbol {
                                NavigationLink { StockDetailView(symbol: s, scrollTo: n.panel) } label: { card(n, p, tappable: true) }
                                    .buttonStyle(.plain)
                            } else {
                                card(n, p, tappable: false)
                            }
                        }
                    }
                }
                .padding(Space.lg)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Mark read") { Task { await notifs.markRead() } } }
                ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } }
            }
        }
        .task { await notifs.refresh() }
    }

    private func card(_ n: NotificationItem, _ p: Palette, tappable: Bool) -> some View {
        GCard {
            HStack(alignment: .top, spacing: Space.md) {
                Circle().fill(severityColor(n.severity, p)).frame(width: 8, height: 8).padding(.top, 5)
                VStack(alignment: .leading, spacing: 3) {
                    HStack {
                        Text(n.title).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                        Spacer()
                        if !n.read { Circle().fill(p.accent).frame(width: 7, height: 7) }
                    }
                    Text(n.body).font(.caption).foregroundStyle(p.textMuted).lineLimit(4)
                    HStack(spacing: 6) {
                        Chip(text: n.category, tone: .dim)
                        Text(DateFmt.relative(n.at)).font(.caption2).foregroundStyle(p.textMuted)
                        if tappable { Spacer(); Image(systemName: "chevron.right").font(.caption2).foregroundStyle(p.textMuted) }
                    }
                }
            }
        }
    }

    private func severityColor(_ s: String, _ p: Palette) -> Color {
        switch s.lowercased() { case "critical": return p.neg; case "warning": return Theme.hot(scheme); default: return p.accent }
    }
}

// MARK: - Ask Alfred (streaming agent chat)

@MainActor
final class ChatModel: ObservableObject {
    @Published var messages: [ChatMessage] = []
    @Published var draft = ""
    @Published var streaming = false
    @Published var status: String? = nil
    let symbol: String?
    private let owner: String?

    init(symbol: String?, owner: String?) { self.symbol = symbol; self.owner = owner }

    func loadHistory() async {
        if let thread = await APIClient.shared.chatHistory(owner: owner) { messages = thread.messages }
    }

    func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !streaming else { return }
        draft = ""
        messages.append(ChatMessage(id: .string("local-\(messages.count)"), email: owner ?? "me", role: "user", content: text))
        let replyIdx = messages.count
        messages.append(ChatMessage(id: .string("reply-\(replyIdx)"), email: "alfred", role: "assistant", content: ""))
        streaming = true; status = "thinking…"
        do {
            try await APIClient.shared.chatStream(message: text, symbol: symbol, owner: owner,
                onText: { [weak self] acc in
                    guard let self else { return }
                    self.messages[replyIdx] = ChatMessage(id: .string("reply-\(replyIdx)"), email: "alfred", role: "assistant", content: acc)
                },
                onStatus: { [weak self] s in self?.status = s })
        } catch {
            messages[replyIdx] = ChatMessage(id: .string("reply-\(replyIdx)"), email: "alfred", role: "assistant", content: "⚠️ Couldn’t reach Alfred. Try again.")
        }
        streaming = false; status = nil
    }
}

struct AgentChatScreen: View {
    let symbol: String?
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @StateObject private var model: ChatModel

    init(symbol: String?) {
        self.symbol = symbol
        _model = StateObject(wrappedValue: ChatModel(symbol: symbol, owner: nil))
    }

    var body: some View {
        let p = Theme.palette(scheme)
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        VStack(alignment: .leading, spacing: Space.md) {
                            if model.messages.isEmpty {
                                Text(symbol == nil ? "Ask Alfred anything about the fund, a name, or the market." : "Ask Alfred about \(symbol!).")
                                    .font(.subheadline).foregroundStyle(p.textMuted).padding(.top, 40)
                            }
                            ForEach(model.messages) { m in bubble(m, p).id(m.id.stringValue) }
                            if let s = model.status {
                                HStack(spacing: 6) { ProgressView().controlSize(.small).tint(p.accent); Text(s).font(.caption).foregroundStyle(p.textMuted) }
                            }
                        }
                        .padding(Space.lg)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .onChange(of: model.messages.count) { _, _ in
                        if let last = model.messages.last { withAnimation { proxy.scrollTo(last.id.stringValue, anchor: .bottom) } }
                    }
                }
                composer(p)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle(symbol == nil ? "Ask Alfred" : "Ask Alfred · \(symbol!)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .task { await model.loadHistory() }
    }

    private func bubble(_ m: ChatMessage, _ p: Palette) -> some View {
        let mine = m.role == "user"
        return HStack {
            if mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 2) {
                if m.content.isEmpty && !mine {
                    ProgressView().controlSize(.small).tint(p.accent)
                } else if mine {
                    Text(m.content).foregroundStyle(Color(hex: "04110d"))
                } else {
                    MD(m.content)
                }
            }
            .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
            .background(mine ? AnyShapeStyle(p.accent) : AnyShapeStyle(p.cardBg), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(mine ? nil : RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(p.cardBorder))
            if !mine { Spacer(minLength: 40) }
        }
    }

    private func composer(_ p: Palette) -> some View {
        HStack(spacing: Space.sm) {
            TextField("Message Alfred…", text: $model.draft, axis: .vertical)
                .lineLimit(1...4)
                .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
                .background(p.cardBg, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(p.cardBorder))
            Button { Task { await model.send() } } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(p.accent)
            }
            .disabled(model.streaming || model.draft.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(Space.md)
        .background(.bar)
    }
}
