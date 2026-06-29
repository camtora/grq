import SwiftUI

// Splash + sign-in for GRQ Next. Auth itself is the shared AuthManager (Google → GRQ-JWT →
// Keychain → Bearer); these are just the rebuilt faces of it.

struct SplashScreen: View {
    @Environment(\.colorScheme) private var scheme
    let done: () -> Void
    @State private var shown = false

    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            ScreenBackground().ignoresSafeArea()
            VStack(spacing: Space.md) {
                BrandMark(height: 64)
                    .shadow(color: Theme.brandAccent.opacity(0.4), radius: 18, y: 6)
                Text(Strings.shared.s("brand.tagline", "Get rich quick, slowly, with receipts."))
                    .font(.subheadline).foregroundStyle(p.textMuted)
                    .multilineTextAlignment(.center)
            }
            .opacity(shown ? 1 : 0)
            .scaleEffect(shown ? 1 : 0.96)
        }
        .task {
            withAnimation(.easeOut(duration: 0.5)) { shown = true }
            try? await Task.sleep(for: .seconds(1.1))
            done()
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
