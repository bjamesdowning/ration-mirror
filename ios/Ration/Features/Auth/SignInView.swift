import SwiftUI

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var email = ""
    @State private var isSending = false
    @State private var linkSent = false
    @State private var errorMessage: String?

    var body: some View {
        ZStack {
            Theme.ceramic.ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                VStack(spacing: 8) {
                    Image(systemName: "circle.hexagongrid.fill")
                        .font(.system(size: 48))
                        .foregroundStyle(Theme.hyperGreen)
                    Text("RATION").rationDisplay()
                    Text("Orbital supply chain").rationCaption()
                }

                if linkSent {
                    sentState
                } else {
                    formState
                }

                Spacer()
                Spacer()
            }
            .padding(24)
        }
    }

    private var formState: some View {
        VStack(spacing: 16) {
            Text("Sign in with a magic link")
                .rationHeadline()

            TextField("you@example.com", text: $email)
                .font(Typography.body())
                .textInputAutocapitalization(.never)
                .keyboardType(.emailAddress)
                .autocorrectionDisabled()
                .padding(14)
                .background(Theme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Theme.platinum, lineWidth: 1)
                )

            if let visibleError {
                ErrorBanner(message: visibleError)
            }

            Button("Send magic link") { Task { await sendLink() } }
                .buttonStyle(PrimaryButtonStyle(isLoading: isSending))
                .disabled(isSending || !isValidEmail)
        }
    }

    private var sentState: some View {
        GlassCard {
            VStack(spacing: 12) {
                Image(systemName: "envelope.badge")
                    .font(.system(size: 32))
                    .foregroundStyle(Theme.hyperGreen)
                Text("Check your inbox").rationHeadline()
                Text("Tap the link in the email we sent to \(email). It opens Ration and signs you in.")
                    .rationCaption()
                    .multilineTextAlignment(.center)
                if let visibleError {
                    ErrorBanner(message: visibleError)
                }
                Button("Use a different email") {
                    env.auth.clearAuthError()
                    linkSent = false
                    email = ""
                }
                .buttonStyle(SecondaryButtonStyle())
            }
        }
    }

    private var isValidEmail: Bool {
        email.contains("@") && email.contains(".")
    }

    private var visibleError: String? {
        errorMessage ?? env.auth.authErrorMessage
    }

    private func sendLink() async {
        errorMessage = nil
        env.auth.clearAuthError()
        isSending = true
        defer { isSending = false }
        do {
            try await env.auth.requestMagicLink(email: email.trimmingCharacters(in: .whitespaces))
            linkSent = true
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
