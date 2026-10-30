import SwiftUI

/// Shared AI Features + Macro Tracking toggles (onboarding + Settings).
struct FeatureEnablementView: View {
    @Environment(AppEnvironment.self) private var env

    var variant: Variant = .settings
    var onContinue: ((_ aiEnabled: Bool, _ macroEnabled: Bool) -> Void)?

    enum Variant {
        case onboarding
        case settings
    }

    @State private var aiFeatures = false
    @State private var macroTracking = false
    @State private var isSaving = false
    @State private var errorMessage: String?
    @State private var showStatements = false
    @State private var statements: [NutritionConsentStatus] = []

    var body: some View {
        Group {
            switch variant {
            case .onboarding:
                onboardingChrome
            case .settings:
                settingsChrome
            }
        }
        .task {
            await loadStatus()
        }
    }

    private var onboardingChrome: some View {
        VStack(spacing: 0) {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Enable your features")
                        .font(.title2.bold())
                        .foregroundStyle(Theme.carbon)
                    Text(
                        "Turn on the features you want. Both are optional, and you can change them anytime in Account → Feature enablement."
                    )
                    .font(.subheadline)
                    .foregroundStyle(Theme.muted)

                    toggles

                    privacyFooter

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.caption)
                            .foregroundStyle(.red)
                    }
                }
                .padding(24)
            }

            Button {
                Task { await agreeAndContinue() }
            } label: {
                Text(isSaving ? "Saving…" : (aiFeatures || macroTracking ? "Agree & Continue" : "Continue"))
            }
            .buttonStyle(PrimaryButtonStyle())
            .disabled(isSaving)
            .padding(24)
        }
        .background(Theme.ceramic)
    }

    private var settingsChrome: some View {
        Form {
            Section {
                toggles
            } header: {
                Text("Feature enablement")
            } footer: {
                Text(
                    "Turn features off anytime. Erasing nutrition data is separate from turning Macro Tracking off."
                )
            }

            Section("Erase Macro Tracking data") {
                Button("Erase goals", role: .destructive) {
                    Task { await erase(dataset: "goals") }
                }
                .disabled(isSaving)
                Button("Erase intake", role: .destructive) {
                    Task { await erase(dataset: "intake") }
                }
                .disabled(isSaving)
                Button("Erase all nutrition data", role: .destructive) {
                    Task { await erase(dataset: "all") }
                }
                .disabled(isSaving)
            }

            if let errorMessage {
                Section {
                    Text(errorMessage).foregroundStyle(.red)
                }
            }
        }
    }

    private var toggles: some View {
        VStack(alignment: .leading, spacing: 12) {
            Toggle(isOn: Binding(
                get: { aiFeatures },
                set: { newValue in
                    if variant == .onboarding {
                        aiFeatures = newValue
                    } else {
                        Task { await setFeature(ai: newValue, macro: macroTracking) }
                    }
                }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("AI Features")
                        .font(.body.weight(.semibold))
                    Text(AIConsentCopy.disclosure)
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                }
            }
            .disabled(isSaving)

            Toggle(isOn: Binding(
                get: { macroTracking },
                set: { newValue in
                    if variant == .onboarding {
                        macroTracking = newValue
                    } else {
                        Task { await setFeature(ai: aiFeatures, macro: newValue) }
                    }
                }
            )) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Macro Tracking")
                        .font(.body.weight(.semibold))
                    Text(
                        "Personal nutrition goals, Eat / plate-up logging, and Copilot or connected-agent nutrition tools."
                    )
                    .font(.caption)
                    .foregroundStyle(Theme.muted)
                }
            }
            .disabled(isSaving)

            if !statements.isEmpty {
                Button(showStatements ? "Hide full statements" : "Show full Macro Tracking statements") {
                    showStatements.toggle()
                }
                .font(.caption)
                if showStatements {
                    ForEach(statements, id: \.purpose) { status in
                        Text("\(status.purpose.rawValue): \(status.statement.text)")
                            .font(.caption2)
                            .foregroundStyle(Theme.muted)
                    }
                }
            }
        }
    }

    private var privacyFooter: some View {
        Text(
            "Turning a feature on records your consent. See the Privacy Policy for details."
        )
        .font(.caption2)
        .foregroundStyle(Theme.muted)
    }

    private func loadStatus() async {
        do {
            let status = try await env.api.featureEnablement()
            aiFeatures = status.aiFeatures
            macroTracking = status.macroTracking
            statements = status.consents
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func refreshConsentStore() async {
        try? await env.nutritionConsent.refresh(api: env.api, snapshots: env.snapshots)
    }

    private func agreeAndContinue() async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let status = try await env.api.setFeatureEnablement(
                aiFeatures: aiFeatures,
                macroTracking: macroTracking
            )
            if status.aiFeatures {
                env.session.markAIConsentGranted()
            } else {
                env.session.markAIConsentWithdrawn()
            }
            await refreshConsentStore()
            onContinue?(status.aiFeatures, status.macroTracking)
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }

    private func setFeature(ai: Bool, macro: Bool) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            let status = try await env.api.setFeatureEnablement(
                aiFeatures: ai,
                macroTracking: macro
            )
            aiFeatures = status.aiFeatures
            macroTracking = status.macroTracking
            statements = status.consents
            if status.aiFeatures {
                env.session.markAIConsentGranted()
            } else {
                env.session.markAIConsentWithdrawn()
            }
            await refreshConsentStore()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
            await loadStatus()
        }
    }

    private func erase(dataset: String) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }
        do {
            _ = try await env.api.eraseFeatureNutritionData(dataset: dataset)
            await refreshConsentStore()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
