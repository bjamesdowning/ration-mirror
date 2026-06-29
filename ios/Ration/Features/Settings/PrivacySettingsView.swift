import SwiftUI

struct PrivacySettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var hasConsent = false
    @State private var isLoading = true
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Ration processes receipt images, pantry items, recipe text, and allergy preferences through Cloudflare Workers and AI providers to power scans, meal matching, and planning.")
                        .font(Typography.body())
                } header: {
                    Text("AI Processing & Receipt Privacy")
                }

                Section {
                    Toggle("Allow AI processing", isOn: $hasConsent)
                        .tint(Theme.hyperGreen)
                } footer: {
                    Text("Disable to block receipt scans and other AI features. Manual entry remains available.")
                }

                Section("Legal") {
                    Button("Privacy Policy") { openURL(AppConfig.privacyURL) }
                    Button("Terms of Service") { openURL(AppConfig.termsURL) }
                }

                if let errorMessage {
                    Section {
                        ErrorBanner(message: errorMessage)
                    }
                }
            }
            .navigationTitle("Privacy & AI")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { Task { await save() } }
                        .disabled(isSaving)
                }
            }
            .task { await load() }
        }
    }

    @MainActor
    private func load() async {
        isLoading = true
        defer { isLoading = false }
        do {
            let response = try await env.api.settings()
            hasConsent = response.settings.aiConsentAt?.isEmpty == false
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func save() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let patch = SettingsPatch(
                aiConsentAt: hasConsent ? ISO8601DateFormatter().string(from: Date()) : nil
            )
            _ = try await env.api.patchSettings(patch)
            Haptics.success()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

/// Gate shown before the first scan when AI consent has not been recorded.
struct AIConsentGateView: View {
    @Environment(\.openURL) private var openURL
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.viewfinder")
                .font(.system(size: 44))
                .foregroundStyle(Theme.hyperGreen)
            Text("Receipt scanning uses AI").rationTitle()
            Text("Your receipt image and extracted items are sent to Ration cloud services and AI providers for processing. See Privacy & AI in Settings to manage consent.")
                .rationCaption()
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button("Not now", action: onDecline)
                    .buttonStyle(SecondaryButtonStyle())
                Button("I agree", action: onAccept)
                    .buttonStyle(PrimaryButtonStyle())
            }
            Button("Privacy Policy") { openURL(AppConfig.privacyURL) }
                .font(Typography.caption())
                .foregroundStyle(Theme.hyperGreen)
        }
        .padding(24)
    }
}
