import SwiftUI

// Reports — the EOD / weekly / change reports. List (/api/reports) → a per-day detail
// (/api/reports/day/{date}). Pushed from More.
struct ReportsScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<[ReportSummary]> = .loading

    var body: some View {
        ScreenScaffold(title: "Reports", refresh: load) {
            LoadableView(state: state, retry: load) { reports in
                let p = Theme.palette(scheme)
                if reports.isEmpty {
                    GCard { Text("No reports yet.").font(.subheadline).foregroundStyle(p.textMuted) }
                } else {
                    GCard(padding: 0) {
                        VStack(spacing: 0) {
                            ForEach(Array(reports.enumerated()), id: \.element.id) { i, r in
                                NavigationLink { ReportDetailView(date: r.dateISO, title: r.title) } label: { reportRow(r, p).padding(Space.md) }
                                if i < reports.count - 1 { Divider().overlay(p.cardBorder) }
                            }
                        }
                    }
                }
            }
        }
        .task { if case .loading = state { await load() } }
    }

    private func reportRow(_ r: ReportSummary, _ p: Palette) -> some View {
        HStack(spacing: Space.md) {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    Chip(text: r.kind, tone: .teal)
                    Text(r.dateISO).font(.caption2).foregroundStyle(p.textMuted)
                }
                Text(r.title).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary).lineLimit(2)
                if let s = r.summary, !s.isEmpty { Text(s).font(.caption).foregroundStyle(p.textMuted).lineLimit(2) }
            }
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(p.textMuted)
        }
        .contentShape(Rectangle())
    }

    private func load() async { state = .loaded(await APIClient.shared.reports()) }
}

struct ReportDetailView: View {
    let date: String
    let title: String
    @Environment(\.colorScheme) private var scheme
    @State private var state: Loadable<ReportDetail> = .loading

    var body: some View {
        ScrollView {
            LoadableView(state: state, retry: load) { d in
                let p = Theme.palette(scheme)
                VStack(alignment: .leading, spacing: Space.md) {
                    Text(d.title).font(.title3.weight(.bold)).foregroundStyle(p.textPrimary)
                    Text(d.dateISO).font(.caption).foregroundStyle(p.textMuted)
                    GCard { MD(d.bodyMarkdown) }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
        .task { if case .loading = state { await load() } }
    }

    private func load() async {
        if let d = await APIClient.shared.reportForDay(date) { state = .loaded(d) }
        else { state = .failed("Couldn’t load this report.") }
    }
}
