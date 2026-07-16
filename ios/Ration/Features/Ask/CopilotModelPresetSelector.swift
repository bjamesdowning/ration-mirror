import SwiftUI

struct CopilotModelPresetSelector: View {
    let selection: String
    let isDisabled: Bool
    let onSelect: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 4) {
                presetButton("fast", label: "Fast")
                presetButton("deep", label: "Deep")
            }
            .padding(2)
            .background(Theme.platinum)
            .clipShape(Capsule())
            .opacity(isDisabled ? 0.85 : 1)

            Text("Deep thinking may use more tokens and credits.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder
    private func presetButton(_ value: String, label: String) -> some View {
        Button {
            guard !isDisabled else { return }
            onSelect(value)
        } label: {
            Text(label)
                .font(Typography.caption())
                .foregroundStyle(
                    selection == value ? Theme.carbon : Theme.carbon.opacity(0.8)
                )
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(
                    selection == value
                        ? Theme.hyperGreen
                        : Theme.carbon.opacity(0.08)
                )
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        // Avoid `.disabled` washout; block touch + VoiceOver while a turn is active.
        .allowsHitTesting(!isDisabled)
        .accessibilityRespondsToUserInteraction(!isDisabled)
        .accessibilityHint(
            isDisabled ? "Unavailable while Copilot is responding" : ""
        )
    }
}
