import SwiftUI

enum StarterSeedCardState: Equatable {
    case idle
    case loading
    case completed
    case disabled
}

/// Chat-native suggested prompt bubble for the starter-kitchen seed turn.
/// Shows the full prompt preview so users see the input before sending.
struct StarterSeedCard: View {
    let state: StarterSeedCardState
    let promptPreview: String
    let action: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Button(action: {
            guard state == .idle else { return }
            Haptics.light()
            action()
        }) {
            VStack(alignment: .trailing, spacing: 8) {
                Text(OnboardingBriefingCopy.seedSuggestedLabel)
                    .font(Typography.caption())
                    .foregroundStyle(Theme.muted)
                    .frame(maxWidth: .infinity, alignment: .trailing)

                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 10) {
                        Text(OnboardingBriefingCopy.seedCardTitle)
                            .font(Typography.headline())
                            .foregroundStyle(Theme.carbon)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)

                        trailingAccessory
                    }

                    Text(OnboardingBriefingCopy.seedCardSubtitle)
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)

                    Text(promptPreview)
                        .font(Typography.caption())
                        .foregroundStyle(Theme.carbon.opacity(0.9))
                        .multilineTextAlignment(.leading)
                        .fixedSize(horizontal: false, vertical: true)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .padding(12)
                .background(Theme.hyperGreen.opacity(state == .idle ? 0.22 : 0.12))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Theme.hyperGreen.opacity(0.55), lineWidth: 1)
                )
            }
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .buttonStyle(StarterSeedCardButtonStyle())
        .disabled(state != .idle)
        .opacity(state == .completed || state == .disabled ? 0.72 : 1)
        .accessibilityLabel("Stock my kitchen with five pantry staples")
        .accessibilityHint("Sends this suggested prompt to Copilot to add items to your cargo")
        .accessibilityValue(accessibilityValue)
    }

    private var accessibilityValue: String {
        switch state {
        case .idle: "Ready"
        case .loading: "Stocking pantry"
        case .completed: "Completed"
        case .disabled: "Unavailable"
        }
    }

    @ViewBuilder
    private var trailingAccessory: some View {
        switch state {
        case .loading:
            ProgressView().tint(Theme.hyperGreen)
        case .completed:
            Image(systemName: "checkmark.circle.fill")
                .foregroundStyle(Theme.hyperGreen)
                .accessibilityHidden(true)
        case .idle, .disabled:
            Image(systemName: "arrow.up.circle.fill")
                .font(.title3)
                .foregroundStyle(Theme.hyperGreen)
                .symbolEffect(
                    .pulse,
                    options: .repeating,
                    isActive: !reduceMotion && state == .idle
                )
                .accessibilityHidden(true)
        }
    }
}

private struct StarterSeedCardButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(!reduceMotion && configuration.isPressed ? 0.98 : 1)
            .animation(MotionPolicy.shortFade, value: configuration.isPressed)
    }
}
