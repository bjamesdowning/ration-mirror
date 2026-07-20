import SwiftUI

/// Warning badge for meals that contain user-selected dietary restrictions.
/// Renders nothing when `triggered` is empty.
struct AllergenWarningBadge: View {
    /// Detected allergen slugs for this meal.
    let triggered: [String]
    /// Compact mode — icon only (list rows). Full mode shows labels (detail).
    var compact = false

    var body: some View {
        if !triggered.isEmpty {
            if compact {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(Theme.warning)
                    .accessibilityLabel(accessibilitySummary)
            } else {
                HStack(alignment: .top, spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption)
                        .foregroundStyle(Theme.warning)
                        .padding(.top, 2)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Contains allergens")
                            .font(Typography.caption())
                            .fontWeight(.semibold)
                            .foregroundStyle(Theme.warning)
                        Text(AllergenCatalog.labels(for: triggered).joined(separator: ", "))
                            .font(Typography.caption())
                            .foregroundStyle(Theme.warning.opacity(0.85))
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Theme.warning.opacity(0.12))
                .overlay(
                    RoundedRectangle(cornerRadius: 10)
                        .stroke(Theme.warning.opacity(0.3), lineWidth: 1)
                )
                .clipShape(RoundedRectangle(cornerRadius: 10))
                .accessibilityElement(children: .combine)
                .accessibilityLabel(accessibilitySummary)
            }
        }
    }

    private var accessibilitySummary: String {
        let labels = AllergenCatalog.labels(for: triggered).joined(separator: ", ")
        return "Contains allergens: \(labels)"
    }
}
