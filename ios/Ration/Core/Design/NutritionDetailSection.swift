import SwiftUI

/// Read-only nutrition summary for Cargo / Galley detail (gated by `nutritionEngine`).
struct NutritionDetailSection: View {
    let title: String
    let nutrients: NutrientValues?
    let provenance: String
    var coverage: Double? = nil
    var emptyMessage: String = "No nutrition data yet for this item."

    var body: some View {
        GlassCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(title).rationHeadline()
                    Spacer()
                    Text(provenance)
                        .rationCaption()
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.platinum.opacity(0.35))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }

                if let nutrients, nutrients.hasAnyMacro {
                    macroRow("Calories", value: formatEnergy(nutrients.energyKcal))
                    macroRow("Protein", value: formatGrams(nutrients.proteinG))
                    macroRow("Carbs", value: formatGrams(nutrients.carbG))
                    macroRow("Fat", value: formatGrams(nutrients.fatG))
                    if let fiber = nutrients.fiberG {
                        macroRow("Fiber", value: formatGrams(fiber))
                    }
                    if let coverage, coverage > 0 {
                        Text("Coverage \(Int((coverage * 100).rounded()))%")
                            .rationCaption()
                            .foregroundStyle(Theme.muted)
                    }
                } else {
                    Text(emptyMessage)
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(title)
    }

    private func macroRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundStyle(Theme.muted)
                .monospacedDigit()
        }
        .font(.subheadline)
    }

    private func formatEnergy(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        return "\(Int(value.rounded())) kcal"
    }

    private func formatGrams(_ value: Double?) -> String {
        guard let value, value.isFinite else { return "—" }
        if value.truncatingRemainder(dividingBy: 1) == 0 {
            return "\(Int(value)) g"
        }
        return String(format: "%.1f g", value)
    }
}
