import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var auth: AuthManager
    @Environment(\.colorScheme) private var scheme

    var body: some View {
        let p = Theme.palette(scheme)
        ZStack {
            p.bodyBg.ignoresSafeArea()
            VStack(spacing: 16) {
                Spacer()
                Text("GRQ")
                    .font(.system(size: 56, weight: .black, design: .rounded))
                    .foregroundStyle(Theme.brandGradient)
                Text(Strings.shared.s("auth.signInTitle", "Sign in to your fund."))
                    .font(.title3.weight(.semibold)).foregroundStyle(p.textPrimary)
                Text(Strings.shared.s("auth.signInSubtitle", "GRQ is invite-only — Cam & Graham."))
                    .font(.subheadline).foregroundStyle(p.textMuted)
                    .multilineTextAlignment(.center)
                Spacer()
                Text("Mock sign-in — pick a member (no Google SDK yet)")
                    .font(.caption).foregroundStyle(p.textMuted.opacity(0.7))
                HStack(spacing: 12) {
                    memberButton("Cam", "cameron.tora@gmail.com", p)
                    memberButton("Graham", "g.j.appleby@gmail.com", p)
                }
                Spacer().frame(height: 40)
            }
            .padding(28)
        }
    }

    private func memberButton(_ name: String, _ email: String, _ p: Palette) -> some View {
        Button { auth.signIn(email) } label: {
            Text(name).font(.headline)
                .frame(maxWidth: .infinity).padding(.vertical, 14)
                .background(RoundedRectangle(cornerRadius: 14).fill(p.accent.opacity(0.15)))
                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(p.cardBorder))
                .foregroundStyle(p.accent)
        }
    }
}
