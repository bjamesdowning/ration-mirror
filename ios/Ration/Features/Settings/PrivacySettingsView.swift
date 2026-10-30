import SwiftUI

/// Settings destination for Feature enablement (AI + Macro Tracking) + legal links.
struct PrivacySettingsView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            FeatureEnablementView(variant: .settings)
                .safeAreaInset(edge: .bottom) {
                    HStack(spacing: 16) {
                        Button("Privacy Policy") { openURL(AppConfig.privacyURL) }
                        Button("Terms of Service") { openURL(AppConfig.termsURL) }
                    }
                    .font(Typography.caption())
                    .foregroundStyle(Theme.hyperGreen)
                    .padding()
                    .frame(maxWidth: .infinity)
                    .background(Theme.ceramic.opacity(0.95))
                }
                .navigationTitle("Feature enablement")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Done") { dismiss() }
                    }
                }
        }
    }
}

enum AIConsentCopy {
    /// 5.1.2(i): name the third-party AI provider and what is sent before asking.
    static let disclosure =
        "Scan, meal generation, recipe import, Plan week, and Ask Ration send the photos, text, links, and kitchen details you use with them to Google Gemini (via Cloudflare AI Gateway) to produce results. Recipe imports also send the link to Supadata to read the page. Credits are used automatically when your Crew allowance runs out."
}

/// Asks for AI consent the first time an AI feature is used.
struct AIConsentGateView: View {
    @Environment(\.openURL) private var openURL
    var errorMessage: String?
    var isAccepting = false
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "sparkles")
                .font(Typography.heroIcon(44))
                .foregroundStyle(Theme.hyperGreen)
            Text("Allow AI features?").rationTitle()
            Text(AIConsentCopy.disclosure)
                .rationCaption()
                .multilineTextAlignment(.center)
            if let errorMessage {
                ErrorBanner(message: errorMessage)
            }
            VStack(spacing: 12) {
                Button("Not now", action: onDecline)
                    .buttonStyle(SecondaryButtonStyle())
                Button("Allow", action: onAccept)
                    .buttonStyle(PrimaryButtonStyle(isLoading: isAccepting))
                    .disabled(isAccepting)
            }
            Button("Privacy Policy") { openURL(AppConfig.privacyURL) }
                .font(Typography.caption())
                .foregroundStyle(Theme.hyperGreen)
        }
        .padding(24)
    }
}
