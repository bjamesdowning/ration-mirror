import SwiftUI

enum StarterSeedCardState: Equatable {
    case idle
    case loading
    case completed
    case disabled
}

/// Prominence CTA for the starter-kitchen seed turn during iOS onboarding.
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
            HStack(alignment: .center, spacing: 14) {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(Theme.hyperGreen)
                    .frame(width: 4)
                    .padding(.vertical, 4)

                Image(systemName: iconName)
                    .font(Typography.heroIcon(22))
                    .foregroundStyle(Theme.hyperGreen)
                    .symbolEffect(
                        .pulse,
                        options: .repeating,
                        isActive: !reduceMotion && state == .idle
                    )
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text(OnboardingBriefingCopy.seedCardTitle)
                        .font(Typography.headline())
                        .foregroundStyle(Theme.carbon)
                    Text(subtitle)
                        .font(Typography.caption())
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.leading)
                }

                Spacer(minLength: 8)

                trailingAccessory
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 14)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(Theme.platinum, lineWidth: 1)
            )
        }
        .buttonStyle(StarterSeedCardButtonStyle())
        .disabled(state != .idle)
        .opacity(state == .completed || state == .disabled ? 0.72 : 1)
        .accessibilityLabel("Stock my kitchen with five pantry staples")
        .accessibilityHint("Adds butter, eggs, milk, flour, and olive oil to your cargo")
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

    private var iconName: String {
        switch state {
        case .completed: "checkmark.circle.fill"
        default: "basket.fill"
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
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(Theme.muted)
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
