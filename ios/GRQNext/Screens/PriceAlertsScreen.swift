import SwiftUI

// Price alerts (The Wire Phase 2) — "ping me when X crosses $Y". The personal manager list
// (all my alerts, delete) + a reusable sheet to set one on a stock. /api/notifications/price-alerts.

struct PriceAlertsScreen: View {
    @Environment(\.colorScheme) private var scheme
    @State private var alerts: [PriceAlert] = []
    @State private var loaded = false

    var body: some View {
        let p = Theme.palette(scheme)
        ScrollView {
            VStack(alignment: .leading, spacing: Space.md) {
                if loaded && alerts.isEmpty {
                    ContentUnavailableView("No price alerts", systemImage: "bell.badge",
                        description: Text("Set one from any stock’s page — GRQ pings you when it crosses your level."))
                        .padding(.top, 60)
                } else {
                    ForEach(alerts) { a in row(a, p) }
                }
            }
            .padding(Space.lg)
        }
        .background(ScreenBackground().ignoresSafeArea())
        .navigationTitle("Price alerts")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func row(_ a: PriceAlert, _ p: Palette) -> some View {
        GCard {
            HStack(spacing: Space.md) {
                CompanyLogo(symbol: a.symbol, url: nil, size: 30)
                VStack(alignment: .leading, spacing: 1) {
                    Text(a.symbol).font(.subheadline.weight(.semibold)).foregroundStyle(p.textPrimary)
                    Text("\(a.direction == "above" ? "Above" : "Below") \(Fmt.money(a.thresholdCents, a.currency))")
                        .font(.caption).monospacedDigit().foregroundStyle(p.textMuted)
                }
                Spacer()
                if !a.active { Chip(text: "fired", tone: .dim) }
                Button(role: .destructive) { Task { await delete(a.id) } } label: {
                    Image(systemName: "trash").foregroundStyle(p.neg)
                }
            }
        }
    }

    private func delete(_ id: Int) async {
        _ = await APIClient.shared.deletePriceAlert(id: id)
        await load()
    }
    private func load() async {
        alerts = await APIClient.shared.priceAlerts()
        loaded = true
    }
}

/// Set a price alert on one stock — presented as a sheet from the dossier.
struct SetPriceAlertSheet: View {
    let symbol: String
    let currency: String
    var lastCents: Int? = nil
    @Environment(\.colorScheme) private var scheme
    @Environment(\.dismiss) private var dismiss
    @State private var direction = "above"
    @State private var priceText = ""
    @State private var note = ""
    @State private var busy = false
    @State private var err: String?

    var body: some View {
        let p = Theme.palette(scheme)
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: Space.lg) {
                    Picker("Direction", selection: $direction) {
                        Text("Rises above").tag("above")
                        Text("Falls below").tag("below")
                    }
                    .pickerStyle(.segmented)

                    GCard {
                        HStack {
                            Text(currency.uppercased() == "USD" ? "US$" : "$").foregroundStyle(p.textMuted)
                            TextField(lastCents.map { Fmt.money($0, currency).replacingOccurrences(of: "$", with: "").replacingOccurrences(of: "US", with: "") } ?? "0.00", text: $priceText)
                                .keyboardType(.decimalPad)
                                .font(.title3.monospacedDigit())
                                .foregroundStyle(p.textPrimary)
                        }
                    }
                    GCard { TextField("Note (optional)", text: $note).foregroundStyle(p.textPrimary) }

                    if let err { Text(err).font(.caption).foregroundStyle(p.neg) }

                    Button { Task { await save() } } label: {
                        Text(busy ? "Setting…" : "Set alert")
                    }
                    .buttonStyle(GradientButtonStyle())
                    .disabled(busy || cents == nil)
                }
                .padding(Space.lg)
            }
            .background(ScreenBackground().ignoresSafeArea())
            .navigationTitle("Alert · \(symbol)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarTrailing) { Button("Cancel") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }

    private var cents: Int? {
        let v = Double(priceText.trimmingCharacters(in: .whitespaces))
        guard let v, v > 0 else { return nil }
        return Int((v * 100).rounded())
    }

    private func save() async {
        guard let c = cents else { return }
        busy = true; err = nil; defer { busy = false }
        let r = await APIClient.shared.createPriceAlert(symbol: symbol, direction: direction, thresholdCents: c, currency: currency, note: note.isEmpty ? nil : note)
        switch r {
        case .success: dismiss()
        case .failure(let m): err = m
        }
    }
}
