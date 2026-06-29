import SwiftUI

// Phase E placeholders for the experiments that need a NEW mobile endpoint before they can
// go native (Chess Moves · Second Opinions · Bull Race · Options Desk · Report Card). Each
// is replaced by its real screen as the endpoint ships. Hunt + Wire are already native.

private struct LabStub: View {
    @Environment(\.colorScheme) private var scheme
    let title: String
    let blurb: String
    var body: some View {
        let p = Theme.palette(scheme)
        ScrollView {
            VStack(alignment: .leading, spacing: Space.md) {
                Chip(text: "coming soon", tone: .dim)
                Text(blurb).font(.subheadline).foregroundStyle(p.textMuted)
                Text("This experiment is live on the web; the native screen lands once its mobile endpoint ships.")
                    .font(.caption).foregroundStyle(p.textMuted)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }
}

struct RaceScreen: View { var body: some View { LabStub(title: "Second Opinions", blurb: "Shadow models grade the fund’s real calls — no separate book.") } }
struct BullsScreen: View { var body: some View { LabStub(title: "Bull Race", blurb: "Each model runs its own $50k paper book; standings over time.") } }
struct OptionsDeskScreen: View { var body: some View { LabStub(title: "Options Desk", blurb: "Stock-only vs stock+options, same book — which compounds better.") } }
struct ReportCardScreen: View { var body: some View { LabStub(title: "Report Card", blurb: "How GRQ’s calls actually did — scored against what happened.") } }
