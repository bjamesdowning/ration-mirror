import SwiftUI

/// Compact badge indicating a Galley meal or Cargo item is selected for Supply sync.
struct SupplySelectionBadge: View {
    var compact = false

    var body: some View {
        if compact {
            Image(systemName: "checkmark.circle.fill")
                .font(.caption)
                .foregroundStyle(Theme.hyperGreen)
                .accessibilityLabel("On Supply list")
        } else {
            Text("On Supply")
                .font(Typography.caption())
                .foregroundStyle(Theme.hyperGreen)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Theme.hyperGreen.opacity(0.15))
                .clipShape(Capsule())
                .accessibilityLabel("On Supply list")
        }
    }
}

/// Status bar shown when one or more meals/cargo items are selected for Supply.
struct SupplySelectionBar: View {
    let count: Int
    let itemLabel: String
    let contextLabel: String
    var isClearing = false
    let onClear: () -> Void

    var body: some View {
        GlassCard {
            HStack {
                Text("\(count) \(itemLabel) selected \(contextLabel)")
                    .rationCaption()
                    .foregroundStyle(Theme.muted)
                Spacer()
                Button("Clear All", action: onClear)
                    .font(Typography.caption())
                    .fontWeight(.semibold)
                    .foregroundStyle(Theme.hyperGreen)
                    .disabled(isClearing)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 8)
    }
}
