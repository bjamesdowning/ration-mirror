import SwiftUI

// MARK: - Shared telemetry strip primitives

struct TelemetryTagChip: View {
    let tag: String

    var body: some View {
        Text(tag)
            .font(Typography.caption())
            .foregroundStyle(Theme.tagChipForeground)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Theme.tagChipBackground)
            .clipShape(Capsule())
    }
}

struct TelemetryTypeBadge: View {
    let label: String

    var body: some View {
        Text(label)
            .font(Typography.caption())
            .foregroundStyle(Theme.carbon)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(Theme.platinum)
            .clipShape(Capsule())
    }
}

struct TelemetryQtyPill: View {
    let quantity: String
    let unit: String

    var body: some View {
        Text("\(quantity) \(unit)")
            .font(Typography.dataCaption())
            .foregroundStyle(Theme.carbon)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Theme.platinum)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}

// MARK: - Cargo row

/// Telemetry Strip row — web `CargoListRow` parity.
struct CargoRowView: View {
    let item: CargoItem

    var body: some View {
        HStack(alignment: .center, spacing: 10) {
            Circle()
                .fill(statusColor)
                .frame(width: 8, height: 8)

            VStack(alignment: .leading, spacing: 4) {
                Text(item.name.capitalized)
                    .rationBody()
                    .lineLimit(1)
                if !item.tags.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(item.tags.prefix(2), id: \.self) { tag in
                            TelemetryTagChip(tag: tag)
                        }
                        if item.tags.count > 2 {
                            Text("+\(item.tags.count - 2)")
                                .rationCaption()
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
            }

            Spacer(minLength: 8)

            VStack(alignment: .trailing, spacing: 4) {
                TelemetryQtyPill(
                    quantity: item.quantity.formatted(),
                    unit: item.unit
                )

                if let expiresAt = item.expiresAt {
                    HubUrgencyLabel(date: expiresAt, isExpired: item.status == "expired")
                }
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(cargoAccessibilityLabel)
    }

    private var cargoAccessibilityLabel: String {
        var parts = [item.name.capitalized, "\(item.quantity.formatted()) \(item.unit)"]
        if let expiresAt = item.expiresAt {
            parts.append("expires \(expiresAt.formatted(date: .abbreviated, time: .omitted))")
        }
        if !item.tags.isEmpty {
            parts.append("\(item.tags.count) tags")
        }
        return parts.joined(separator: ", ")
    }

    private var statusColor: Color {
        if let expiresAt = item.expiresAt, expiresAt < Date() {
            return Theme.danger
        }
        switch item.status {
        case "expiring": return Theme.warning
        case "low": return Theme.warning
        case "expired": return Theme.danger
        default: return Theme.hyperGreen
        }
    }
}

// MARK: - Meal row

/// Telemetry Strip row for Galley meals; match mode uses the same layout with `HubMatchRing`.
struct MealRowView: View {
    let meal: Meal
    var match: MealMatch?
    var showMatchRing: Bool = true

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let match, showMatchRing {
                HubMatchRing(percentage: match.matchPercentage)
                    .accessibilityLabel("\(Int(match.matchPercentage)) percent ingredient match")
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(meal.name.capitalized)
                    .rationBody()
                    .lineLimit(1)

                HStack(spacing: 6) {
                    TelemetryTypeBadge(label: meal.type.capitalized)
                    if !meal.ingredients.isEmpty {
                        Text("\(meal.ingredients.count) ing")
                            .rationCaption()
                    }
                    if let prep = meal.prepTime {
                        Text("\(prep)m")
                            .rationCaption()
                    }
                    if let servings = meal.servings {
                        Text("\(servings) srv")
                            .rationCaption()
                    }
                }

                if !meal.tags.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(meal.tags.prefix(2), id: \.self) { tag in
                            TelemetryTagChip(tag: tag)
                        }
                        if meal.tags.count > 2 {
                            Text("+\(meal.tags.count - 2)")
                                .rationCaption()
                                .foregroundStyle(Theme.muted)
                        }
                    }
                }
            }
        }
        .padding(.vertical, 6)
        .accessibilityElement(children: .combine)
        .accessibilityLabel(mealAccessibilityLabel)
    }

    private var mealAccessibilityLabel: String {
        var parts = [meal.name.capitalized, meal.type.capitalized]
        if !meal.ingredients.isEmpty {
            parts.append("\(meal.ingredients.count) ingredients")
        }
        if let prep = meal.prepTime {
            parts.append("\(prep) minutes prep")
        }
        if let servings = meal.servings {
            parts.append("\(servings) servings")
        }
        if let match {
            parts.append("\(Int(match.matchPercentage)) percent match")
        }
        return parts.joined(separator: ", ")
    }
}

// MARK: - Manifest row

struct ManifestEntryRow: View {
    let entry: ManifestEntry
    let onConsume: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            SlotGlyphView(slotType: entry.slotType)
            NavigationLink {
                MealDetailView(
                    mealId: entry.mealId,
                    initialMeal: entry.manifestStubMeal()
                )
            } label: {
                VStack(alignment: .leading, spacing: 4) {
                    Text(entry.mealName.capitalized)
                        .rationBody()
                        .strikethrough(entry.isConsumed)
                        .foregroundStyle(entry.isConsumed ? Theme.muted : Theme.carbon)
                    Text(entry.mealType.capitalized)
                        .rationCaption()
                }
            }
            .buttonStyle(.plain)
            Spacer()
            if entry.isConsumed {
                Image(systemName: "checkmark.seal.fill")
                    .foregroundStyle(Theme.hyperGreen)
                    .accessibilityLabel("Consumed")
            } else {
                Button(action: onConsume) {
                    Image(systemName: "fork.knife.circle.fill")
                        .font(Typography.mono(28))
                        .foregroundStyle(Theme.hyperGreen)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Consume meal and deduct from Cargo")
            }
        }
        .padding(.vertical, 4)
    }
}

private extension ManifestEntry {
    func manifestStubMeal() -> Meal {
        Meal(
            id: mealId,
            organizationId: "",
            name: mealName,
            domain: "food",
            type: mealType,
            description: nil,
            directions: nil,
            equipment: [],
            servings: mealServings,
            prepTime: mealPrepTime,
            cookTime: mealCookTime,
            createdAt: Date(),
            updatedAt: Date(),
            tags: [],
            ingredients: []
        )
    }
}
