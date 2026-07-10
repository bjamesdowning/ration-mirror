import SwiftUI

/// Pill-shaped toggle for filter options — mirrors web `FilterChip`.
struct FilterChip: View {
    let label: String
    var systemImage: String?
    let isActive: Bool
    let action: () -> Void

    var body: some View {
        Button(action: {
            Haptics.light()
            action()
        }) {
            HStack(spacing: 6) {
                if let systemImage {
                    Image(systemName: systemImage)
                        .font(Typography.heroIcon(14, weight: .medium))
                }
                Text(label)
                    .font(Typography.caption())
            }
            .foregroundStyle(isActive ? Theme.onHyperGreen : Theme.carbon)
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(isActive ? Theme.hyperGreen : Theme.platinum)
            .clipShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isActive ? .isSelected : [])
    }
}
