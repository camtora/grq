import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            ScreenBackground().ignoresSafeArea()
            VStack(spacing: 18) {
                Spacer()
                BrandLogo(height: 56)
                    .shadow(color: Theme.brandAccent.opacity(0.4), radius: 18, y: 6)
                Text(Strings.shared.s("brand.tagline", "Get rich quick, slowly, with receipts."))
                    .font(.subheadline).foregroundStyle(p.textMuted).multilineTextAlignment(.center)
                Spacer()
                Text(Strings.shared.s("auth.signInSubtitle", "GRQ is invite-only — Cam & Graham."))
                    .font(.footnote).foregroundStyle(p.textMuted)
                VStack(spacing: 12) {
                    Button("Sign in with Google") { Task { await auth.signInWithGoogle() } }
                        .buttonStyle(GradientButtonStyle())
                        .disabled(auth.signingIn)
                    // Dev logins — work only against a server with GRQ_DEV_LOGIN=1.
                    HStack(spacing: 12) {
                        Button("Dev · Cam") { auth.signIn("cameron.tora@gmail.com") }
                        Button("Dev · Graham") { auth.signIn("g.j.appleby@gmail.com") }
                    }
                    .font(.footnote).foregroundStyle(p.accent).disabled(auth.signingIn)
                }
                if let err = auth.authError {
                    Text(err).font(.caption2).foregroundStyle(p.neg)
                        .multilineTextAlignment(.center).padding(.horizontal)
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
