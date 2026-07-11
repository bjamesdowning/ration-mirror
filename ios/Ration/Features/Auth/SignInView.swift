import AuthenticationServices
import SwiftUI

private struct AppleSignInButton: UIViewRepresentable {
    let buttonType: ASAuthorizationAppleIDButton.ButtonType
    let isEnabled: Bool
    let onTap: () -> Void

    func makeCoordinator() -> Coordinator {
        Coordinator(onTap: onTap)
    }

    func makeUIView(context: Context) -> ASAuthorizationAppleIDButton {
        let button = ASAuthorizationAppleIDButton(type: buttonType, style: .black)
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

private struct AuthModePicker: View {
    @Binding var mode: AuthFlowMode

    var body: some View {
        HStack(spacing: 4) {
            ForEach(AuthFlowMode.allCases) { option in
                Button {
                    mode = option
                } label: {
                    Text(option.pickerLabel)
                        .font(Typography.headline())
                        .foregroundStyle(mode == option ? Theme.onHyperGreen : Theme.muted)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 12)
                        .background(mode == option ? Theme.hyperGreen : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(mode == option ? .isSelected : [])
            }
        }
        .padding(4)
        .background(Theme.platinum.opacity(0.5))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Authentication mode")
    }
}

struct SignInView: View {
    @Environment(AppEnvironment.self) private var env

    @State private var mode: AuthFlowMode = .signIn
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

            ScrollView {
                VStack(spacing: 24) {
                    brandHeader
                        .padding(.top, 32)

                    if linkSent {
                        sentState
                    } else {
                        AuthModePicker(mode: $mode)
                            .onChange(of: mode) { _, _ in
                                resetFormForModeChange()
                            }

                        formState
                    }
                }
                .padding(24)
                .padding(.bottom, 16)
            }
            .scrollDismissesKeyboard(.interactively)
        }
    }

    private var brandHeader: some View {
        VStack(spacing: 8) {
            Image("RationMark")
                .resizable()
                .scaledToFit()
                .frame(width: 48, height: 48)
                .accessibilityLabel("Ration")
            Text("RATION").rationDisplay()
            Text("Orbital supply chain").rationCaption()
        }
    }

    private var formState: some View {
        GlassCard {
            VStack(spacing: 16) {
                VStack(spacing: 4) {
                    Text(mode.title)
                        .rationHeadline()
                        .frame(maxWidth: .infinity)
                    Text(mode.subtitle)
                        .rationCaption()
                        .multilineTextAlignment(.center)
                }

                socialButtons

                dividerLabel("or continue with email")

                TextField("you@example.com", text: $email)
                    .font(Typography.body())
                    .textInputAutocapitalization(.never)
                    .keyboardType(.emailAddress)
                    .autocorrectionDisabled()
                    .padding(14)
                    .background(Theme.ceramic)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(Theme.platinum, lineWidth: 1)
                    )

                if let visibleError {
                    ErrorBanner(message: visibleError)
                }

                if mode.requiresTosConsent {
                    tosConsentRow
                }

                Button(mode.magicLinkButtonTitle) { Task { await sendLink() } }
                    .buttonStyle(PrimaryButtonStyle(isLoading: isSending))
                    .disabled(isSending || socialLoading != nil || !canSubmitMagicLink)

                if mode == .signIn {
                    signInFooterHint
                } else {
                    signUpFooterLinks
                }
            }
        }
    }

    private var socialButtons: some View {
        VStack(spacing: 12) {
            AppleSignInButton(
                buttonType: mode == .signUp ? .signUp : .signIn,
                isEnabled: canProceed && socialLoading == nil && !isSending
            ) {
                Task { await signInWithApple() }
            }
            .frame(height: 50)
            .opacity(canProceed ? 1 : 0.5)
            // ASAuthorizationAppleIDButton's type is fixed at init; recreate on mode change.
            .id(mode)

            Button {
                Task { await signInWithGoogle() }
            } label: {
                HStack(spacing: 10) {
                    if socialLoading == .google {
                        ProgressView()
                            .tint(Theme.carbon)
                    } else {
                        Image(systemName: "g.circle.fill")
                            .font(Typography.heroIcon(20))
                    }
                    Text("Continue with Google")
                        .font(Typography.body().weight(.semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.ceramic)
                .foregroundStyle(Theme.carbon)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Theme.platinum, lineWidth: 1)
                )
            }
            .disabled(!canProceed || socialLoading != nil || isSending)
            .opacity(canProceed ? 1 : 0.5)
        }
    }

    private var tosConsentRow: some View {
        HStack(alignment: .top, spacing: 10) {
            Button {
                tosAccepted.toggle()
            } label: {
                Image(systemName: tosAccepted ? "checkmark.square.fill" : "square")
                    .font(Typography.heroIcon(20))
                    .foregroundStyle(tosAccepted ? Theme.hyperGreen : Theme.muted)
            }
            .accessibilityLabel("Agree to Terms of Service and Privacy Policy")

            Text(
                "I have read and agree to the [Terms of Service](\(AppConfig.termsURL.absoluteString)) and [Privacy Policy](\(AppConfig.privacyURL.absoluteString))."
            )
            .font(Typography.caption())
            .foregroundStyle(Theme.muted)
            .tint(Theme.hyperGreen)
            .multilineTextAlignment(.leading)
            .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var signInFooterHint: some View {
        Text("Use the same Apple ID on ration.mayutic.com.")
            .font(Typography.caption())
            .foregroundStyle(Theme.muted)
            .multilineTextAlignment(.center)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity)
            .padding(.top, 4)
    }

    private var signUpFooterLinks: some View {
        HStack(spacing: 16) {
            Link("Terms of Service", destination: AppConfig.termsURL)
            Text("·").foregroundStyle(Theme.muted)
            Link("Privacy Policy", destination: AppConfig.privacyURL)
        }
        .font(Typography.caption())
        .foregroundStyle(Theme.muted)
        .tint(Theme.hyperGreen)
        .frame(maxWidth: .infinity)
        .padding(.top, 4)
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
                    .font(Typography.heroIcon(32))
                    .foregroundStyle(Theme.hyperGreen)
                Text("Check your inbox").rationHeadline()
                Text("Tap the link in the email we sent to \(email). It opens Ration and signs you in.")
                    .rationCaption()
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
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

    private var canProceed: Bool {
        AuthFlowMode.canProceed(tosAccepted: tosAccepted, mode: mode)
    }

    private var canSubmitMagicLink: Bool {
        AuthFlowMode.canSubmitMagicLink(
            emailValid: isValidEmail,
            tosAccepted: tosAccepted,
            mode: mode
        )
    }

    private var visibleError: String? {
        errorMessage ?? env.auth.authErrorMessage
    }

    private func resetFormForModeChange() {
        linkSent = false
        errorMessage = nil
        env.auth.clearAuthError()
        tosAccepted = false
    }

    private func sendLink() async {
        guard canSubmitMagicLink else { return }
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
        guard canProceed else { return }
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
        guard canProceed else { return }
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
