import SwiftUI

struct ScanReviewItemRow: View {
    let item: EditableScanResultItem
    let onToggleSelection: () -> Void
    let onStartEdit: () -> Void

    var body: some View {
        GlassCard {
            HStack(alignment: .top, spacing: 12) {
                Button(action: onToggleSelection) {
                    Image(systemName: item.selected ? "checkmark.circle.fill" : "circle")
                        .foregroundStyle(item.selected ? Theme.hyperGreen : Theme.muted)
                        .font(.title3)
                }
                .buttonStyle(.plain)
                .accessibilityLabel(item.selected ? "Deselect item" : "Select item")

                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(item.name.capitalized)
                            .rationBody()
                        if item.isLowConfidence {
                            Label("Verify", systemImage: "exclamationmark.triangle.fill")
                                .font(Typography.caption())
                                .foregroundStyle(.orange)
                                .labelStyle(.titleAndIcon)
                        }
                    }
                    HStack(spacing: 8) {
                        if let domain = item.domain {
                            Text(domain.capitalized)
                                .rationCaption()
                        }
                        if !item.tags.isEmpty {
                            Text(item.tags.map { Tag.displayName(from: $0) }.joined(separator: ", "))
                                .rationCaption()
                                .foregroundStyle(Theme.muted)
                                .lineLimit(1)
                        }
                    }
                    if let expiresAt = item.expiresAt {
                        Text("Expires \(expiresAt.formatted(date: .abbreviated, time: .omitted))")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                DisplayQuantityLabel(
                    quantity: item.quantity,
                    unit: item.unit,
                    ingredientName: item.name
                )
                .rationCaption()

                Button(action: onStartEdit) {
                    Image(systemName: "pencil")
                        .foregroundStyle(Theme.muted)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Edit item")
            }
        }
    }
}
