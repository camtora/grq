import SwiftUI

// Agent chat — read-only brain you can ask anything (it reads everything, trades
// nothing). Streams the reply token-by-token (SSE via URLSession.bytes). Members-only
// (the parent surfaces it only for members). Mirrors web components/ChatClient.tsx.
struct ChatView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss

    var symbol: String? = nil

    @State private var messages: [ChatMessage] = []
    @State private var draft = ""
    @State private var pending: String?
    @State private var status: String?
    @State private var busy = false

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 14) {
                            if messages.isEmpty && pending == nil {
                                Text("Ask the agent anything — a stock, the portfolio, \u{201C}defend this position\u{201D}. It can read everything and trade nothing.")
                                    .font(.subheadline).foregroundStyle(Theme.palette(scheme).textMuted)
                                    .frame(maxWidth: .infinity).padding(.top, 40)
                            }
                            ForEach(messages) { m in bubble(role: m.role, email: m.email, text: m.content) }
                            if let pending {
                                bubble(role: "assistant", email: "agent", text: pending.isEmpty ? (status ?? "thinking…") : pending)
                            }
                            Color.clear.frame(height: 1).id("bottom")
                        }
                        .padding(16)
                    }
                    .onChange(of: messages.count) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
                    .onChange(of: pending) { _, _ in withAnimation { proxy.scrollTo("bottom", anchor: .bottom) } }
                }
                composer
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle(symbol.map { "Chat · \($0)" } ?? "GRQ Chat")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Done") { dismiss() } } }
        }
        .task {
            if let t = await APIClient.shared.chatHistory() { messages = t.messages }
            if let symbol, draft.isEmpty { draft = "Let's talk about \(symbol). " }
        }
    }

    private var composer: some View {
        let p = Theme.palette(scheme)
        return HStack(alignment: .bottom, spacing: 8) {
            TextField(busy ? "GRQ is thinking…" : "Message the agent", text: $draft, axis: .vertical)
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

    private func bubble(role: String, email: String, text: String) -> some View {
        let p = Theme.palette(scheme)
        let mine = role == "user"
        let who = authorName(email)
        return HStack {
            if mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 6) {
                HStack(spacing: 6) {
                    ChatAvatar(email: email).frame(width: 20, height: 20)
                    Text(mine ? "You" : who).font(.caption2.weight(.bold)).tracking(0.5).foregroundStyle(p.textMuted)
                }
                MarkdownText(text: text)
            }
            .padding(12)
            .background(RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(mine ? p.accent.opacity(0.12) : p.cardBg))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(p.cardBorder, lineWidth: 1))
            if !mine { Spacer(minLength: 40) }
        }
    }

    private func authorName(_ email: String) -> String {
        if email == "me" { return auth.currentUser?.name ?? "You" }
        if email.hasPrefix("cameron") { return "Cam" }
        if email.hasPrefix("g.j.appleby") { return "Graham" }
        if email == "agent" { return "GRQ" }
        return email
    }

    @MainActor
    private func send() async {
        let message = draft.trimmingCharacters(in: .whitespaces)
        guard !message.isEmpty, !busy else { return }
        draft = ""; busy = true; pending = ""; status = nil
        messages.append(ChatMessage(id: .string("u-\(Date().timeIntervalSince1970)"), email: "me", role: "user", content: message))
        var finalText = ""
        do {
            // The byte stream resumes off the main actor, so hop UI writes to main.
            try await APIClient.shared.chatStream(message: message, symbol: symbol, owner: nil,
                onText: { acc in finalText = acc; DispatchQueue.main.async { pending = acc } },
                onStatus: { s in DispatchQueue.main.async { status = s } })
            if !finalText.isEmpty {
                messages.append(ChatMessage(id: .string("a-\(Date().timeIntervalSince1970)"), email: "agent", role: "assistant", content: finalText))
            }
        } catch {
            messages.append(ChatMessage(id: .string("e-\(Date().timeIntervalSince1970)"), email: "agent", role: "assistant",
                                        content: "⚠️ Chat failed: \(error.localizedDescription)"))
        }
        pending = nil; status = nil; busy = false
    }
}

/// Opens the global chat sheet from anywhere. Provided at the tab root; the sheet is
/// presented once there, so any screen can drop a `ChatButton()` in its header.
final class ChatLauncher: ObservableObject {
    @Published var show = false
}

/// Top-right chat entry for every screen's header (members only). Mirrors the web's
/// nav "Chat" button so chat isn't only reachable via a stock's "Ask GRQ".
struct ChatButton: View {
    @EnvironmentObject private var auth: AuthManager
    @EnvironmentObject private var chat: ChatLauncher
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        if auth.currentUser?.role == .member {
            Button { chat.show = true } label: {
                Image(systemName: "bubble.left.and.bubble.right.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Theme.palette(scheme).accent)
                    .padding(9)
                    .background(Circle().fill(Theme.palette(scheme).accent.opacity(0.12)))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Chat with GRQ")
        }
    }
}

/// A member's headshot for a chat bubble, or the GRQ/initial chip.
struct ChatAvatar: View {
    @Environment(\.colorScheme) private var scheme
    let email: String
    var body: some View {
        let p = Theme.palette(scheme)
        Group {
            if email.hasPrefix("cameron") { Image("cam").resizable().scaledToFill() }
            else if email.hasPrefix("g.j.appleby") { Image("graham").resizable().scaledToFill() }
            else {
                Text(email == "agent" ? "G" : String(email.prefix(1)).uppercased())
                    .font(.caption2.weight(.black)).foregroundStyle(Theme.brandGradient)
            }
        }
        .background(Circle().fill(p.accent.opacity(0.14)))
        .clipShape(Circle())
    }
}
