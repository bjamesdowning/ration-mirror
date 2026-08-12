import SwiftUI

/// Shell for first-login onboarding: Welcome → Features → Copilot briefing.
struct OnboardingFlowView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            switch env.onboarding.phase {
            case .welcome:
                OnboardingWelcomeView {
                    env.onboarding.advanceFromWelcome(
                        featureEnablementEnabled: env.session.clientFlags.isFeatureEnablementConsentEnabled
                    )
                }
            case .featureEnablement:
                FeatureEnablementView(variant: .onboarding) { aiEnabled, _ in
                    env.onboarding.advanceFromFeatureEnablement(aiEnabled: aiEnabled)
                }
            case .askBriefing, .inactive:
                OnboardingBriefingView()
                    .environment(env.ask)
            }
        }
    }
}
