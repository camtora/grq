import SwiftUI

struct SplashView: View {
    var done: () -> Void
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @State private var showWelcome = false
    @State private var hintPulse = false

    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            p.bodyBg.ignoresSafeArea()

            // Full-page money rain — keeps falling until tapped.
            if reduceMotion {
                Text("💵").font(.system(size: 96)).opacity(0.25)
            } else {
                MoneyRainView().ignoresSafeArea()
            }

            // Soft scrim so the wordmark + greeting stay legible over the rain.
            RadialGradient(colors: [p.bodyBg.opacity(0.88), p.bodyBg.opacity(0.0)],
                           center: .center, startRadius: 6, endRadius: 280)
                .ignoresSafeArea()
                .opacity(showWelcome ? 1 : 0)
                .animation(.easeOut(duration: 0.6), value: showWelcome)

            VStack(spacing: 14) {
                Text("GRQ")
                    .font(.system(size: 78, weight: .black, design: .rounded))
                    .foregroundStyle(Theme.brandGradient)
                    .shadow(color: .black.opacity(0.3), radius: 10, y: 2)
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

            // Tap hint — pulses to show the splash is dismissed by tapping.
            VStack {
                Spacer()
                if showWelcome {
                    Text("Tap to continue")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(p.textMuted)
                        .opacity(hintPulse ? 1 : 0.35)
                        .padding(.bottom, 44)
                        .transition(.opacity)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture { done() }       // stays up until tapped
        .task {
            try? await Task.sleep(nanoseconds: 800_000_000)
            withAnimation(.easeOut(duration: 0.5)) { showWelcome = true }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) {
                hintPulse = true
            }
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

/// Full-page "make it rain": ~46 bills in two depth layers (near = big/opaque,
/// far = small/faint), spanning edge to edge, tumbling continuously. Swap 💵 for an
/// asset by drawing an Image instead of Text in the Canvas.
private struct MoneyRainView: View {
    private struct Bill {
        let x: CGFloat, size: CGFloat
        let speed: Double, offset: Double, sway: Double, spin: Double, phase: Double, opacity: Double
    }
    @State private var bills: [Bill] = (0..<46).map { _ in
        let near = Bool.random()
        return Bill(
            x: .random(in: -0.05...1.05),
            size: near ? .random(in: 30...52) : .random(in: 16...28),
            speed: near ? .random(in: 0.16...0.30) : .random(in: 0.10...0.18),
            offset: .random(in: 0...1.3),
            sway: .random(in: 0.5...1.7),
            spin: .random(in: 0.5...2.0),
            phase: .random(in: 0...6.28),
            opacity: near ? 1.0 : 0.6)
    }
    @State private var start = Date()

    var body: some View {
        TimelineView(.animation) { tl in
            Canvas { ctx, size in
                let t = tl.date.timeIntervalSince(start)
                for b in bills {
                    let cycle = (t * b.speed + b.offset).truncatingRemainder(dividingBy: 1.3)
                    let py = CGFloat(cycle) * (size.height + 120) - 60
                    let px = b.x * size.width + CGFloat(sin(t * b.sway + b.phase)) * 22
                    var c = ctx
                    c.opacity = b.opacity
                    c.translateBy(x: px, y: py)
                    c.rotate(by: .degrees(sin(t * b.spin + b.phase) * 40))
                    c.draw(Text("💵").font(.system(size: b.size)), at: .zero)
                }
            }
        }
    }
}
