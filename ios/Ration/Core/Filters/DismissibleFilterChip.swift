import SwiftUI

/// Shared dismissible Hyper-Green capsule for active filter summaries and rails.
struct DismissibleFilterChip: View {
    let label: String
    var accessibilityPrefix: String = "Remove"
    let action: () -> Void

    var body: some View {
        Button {
            Haptics.light()
            action()
        } label: {
            HStack(spacing: 6) {
                Text(label)
                    .font(Typography.caption())
                Image(systemName: "xmark.circle.fill")
                    .font(.caption2)
                    .foregroundStyle(Theme.onHyperGreen.opacity(0.7))
            }
            .foregroundStyle(Theme.onHyperGreen)
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Theme.hyperGreen)
            .clipShape(Capsule())
            .frame(minHeight: 44)
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(accessibilityPrefix) \(label)")
    }
}
