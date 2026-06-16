import SwiftUI

struct SplashView: View {
    var done: () -> Void
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @State private var showWelcome = false

    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            p.bodyBg.ignoresSafeArea()
            if !reduceMotion {
                MoneyRainView()
                    .ignoresSafeArea()
                    .opacity(showWelcome ? 0.3 : 1)
                    .animation(.easeOut(duration: 0.6), value: showWelcome)
            }
            VStack(spacing: 12) {
                Text("GRQ")
                    .font(.system(size: 68, weight: .black, design: .rounded))
                    .foregroundStyle(Theme.brandGradient)
                if showWelcome {
                    Text(welcomeLine)
                        .font(.title3.weight(.semibold))
                        .foregroundStyle(p.textPrimary)
                        .multilineTextAlignment(.center)
                        .transition(.opacity)
                    Text(Strings.shared.s("splash.subtitle", "Rich quick, slowly."))
                        .font(.subheadline)
                        .foregroundStyle(p.textMuted)
                        .transition(.opacity)
                }
            }
            .padding(32)
        }
        .task {
            try? await Task.sleep(nanoseconds: 900_000_000)
            withAnimation(.easeOut(duration: 0.5)) { showWelcome = true }
            try? await Task.sleep(nanoseconds: 1_300_000_000)
            done()
        }
    }

    private var welcomeLine: String {
        if let u = auth.currentUser, let name = u.name {
            return Content.shared.greeting(name: name,
                                           totalPnlCents: u.totalPnlCents,
                                           contributionsCents: u.contributionsCents)
        }
        return Strings.shared.s("splash.welcomeFallback", "Welcome back.")
    }
}

/// "Make it rain" — bills fall + tumble via a Canvas. Swap 💵 for an asset later.
private struct MoneyRainView: View {
    private struct Bill {
        let x: CGFloat, size: CGFloat
        let speed: Double, offset: Double, sway: Double, spin: Double, phase: Double
    }
    @State private var bills: [Bill] = (0..<26).map { _ in
        Bill(x: .random(in: 0...1), size: .random(in: 22...40),
             speed: .random(in: 0.12...0.26), offset: .random(in: 0...1.2),
             sway: .random(in: 0.6...1.6), spin: .random(in: 0.6...1.8),
             phase: .random(in: 0...6.28))
    }
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { tl in
            Canvas { ctx, size in
                let t = tl.date.timeIntervalSince(start)
                for b in bills {
                    let cycle = (t * b.speed + b.offset).truncatingRemainder(dividingBy: 1.2)
                    let py = CGFloat(cycle) * (size.height + 80) - 40
                    let px = b.x * size.width + CGFloat(sin(t * b.sway + b.phase)) * 18
                    var c = ctx
                    c.translateBy(x: px, y: py)
                    c.rotate(by: .degrees(sin(t * b.spin + b.phase) * 35))
                    c.draw(Text("💵").font(.system(size: b.size)), at: .zero)
                }
            }
        }
    }
}
