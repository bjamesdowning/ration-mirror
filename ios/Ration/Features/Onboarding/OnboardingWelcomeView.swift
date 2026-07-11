import SwiftUI

struct OnboardingWelcomeView: View {
    @Bindable var coordinator: OnboardingCoordinator
    let onBeginTour: () -> Void
    let onSkip: () -> Void

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                header
                pitch
                nomenclatureSection
                workflowSection
                TechInsightView(
                    text: "Ration runs at the edge — every action is instant, every recommendation is AI-powered."
                )
                unitsSection

                if let errorMessage = coordinator.errorMessage {
                    ErrorBanner(message: errorMessage)
                }

                actions
            }
            .padding(24)
        }
        .background(Theme.ceramic)
    }

    private var header: some View {
        HStack(spacing: 12) {
            Image(systemName: "bolt.fill")
                .font(Typography.heroIcon(22, weight: .semibold))
                .foregroundStyle(Theme.hyperGreen)
                .frame(width: 44, height: 44)
                .background(Theme.hyperGreen.opacity(0.2))
                .clipShape(Circle())

            VStack(alignment: .leading, spacing: 2) {
                Text("Welcome to Ration.")
                    .rationTitle()
                Text("Orbital Supply Chain")
                    .rationCaption()
            }
        }
    }

    private var pitch: some View {
        Text(
            "Ration connects your pantry, recipes, and weekly meal plan into one intelligent system — so you always know what you have, what you can cook, and exactly what to buy."
        )
        .rationBody()
        .foregroundStyle(Theme.carbon.opacity(0.85))
        .fixedSize(horizontal: false, vertical: true)
    }

    private var nomenclatureSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(OnboardingCopy.nomenclature) { entry in
                HStack(alignment: .top, spacing: 10) {
                    Text(entry.term.uppercased())
                        .font(Typography.mono(11, weight: .bold))
                        .foregroundStyle(Theme.hyperGreen)
                        .frame(width: 72, alignment: .leading)
                    Text(entry.definition)
                        .rationCaption()
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }

    private var workflowSection: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 8) {
                Text("Example workflow")
                    .rationCaption()
                HStack(spacing: 6) {
                    ForEach(Array(OnboardingCopy.workflowChain.enumerated()), id: \.offset) { index, label in
                        if index > 0 {
                            Text("→")
                                .rationCaption()
                        }
                        Text(label)
                            .font(Typography.mono(12, weight: .bold))
                            .foregroundStyle(Theme.hyperGreen)
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private var unitsSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Default units")
                .rationHeadline()
            Text("Choose your default units. You can change these anytime in Settings.")
                .rationCaption()
            Picker("Units", selection: $coordinator.unitDisplayMode) {
                Text("Original").tag("original")
                Text("Metric").tag("metric")
                Text("Imperial").tag("imperial")
                Text("Cooking").tag("cooking")
            }
            .pickerStyle(.segmented)
        }
    }

    private var actions: some View {
        VStack(spacing: 12) {
            HStack {
                Button("Skip tour", action: onSkip)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                Spacer()
                Button("Begin Tour →") {
                    onBeginTour()
                }
                .buttonStyle(OnboardingPrimaryCompactButtonStyle(isLoading: coordinator.isSaving))
                .disabled(coordinator.isSaving)
            }
        }
        .padding(.top, 4)
    }
}
