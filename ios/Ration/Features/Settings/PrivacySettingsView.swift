import SwiftUI

struct PrivacySettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @Environment(\.openURL) private var openURL

    @State private var hasConsent = false
    @State private var nutritionStatuses: [NutritionConsentStatus] = []
    @State private var affirmedPurposes: Set<NutritionConsentPurpose> = []
    @State private var eraseDataset: String?
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

                ForEach(nutritionStatuses) { status in
                    Section {
                        LabeledContent("Status", value: statusLabel(status.state))
                        DisclosureGroup("Review consent statement") {
                            Text(status.statement.text)
                                .font(Typography.caption())
                                .foregroundStyle(Theme.muted)
                            Text(status.statement.statementVersion)
                                .font(Typography.dataCaption())
                                .foregroundStyle(Theme.muted)
                        }
                        if status.state == .active {
                            Button("Withdraw consent", role: .destructive) {
                                Task { await withdraw(status.purpose) }
                            }
                            .disabled(isSaving)
                            .accessibilityIdentifier("privacy.nutrition.withdraw.\(status.purpose.rawValue)")
                        } else {
                            Toggle(
                                "I have read this statement and explicitly consent",
                                isOn: affirmationBinding(status.purpose)
                            )
                            .tint(Theme.hyperGreen)
                            .accessibilityIdentifier("privacy.nutrition.consent.\(status.purpose.rawValue)")
                            Button("Record consent") {
                                Task { await grant(status) }
                            }
                            .disabled(isSaving || !affirmedPurposes.contains(status.purpose))
                            .accessibilityIdentifier("privacy.nutrition.grant.\(status.purpose.rawValue)")
                        }
                    } header: {
                        Text(nutritionPurposeLabel(status.purpose))
                    } footer: {
                        Text("Withdrawal blocks future processing. It does not erase existing nutrition data.")
                    }
                }

                Section {
                    Button("Erase goals", role: .destructive) { eraseDataset = "goals" }
                        .accessibilityIdentifier("privacy.nutrition.erase.goals")
                    Button("Erase intake", role: .destructive) { eraseDataset = "intake" }
                        .accessibilityIdentifier("privacy.nutrition.erase.intake")
                    Button("Erase all nutrition data", role: .destructive) { eraseDataset = "all" }
                        .accessibilityIdentifier("privacy.nutrition.erase.all")
                } header: {
                    Text("Erase nutrition data")
                } footer: {
                    Text("Intake history is kept for about 13 months (~396 days), then deleted automatically. Erasing here removes it sooner. Withdrawal does not erase data.")
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
            .confirmationDialog(
                "Permanently erase nutrition data?",
                isPresented: Binding(
                    get: { eraseDataset != nil },
                    set: { if !$0 { eraseDataset = nil } }
                ),
                titleVisibility: .visible
            ) {
                if let eraseDataset {
                    Button("Erase \(eraseDataset)", role: .destructive) {
                        Task { await erase(eraseDataset) }
                    }
                }
                Button("Cancel", role: .cancel) { eraseDataset = nil }
            } message: {
                Text("This cannot be undone. Withdrawing consent is a separate action.")
            }
        }
    }

    @MainActor
    private func load() async {
        do {
            let response = try await env.api.settings()
            hasConsent = response.settings.aiConsentAt?.isEmpty == false
            nutritionStatuses = try await env.api.nutritionPrivacy().consents
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func nutritionPurposeLabel(_ purpose: NutritionConsentPurpose) -> String {
        switch purpose {
        case .goals: "Nutrition goals"
        case .intake: "Private nutrition intake"
        case .agentProcessing: "Connected-agent nutrition processing"
        }
    }

    private func statusLabel(_ state: NutritionConsentState) -> String {
        switch state {
        case .active: "Active"
        case .notGranted: "Not granted"
        case .withdrawn: "Withdrawn"
        case .reconsentRequired: "Review required"
        }
    }

    private func affirmationBinding(_ purpose: NutritionConsentPurpose) -> Binding<Bool> {
        Binding(
            get: { affirmedPurposes.contains(purpose) },
            set: { affirmed in
                if affirmed {
                    affirmedPurposes.insert(purpose)
                } else {
                    affirmedPurposes.remove(purpose)
                }
            }
        )
    }

    @MainActor
    private func grant(_ status: NutritionConsentStatus) async {
        guard affirmedPurposes.contains(status.purpose) else { return }
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            nutritionStatuses = try await env.api.grantNutritionConsent(status).consents
            affirmedPurposes.remove(status.purpose)
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func withdraw(_ purpose: NutritionConsentPurpose) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            nutritionStatuses = try await env.api.withdrawNutritionConsent(purpose).consents
            Haptics.success()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    @MainActor
    private func erase(_ dataset: String) async {
        isSaving = true
        errorMessage = nil
        eraseDataset = nil
        defer { isSaving = false }
        do {
            nutritionStatuses = try await env.api.eraseNutritionData(dataset).consents
            Haptics.success()
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
