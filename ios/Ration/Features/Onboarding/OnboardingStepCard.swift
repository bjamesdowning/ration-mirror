import SwiftUI

struct TechInsightView: View {
    let text: String

    var body: some View {
        Text(text)
            .font(Typography.caption())
            .foregroundStyle(Theme.muted)
            .italic()
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 10)
            .overlay(alignment: .leading) {
                Rectangle()
                    .fill(Theme.hyperGreen.opacity(0.4))
                    .frame(width: 2)
            }
    }
}

/// Bottom-sheet card for contextual onboarding steps (1–5).
struct OnboardingStepCard: View {
    let step: Int
    let content: OnboardingCopy.ContextualStep
    let isSaving: Bool
    let onBack: () -> Void
    let onNext: () -> Void
    let onSkip: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            progressBar

            HStack {
                progressDots
                Spacer()
                Button(action: onSkip) {
                    Image(systemName: "xmark")
                        .font(Typography.heroIcon(12, weight: .semibold))
                        .foregroundStyle(Theme.muted)
                        .padding(8)
                        .background(Theme.platinum.opacity(0.6))
                        .clipShape(Circle())
                }
                .accessibilityLabel("Skip tour")
            }
            .padding(.horizontal, 20)
            .padding(.top, 16)

            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(spacing: 8) {
                        Image(systemName: content.systemImage)
                            .font(Typography.heroIcon(16, weight: .semibold))
                            .foregroundStyle(Theme.hyperGreen)
                            .frame(width: 28, height: 28)
                            .background(Theme.hyperGreen.opacity(0.2))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                        Text(content.moduleLabel.uppercased())
                            .font(Typography.mono(11, weight: .bold))
                            .foregroundStyle(Theme.hyperGreen)
                            .tracking(1)
                    }

                    Text(content.title)
                        .rationHeadline()

                    Text(content.body)
                        .rationBody()
                        .foregroundStyle(Theme.carbon.opacity(0.85))
                        .fixedSize(horizontal: false, vertical: true)

                    ForEach(content.techInsights, id: \.self) { insight in
                        TechInsightView(text: insight)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .frame(maxHeight: 280)

            Divider().overlay(Theme.platinum)

            HStack {
                Button("Skip tour", action: onSkip)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)

                Spacer()

                if step > 0 {
                    Button("Back", action: onBack)
                        .buttonStyle(OnboardingSecondaryCompactButtonStyle())
                }

                Button(step == 5 ? "Next →" : "Next →") {
                    onNext()
                }
                .buttonStyle(OnboardingPrimaryCompactButtonStyle(isLoading: isSaving))
                .disabled(isSaving)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
        }
        .background(Theme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Theme.platinum, lineWidth: 1)
        )
        .shadow(color: Theme.carbon.opacity(0.12), radius: 24, y: -4)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Onboarding step \(step + 1) of \(OnboardingCopy.totalSteps)")
    }

    private var progressBar: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Rectangle().fill(Theme.platinum)
                Rectangle()
                    .fill(Theme.hyperGreen)
                    .frame(width: geo.size.width * CGFloat(step + 1) / CGFloat(OnboardingCopy.totalSteps))
            }
        }
        .frame(height: 4)
        .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
    }

    private var progressDots: some View {
        HStack(spacing: 6) {
            ForEach(0..<OnboardingCopy.totalSteps, id: \.self) { index in
                Capsule()
                    .fill(index == step ? Theme.hyperGreen : (index < step ? Theme.hyperGreen.opacity(0.4) : Theme.platinum))
                    .frame(width: index == step ? 20 : 8, height: 8)
            }
        }
        .animation(.easeInOut(duration: 0.25), value: step)
    }
}

struct OnboardingPrimaryCompactButtonStyle: ButtonStyle {
    var isLoading = false

    func makeBody(configuration: Configuration) -> some View {
        HStack(spacing: 6) {
            if isLoading { ProgressView().tint(Theme.onHyperGreen).scaleEffect(0.85) }
            configuration.label
        }
        .font(Typography.headline())
        .foregroundStyle(Theme.onHyperGreen)
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .background(Theme.hyperGreen.opacity(configuration.isPressed ? 0.85 : 1))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .opacity(isLoading ? 0.7 : 1)
    }
}

struct OnboardingSecondaryCompactButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Typography.body())
            .foregroundStyle(Theme.muted)
            .padding(.horizontal, 12)
            .padding(.vertical, 10)
            .background(Theme.platinum.opacity(configuration.isPressed ? 0.7 : 1))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
    }
}
