import SwiftUI

// Messages — the two-person Cam↔Graham thread (D61): plain DMs + shares (a message with a
// symbol, optionally deep-linking a dossier panel). Reads/writes /api/messages. Members only.
struct MessagesScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var messages: [DirectMessage] = []
    @State private var draft = ""
    @State private var loaded = false
    @State private var sending = false

    var body: some View {
        let p = Theme.palette(scheme)
        VStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: Space.sm) {
                        if loaded && messages.isEmpty {
                            Text("No messages yet. Say hi, or share a stock from its page.")
                                .font(.subheadline).foregroundStyle(p.textMuted).padding(.top, 40)
                        }
                        ForEach(messages) { m in bubble(m, p).id(m.id) }
                    }
                    .padding(Space.lg)
                }
                .onChange(of: messages.count) { _, _ in
                    if let last = messages.last { withAnimation { proxy.scrollTo(last.id, anchor: .bottom) } }
                }
            }
            composer(p)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Messages")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func bubble(_ m: DirectMessage, _ p: Palette) -> some View {
        let mine = m.mine
        return HStack {
            if mine { Spacer(minLength: 40) }
            VStack(alignment: .leading, spacing: 4) {
                if !mine { Text(m.fromName).font(.caption2.weight(.semibold)).foregroundStyle(p.textMuted) }
                if !m.body.isEmpty { Text(m.body).foregroundStyle(mine ? Color(hex: "04110d") : p.textPrimary) }
                if let sym = m.symbol {
                    NavigationLink { StockDetailView(symbol: sym, scrollTo: m.panel) } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "chart.line.uptrend.xyaxis")
                            Text(sym).fontWeight(.semibold)
                            if let pl = m.panelLabel { Text("· \(pl)").font(.caption) }
                        }
                        .font(.caption)
                        .padding(.horizontal, 8).padding(.vertical, 5)
                        .background((mine ? Color(hex: "04110d").opacity(0.12) : p.accent.opacity(0.14)), in: Capsule())
                        .foregroundStyle(mine ? Color(hex: "04110d") : p.accent)
                    }
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
            TextField("Message…", text: $draft, axis: .vertical)
                .lineLimit(1...4)
                .padding(.horizontal, Space.md).padding(.vertical, Space.sm)
                .background(p.cardBg, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).strokeBorder(p.cardBorder))
            Button { Task { await send() } } label: {
                Image(systemName: "arrow.up.circle.fill").font(.title2).foregroundStyle(p.accent)
            }
            .disabled(sending || draft.trimmingCharacters(in: .whitespaces).isEmpty)
        }
        .padding(Space.md)
        .background(.bar)
    }

    private func send() async {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        sending = true; draft = ""
        _ = await APIClient.shared.sendMessage(body: text)
        await load()
        sending = false
    }

    private func load() async {
        if let t = await APIClient.shared.directMessages() { messages = t.messages }
        loaded = true
    }
}
