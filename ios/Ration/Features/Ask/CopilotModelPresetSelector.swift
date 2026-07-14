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
            .background(Theme.platinum.opacity(0.35))
            .clipShape(Capsule())

            Text("Deep thinking may use more tokens and credits.")
                .font(Typography.caption())
                .foregroundStyle(Theme.muted)
        }
    }

    @ViewBuilder
    private func presetButton(_ value: String, label: String) -> some View {
        Button {
            onSelect(value)
        } label: {
            Text(label)
                .font(Typography.caption())
                .foregroundStyle(selection == value ? Theme.carbon : Theme.muted)
                .padding(.horizontal, 12)
                .padding(.vertical, 6)
                .background(selection == value ? Theme.hyperGreen : Color.clear)
                .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .disabled(isDisabled)
    }
}
