import AuthenticationServices
import SwiftUI

private struct AppleSignInButton: UIViewRepresentable {
    let isEnabled: Bool
    let onTap: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap)
    }

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: .signIn, style: .black)
        button.cornerRadius = 12
        button.addTarget(
            context.coordinator,
            action: #selector(Coordinator.tapped),
            for: .touchUpInside
        )
        return button
    }

    func updateUIView(_ uiView: ASAuthorizationAppleIDButton, context: Context) {
        uiView.isEnabled = isEnabled
        context.coordinator.onTap = onTap
    }

    final class Coordinator: NSObject {
        var onTap: () -> Void

        init(onTap: @escaping () -> Void) {
            self.onTap = onTap
        }

        @objc func tapped() {
            onTap()
        }
    }
}

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var email = ""
    @State private var isSending = false
    @State private var linkSent = false
    @State private var errorMessage: String?
    @State private var tosAccepted = false
    @State private var socialLoading: SocialProvider?
    @State private var appleCoordinator = AppleSignInCoordinator()

    private enum SocialProvider {
        case apple
        case google
    }

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
            Text("Sign in to Ration")
                .rationHeadline()

            tosConsentRow

            socialButtons

            dividerLabel("or continue with email")

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
                .disabled(isSending || socialLoading != nil || !isValidEmail || !tosAccepted)
        }
    }

    private var socialButtons: some View {
        VStack(spacing: 12) {
            AppleSignInButton(isEnabled: tosAccepted && socialLoading == nil && !isSending) {
                Task { await signInWithApple() }
            }
            .frame(height: 50)
            .opacity(tosAccepted ? 1 : 0.5)

            Button {
                Task { await signInWithGoogle() }
            } label: {
                HStack(spacing: 10) {
                    if socialLoading == .google {
                        ProgressView()
                            .tint(Theme.carbon)
                    } else {
                        Image(systemName: "g.circle.fill")
                            .font(.system(size: 20))
                    }
                    Text("Continue with Google")
                        .font(Typography.body().weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.surface)
                .foregroundStyle(Theme.carbon)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Theme.platinum, lineWidth: 1)
                )
            }
            .disabled(!tosAccepted || socialLoading != nil || isSending)

            Text("If you use Apple here, sign in on the web with the same Apple ID.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
                .multilineTextAlignment(.center)
                .padding(.top, 4)
        }
    }

    private var tosConsentRow: some View {
        HStack(alignment: .top, spacing: 10) {
            Button {
                tosAccepted.toggle()
            } label: {
                Image(systemName: tosAccepted ? "checkmark.square.fill" : "square")
                    .foregroundStyle(tosAccepted ? Theme.hyperGreen : Theme.muted)
            }
            .accessibilityLabel("Agree to Terms of Service")

            VStack(alignment: .leading, spacing: 2) {
                Text("I agree to the")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                Link("Terms of Service", destination: AppConfig.termsURL)
                    .font(Typography.caption().weight(.semibold))
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func dividerLabel(_ text: String) -> some View {
        HStack {
            Rectangle().fill(Theme.platinum).frame(height: 1)
            Text(text).rationCaption()
            Rectangle().fill(Theme.platinum).frame(height: 1)
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

    private func signInWithApple() async {
        guard tosAccepted else { return }
        errorMessage = nil
        env.auth.clearAuthError()
        socialLoading = .apple
        defer { socialLoading = nil }
        do {
            let result = try await appleCoordinator.signIn()
            try await env.auth.signInWithSocial(
                provider: "apple",
                idToken: result.identityToken,
                nonce: result.rawNonce,
                givenName: result.givenName,
                familyName: result.familyName,
                tosAccepted: true
            )
        } catch let error as APIError where error.code == "cancelled" {
            return
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func signInWithGoogle() async {
        guard tosAccepted else { return }
        errorMessage = nil
        env.auth.clearAuthError()
        socialLoading = .google
        defer { socialLoading = nil }
        do {
            let result = try await GoogleSignInService.signIn()
            try await env.auth.signInWithSocial(
                provider: "google",
                idToken: result.idToken,
                accessToken: result.accessToken,
                tosAccepted: true
            )
        } catch let error as APIError where error.code == "cancelled" {
            return
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
