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
                Text("GRQ")
                    .font(.system(size: 72, weight: .black, design: .rounded))
                    .foregroundStyle(Theme.brandGradient)
                    .shadow(color: Theme.brandAccent.opacity(0.4), radius: 18, y: 6)
                Text(Strings.shared.s("brand.tagline", "Get rich quick, slowly, with receipts."))
                    .font(.subheadline).foregroundStyle(p.textMuted).multilineTextAlignment(.center)
                Spacer()
                Text(Strings.shared.s("auth.signInSubtitle", "GRQ is invite-only — Cam & Graham."))
                    .font(.footnote).foregroundStyle(p.textMuted)
                VStack(spacing: 12) {
                    Button("Continue as Cam") { auth.signIn("cameron.tora@gmail.com") }
                        .buttonStyle(GradientButtonStyle())
                    Button("Continue as Graham") { auth.signIn("g.j.appleby@gmail.com") }
                        .buttonStyle(GradientButtonStyle())
                }
                Text("Mock sign-in — Google + JWT land with the backend.")
                    .font(.caption2).foregroundStyle(p.textMuted.opacity(0.6))
                Spacer().frame(height: 20)
            }
            .padding(28)
        }
    }
}
