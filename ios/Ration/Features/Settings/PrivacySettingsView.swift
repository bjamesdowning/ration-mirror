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
    static let title = "AI Features are off"
    static let body =
        "Enable AI Features in Settings to scan, generate meals, plan your week, and Ask Ration. Credits may be used when your Crew allowance runs out. See the Privacy Policy for details."
}

/// Gate shown before AI feature use when consent has not been recorded — directs to Settings.
struct AIConsentGateView: View {
    @Environment(\.openURL) private var openURL
    var title: String = AIConsentCopy.title
    var message: String = AIConsentCopy.body
    var settingsLabel: String = "Open Settings"
    let onAccept: () -> Void
    let onDecline: () -> Void
    var onOpenSettings: (() -> Void)?

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "sparkles")
                .font(Typography.heroIcon(44))
                .foregroundStyle(Theme.hyperGreen)
            Text(title).rationTitle()
            Text(message)
                .rationCaption()
                .multilineTextAlignment(.center)
            VStack(spacing: 12) {
                if let onOpenSettings {
                    Button(settingsLabel, action: onOpenSettings)
                        .buttonStyle(PrimaryButtonStyle())
                    Button("Not now", action: onDecline)
                        .buttonStyle(SecondaryButtonStyle())
                } else {
                    Button("Not now", action: onDecline)
                        .buttonStyle(SecondaryButtonStyle())
                    Button("I agree", action: onAccept)
                        .buttonStyle(PrimaryButtonStyle())
                }
            }
            Button("Privacy Policy") { openURL(AppConfig.privacyURL) }
                .font(Typography.caption())
                .foregroundStyle(Theme.hyperGreen)
        }
        .padding(24)
    }
}
