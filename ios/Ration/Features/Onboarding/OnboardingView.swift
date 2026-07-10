import SwiftUI
import Observation

@MainActor
@Observable
final class OnboardingViewModel {
    var step = 0
    var unitDisplayMode = "metric"
    var isSaving = false
    var errorMessage: String?

    let steps = [
        "Set up your station",
        "Stock Cargo",
        "Plan your first meal",
        "Supply closes the gap",
        "You're live",
    ]

    func advance(api: RationAPI) async {
        isSaving = true
        errorMessage = nil
        defer { isSaving = false }

        let iso = ISO8601DateFormatter().string(from: Date())
        var patch = SettingsPatch(onboardingStep: step + 1)
        if step == 0 {
            patch.unitDisplayMode = unitDisplayMode
            patch.supplyUnitMode = unitDisplayMode == "original" ? nil : unitDisplayMode
        }
        if step >= steps.count - 1 {
            patch.onboardingCompletedAt = iso
        }

        do {
            _ = try await api.patchSettings(patch)
            if step < steps.count - 1 {
                step += 1
            }
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}

struct OnboardingView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var model = OnboardingViewModel()
    let onComplete: () -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                progressDots

                GlassCard {
                    VStack(alignment: .leading, spacing: 12) {
                        Text(model.steps[model.step]).rationTitle()
                        Text(stepCopy).rationBody()
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                if model.step == 0 {
                    Picker("Units", selection: $model.unitDisplayMode) {
                        Text("Original").tag("original")
                        Text("Metric").tag("metric")
                        Text("Imperial").tag("imperial")
                        Text("Cooking").tag("cooking")
                    }
                    .pickerStyle(.segmented)
                }

                if let errorMessage = model.errorMessage {
                    ErrorBanner(message: errorMessage)
                }

                Spacer()

                Button(model.step == model.steps.count - 1 ? "Open Hub" : "Continue") {
                    Task {
                        await model.advance(api: env.api)
                        if model.step == model.steps.count - 1 {
                            onComplete()
                            dismiss()
                        }
                    }
                }
                .buttonStyle(PrimaryButtonStyle(isLoading: model.isSaving))
                .disabled(model.isSaving)

                if model.step > 0 {
                    Button("Skip for now") {
                        Task {
                            _ = try? await env.api.patchSettings(
                                SettingsPatch(onboardingCompletedAt: ISO8601DateFormatter().string(from: Date()))
                            )
                            onComplete()
                            dismiss()
                        }
                    }
                    .buttonStyle(SecondaryButtonStyle())
                }
            }
            .padding(24)
            .background(Theme.ceramic)
            .navigationTitle("Welcome")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private var progressDots: some View {
        HStack(spacing: 8) {
            ForEach(0..<model.steps.count, id: \.self) { index in
                Circle()
                    .fill(index <= model.step ? Theme.hyperGreen : Theme.platinum)
                    .frame(width: 8, height: 8)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Onboarding progress")
        .accessibilityValue("Step \(model.step + 1) of \(model.steps.count)")
    }

    private var stepCopy: String {
        switch model.step {
        case 0:
            return "Choose your default units and confirm household preferences. You can change these anytime in Settings."
        case 1:
            return "Scan a grocery receipt or add staples manually from Cargo. Your pantry powers meal matching and supply."
        case 2:
            return "Pick meals in Galley or schedule them on Manifest. Ration tracks what you can cook with what you have."
        case 3:
            return "Sync Supply from selected meals. Check items off while shopping, then dock them into Cargo."
        default:
            return "Your orbital supply chain is online. Hub highlights the next best action in your daily loop."
        }
    }
}
