import SwiftUI

struct PrivacySettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var hasConsent = false
    @State private var isSaving = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text(AIConsentCopy.body)
                        .font(Typography.body())
                } header: {
                    Text("AI Processing & Receipt Privacy")
                }

                Section {
                    Toggle("Allow AI processing", isOn: $hasConsent)
                        .tint(Theme.hyperGreen)
                } footer: {
                    Text("Turn off to stop new AI processing. You will be asked to agree again before the next AI feature use.")
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
            let patch: SettingsPatch
            if hasConsent {
                patch = SettingsPatch(
                    aiConsentAt: ISO8601DateFormatter().string(from: Date())
                )
            } else {
                patch = SettingsPatch(clearAIConsent: true)
            }
            let response = try await env.api.patchSettings(patch)
            // Reuse the response already returned by the PATCH instead of a
            // second `GET /settings` round-trip just to re-derive the flag.
            env.session.applyConsent(response.settings)
            Haptics.success()
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

enum AIConsentCopy {
    static let title = "AI features use cloud processing"
    static let body =
        "Ration may send photos, receipt images, pantry items, recipe text, and allergy preferences to Google Gemini (via Cloudflare AI Gateway) and Cloudflare Workers AI for receipt scans, meal generation and import, Manifest plan week, and Ask Ration. See the Privacy Policy for details."
}

/// Gate shown before the first AI feature use when consent has not been recorded.
struct AIConsentGateView: View {
    @Environment(\.openURL) private var openURL
    var title: String = AIConsentCopy.title
    var message: String = AIConsentCopy.body
    let onAccept: () -> Void
    let onDecline: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Image(systemName: "doc.text.viewfinder")
                .font(Typography.heroIcon(44))
                .foregroundStyle(Theme.hyperGreen)
            Text(title).rationTitle()
            Text(message)
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
