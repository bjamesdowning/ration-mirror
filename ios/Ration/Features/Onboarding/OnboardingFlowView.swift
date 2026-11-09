import SwiftUI

/// Shell for first-login onboarding: Welcome → Features → Copilot briefing.
struct OnboardingFlowView: View {
    @Environment(AppEnvironment.self) private var env

    var body: some View {
        Group {
            switch env.onboarding.phase {
            case .welcome:
                OnboardingWelcomeView {
                    env.onboarding.advanceFromWelcome()
                }
            case .featureEnablement:
                FeatureEnablementView(variant: .onboarding) { aiEnabled, macroEnabled in
                    let offer = OptionalGoalsPolicy.stepVisible(
                        macroTrackingOn: macroEnabled,
                        fastLogEnabled: env.session.clientFlags.isNutritionFastLogEnabled,
                        goalsEnabled: env.session.clientFlags.isNutritionGoalsEnabled,
                        appVersion: AppMarketingVersion.current
                    )
                    env.onboarding.advanceFromFeatureEnablement(
                        aiEnabled: aiEnabled,
                        offerOptionalGoals: offer
                    )
                }
            case .optionalGoals:
                OptionalGoalsOnboardingView(
                    goalsEnabled: env.session.clientFlags.isNutritionGoalsEnabled
                ) {
                    env.onboarding.advanceFromOptionalGoals()
                }
            case .askBriefing, .inactive:
                OnboardingBriefingView()
                    .environment(env.ask)
            }
        }
    }
}
