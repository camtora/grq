import SwiftUI

// Splash + sign-in for GRQ Next. Auth itself is the shared AuthManager (Google → GRQ-JWT →
// Keychain → Bearer); these are just the rebuilt faces of it.

/// The keeper from the original app (Cam's favourite): full-page money rain you TAP to
/// enter. Tap → cross-fade to the wealth-aware greeting (money keeps falling) → it slides
/// into the app after a beat; a second tap skips the wait. Re-shown on every foreground
/// by RootView.
struct SplashScreen: View {
    var done: () -> Void
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.colorScheme) private var scheme
    @State private var phase: Phase = .intro
    @State private var hintPulse = false
    @State private var dismissed = false

    private enum Phase { case intro, welcome }

    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            p.bodyBg.ignoresSafeArea()

            if reduceMotion {
                Text("💵").font(.system(size: 96)).opacity(0.25)
            } else {
                MoneyRainView().ignoresSafeArea()
            }

            RadialGradient(colors: [p.bodyBg.opacity(0.88), p.bodyBg.opacity(0.0)], center: .center, startRadius: 6, endRadius: 280)
                .ignoresSafeArea()
                .opacity(phase == .welcome ? 1 : 0)
                .animation(.easeOut(duration: 0.6), value: phase)

            VStack(spacing: 16) {
                BrandMark(height: 60).shadow(color: .black.opacity(0.3), radius: 10, y: 2)
                if phase == .intro {
                    Text("Tap to continue")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(p.textMuted)
                        .opacity(hintPulse ? 1 : 0.35)
                        .transition(.opacity)
                } else {
                    welcomeContent.transition(.opacity)
                }
            }
            .padding(32)

            VStack {
                Spacer()
                if phase == .intro {
                    VStack(spacing: 8) {
                        HStack(spacing: -12) { memberAvatar("cam"); memberAvatar("graham") }
                        Text("Created by\nCam & Graham")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(p.textMuted)
                            .multilineTextAlignment(.center)
                    }
                    .padding(.bottom, 44)
                    .transition(.opacity)
                }
            }
        }
        .contentShape(Rectangle())
        .onTapGesture {
            if phase == .intro {
                withAnimation(.easeInOut(duration: 0.5)) { phase = .welcome }
                Task { try? await Task.sleep(for: .seconds(1.4)); finish() }
            } else {
                finish()
            }
        }
        .onAppear {
            withAnimation(.easeInOut(duration: 1.1).repeatForever(autoreverses: true)) { hintPulse = true }
        }
    }

    private func finish() {
        guard !dismissed else { return }
        dismissed = true
        done()
    }

    private var welcomeContent: some View {
        let p = Theme.palette(scheme)
        return VStack(spacing: 8) {
            Text(welcomeLine).font(.title3.weight(.semibold)).foregroundStyle(p.textPrimary).multilineTextAlignment(.center)
            Text(Strings.shared.s("splash.subtitle", "Rich quick, slowly.")).font(.subheadline).foregroundStyle(p.textMuted)
        }
    }

    private func memberAvatar(_ key: String) -> some View {
        let p = Theme.palette(scheme)
        return Image(key).resizable().scaledToFill()
            .frame(width: 46, height: 46)
            .clipShape(Circle())
            .overlay(Circle().strokeBorder(p.bodyBg, lineWidth: 2.5))
            .overlay(Circle().strokeBorder(p.accent.opacity(0.45), lineWidth: 1))
    }

    private var welcomeLine: String {
        if let u = auth.currentUser, let name = u.name {
            return Content.shared.greeting(name: name, totalPnlCents: u.totalPnlCents, contributionsCents: u.contributionsCents)
        }
        return Strings.shared.s("splash.welcomeFallback", "Welcome back.")
    }
}

/// Full-page "make it rain": ~46 bills in two depth layers, tumbling continuously.
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

struct SignInScreen: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            ScreenBackground().ignoresSafeArea()
            VStack(spacing: Space.lg) {
                Spacer()
                BrandMark(height: 56)
                    .shadow(color: Theme.brandAccent.opacity(0.4), radius: 18, y: 6)
                Text(Strings.shared.s("brand.tagline", "Get rich quick, slowly, with receipts."))
                    .font(.subheadline).foregroundStyle(p.textMuted).multilineTextAlignment(.center)
                Spacer()
                Text(Strings.shared.s("auth.signInSubtitle", "GRQ is invite-only — Cam & Graham."))
                    .font(.footnote).foregroundStyle(p.textMuted)
                Button {
                    Task { await auth.signInWithGoogle() }
                } label: {
                    if auth.signingIn { ProgressView().tint(Color(hex: "04110d")) }
                    else { Text("Sign in with Google") }
                }
                .buttonStyle(GradientButtonStyle())
                .disabled(auth.signingIn)

                if let err = auth.authError {
                    Text(err).font(.caption2).foregroundStyle(p.neg)
                        .multilineTextAlignment(.center)
                } else {
                    Text("Bearer-JWT sessions, signed by the GRQ backend.")
                        .font(.caption2).foregroundStyle(p.textMuted.opacity(0.6))
                }
                Spacer().frame(height: 20)
            }
            .padding(28)
        }
    }
}
