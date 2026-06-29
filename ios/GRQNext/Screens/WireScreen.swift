import SwiftUI

// The Wire — the woven discovery feed (D): finds, dossiers, member watches, articles, and
// glossary lessons in one scroll. Reads /api/wire. Stock cards push the dossier; articles
// open the source; lesson terms pop the glossary.
struct WireScreen: View {
    @EnvironmentObject private var glossary: NextGlossary
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<WireResponse> = .loading

    var body: some View {
        ScreenScaffold(title: "The Wire", refresh: load) {
            LoadableView(state: state, retry: load) { resp in
                let p = Theme.palette(scheme)
                if resp.items.isEmpty {
                    GCard { Text("Nothing on the wire yet.").font(.subheadline).foregroundStyle(p.textMuted) }
                } else {
                    VStack(spacing: Space.md) { ForEach(resp.items) { card($0, p) } }
                }
            }
        }
        .task { if case .loading = state { await load() } }
    }

    @ViewBuilder private func card(_ w: WireItem, _ p: Palette) -> some View {
        switch w.kind {
        case .find, .dossier: stockCard(w, p)
        case .watch: watchCard(w, p)
        case .article: articleCard(w, p)
        case .lesson: lessonCard(w, p)
        }
    }

    // find / dossier — a stock lead
    private func stockCard(_ w: WireItem, _ p: Palette) -> some View {
        NavigationLink { StockDetailView(symbol: w.symbol ?? "") } label: {
            GCard {
                VStack(alignment: .leading, spacing: Space.sm) {
                    HStack(spacing: Space.sm) {
                        CompanyLogo(symbol: w.symbol ?? "?", url: w.logoUrl, size: 34)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(w.symbol ?? "").font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary)
                            if let n = w.name { Text(n).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1) }
                        }
                        Spacer()
                        Chip(text: w.kind == .find ? "find" : "dossier", tone: .dim)
                    }
                    if let bullets = w.bullets, !bullets.isEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            ForEach(bullets.prefix(3), id: \.self) { b in
                                HStack(alignment: .firstTextBaseline, spacing: 6) {
                                    Text("•").foregroundStyle(p.accent)
                                    Text(b).font(.caption).foregroundStyle(p.textPrimary.opacity(0.85))
                                }
                            }
                        }
                    } else if let blurb = w.blurb {
                        Text(blurb).font(.caption).foregroundStyle(p.textPrimary.opacity(0.85)).lineLimit(3)
                    }
                    HStack(spacing: Space.sm) {
                        if let h = w.heat { Text("HEAT \(h)").font(.caption2.weight(.bold)).foregroundStyle(Theme.heatColor(Double(h))) }
                        if let far = w.farBps { Text("\(Fmt.bps(far, digits: 0)) 12-mo").font(.caption2).monospacedDigit().foregroundStyle(far >= 0 ? p.pos : p.neg) }
                        if let c = w.confidence { Text("· conv \(c)").font(.caption2).foregroundStyle(p.textMuted) }
                        Spacer()
                        if let tag = w.tag { Text(tag).font(.caption2).foregroundStyle(p.textMuted) }
                    }
                }
            }
        }
        .buttonStyle(.plain)
    }

    // watch — member attribution
    private func watchCard(_ w: WireItem, _ p: Palette) -> some View {
        NavigationLink { StockDetailView(symbol: w.symbol ?? "") } label: {
            GCard {
                HStack(spacing: Space.md) {
                    if let k = w.watcherKey { Image(k).resizable().scaledToFill().frame(width: 34, height: 34).clipShape(Circle()) }
                    else { CompanyLogo(symbol: w.symbol ?? "?", url: w.logoUrl, size: 34) }
                    VStack(alignment: .leading, spacing: 1) {
                        Text("\(w.watcher ?? "A member") is watching \(w.symbol ?? "")").font(.subheadline).foregroundStyle(p.textPrimary)
                        if let n = w.name { Text(n).font(.caption2).foregroundStyle(p.textMuted).lineLimit(1) }
                    }
                    Spacer()
                    Image(systemName: "star.fill").foregroundStyle(p.accent)
                }
            }
        }
        .buttonStyle(.plain)
    }

    // article — a news headline
    private func articleCard(_ w: WireItem, _ p: Palette) -> some View {
        Link(destination: URL(string: w.url ?? "https://grq.camerontora.ca") ?? URL(string: "https://grq.camerontora.ca")!) {
            GCard {
                VStack(alignment: .leading, spacing: Space.sm) {
                    if let img = w.imageUrl, let u = URL(string: img) {
                        AsyncImage(url: u) { phase in
                            if let i = phase.image { i.resizable().scaledToFill() } else { Rectangle().fill(p.cardHi) }
                        }
                        .frame(maxWidth: .infinity).frame(height: 140).clipped()
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    Text(w.title ?? "").font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary).lineLimit(3)
                    HStack {
                        Text(w.publisher ?? "").font(.caption2).foregroundStyle(p.textMuted)
                        Spacer()
                        Text(DateFmt.relative(w.at)).font(.caption2).foregroundStyle(p.textMuted)
                    }
                    if let tickers = w.relatedTickers, !tickers.isEmpty {
                        HStack(spacing: 6) { ForEach(tickers.prefix(4), id: \.self) { Chip(text: $0, tone: .teal) } }
                    }
                }
            }
        }
    }

    // lesson — a glossary term
    private func lessonCard(_ w: WireItem, _ p: Palette) -> some View {
        GCard {
            VStack(alignment: .leading, spacing: Space.sm) {
                HStack(spacing: 6) { Image(systemName: "graduationcap.fill").foregroundStyle(p.accent); Text(w.lessonTerm ?? "Lesson").font(.subheadline.weight(.bold)).foregroundStyle(p.textPrimary) }
                if let b = w.lessonBody { Text(b).font(.caption).foregroundStyle(p.textPrimary.opacity(0.85)) }
                if let ex = w.lessonExample { Text(ex).font(.caption2.italic()).foregroundStyle(p.textMuted) }
                if let rel = w.lessonRelated, !rel.isEmpty {
                    HStack(spacing: 6) {
                        ForEach(rel) { t in
                            Button { glossary.present(GlossaryEntry(slug: t.slug, term: t.term, def: t.def)) } label: { Chip(text: t.term, tone: .dim) }
                        }
                    }
                }
            }
        }
    }

    private func load() async {
        if let r = await APIClient.shared.wire() { state = .loaded(r) }
        else { state = .failed("Couldn’t load the wire. Pull to retry.") }
    }
}
