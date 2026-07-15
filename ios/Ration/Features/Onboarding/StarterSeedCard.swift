import SwiftUI

enum StarterSeedCardState: Equatable {
    case idle
    case loading
    case completed
    case disabled
}

/// Chat-native suggested prompt bubble for the starter-kitchen seed turn.
/// Sits in the transcript after the intro reply — not a bottom-sheet modal.
struct StarterSeedCard: View {
    let state: StarterSeedCardState
    let subtitle: String
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

                HStack(alignment: .top, spacing: 10) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(OnboardingBriefingCopy.seedCardTitle)
                            .font(Typography.headline())
                            .foregroundStyle(Theme.carbon)
                            .multilineTextAlignment(.leading)
                        Text(subtitle)
                            .font(Typography.caption())
                            .foregroundStyle(Theme.muted)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    trailingAccessory
                }
                .padding(12)
                .background(Theme.hyperGreen.opacity(state == .idle ? 0.22 : 0.12))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                        .stroke(Theme.hyperGreen.opacity(0.55), lineWidth: 1)
                )
            }
            .frame(maxWidth: 320, alignment: .trailing)
            .frame(maxWidth: .infinity, alignment: .trailing)
        }
        .buttonStyle(StarterSeedCardButtonStyle())
        .disabled(state != .idle)
        .opacity(state == .completed || state == .disabled ? 0.72 : 1)
        .accessibilityLabel("Stock my kitchen with five pantry staples")
        .accessibilityHint("Sends a suggested prompt to add butter, eggs, milk, flour, and olive oil to your cargo")
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
