import SwiftUI

struct SettingsTutorialSection: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    @State private var isRestarting = false
    @State private var errorMessage: String?

    var body: some View {
        Section {
            Text("Replay the onboarding tour to revisit the Ration workflow and feature overview.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
                .listRowBackground(Color.clear)

            Button {
                Task { await restartTutorial() }
            } label: {
                HStack {
                    Label("Restart Tutorial", systemImage: "arrow.counterclockwise")
                    Spacer()
                    if isRestarting {
                        ProgressView()
                    }
                }
            }
            .foregroundStyle(Theme.hyperGreen)
            .disabled(isRestarting)

            if let errorMessage {
                Text(errorMessage)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.danger)
            }
        } header: {
            Text("Tutorial")
        }
    }

    private func restartTutorial() async {
        isRestarting = true
        errorMessage = nil
        defer { isRestarting = false }

        do {
            let response = try await env.api.patchSettings(
                SettingsPatch(restartOnboarding: true)
            )
            env.launch.updateUserSettings(response.settings)
            env.onboarding.restart(fromServerStep: response.settings.onboardingStep ?? 0)
            if let mode = response.settings.unitDisplayMode, !mode.isEmpty {
                env.onboarding.unitDisplayMode = mode
            }
            dismiss()
        } catch {
            errorMessage = (error as? APIError)?.errorDescription ?? error.localizedDescription
        }
    }
}
