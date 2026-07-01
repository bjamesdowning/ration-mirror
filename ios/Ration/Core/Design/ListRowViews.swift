import SwiftUI

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
                            Text(tag)
                                .font(Typography.caption())
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Theme.platinum)
                                .clipShape(Capsule())
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
                Text("\(item.quantity.formatted()) \(item.unit)")
                    .font(Typography.caption())
                    .foregroundStyle(Theme.carbon)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Theme.platinum)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                if let expiresAt = item.expiresAt {
                    HubUrgencyLabel(date: expiresAt)
                }
            }
        }
        .padding(.vertical, 6)
    }

    private var statusColor: Color {
        if let expiresAt = item.expiresAt, expiresAt < Date() {
            return Theme.danger
        }
        switch item.status {
        case "expiring": return Theme.warning
        case "low": return Theme.warning
        default: return Theme.hyperGreen
        }
    }
}

/// Telemetry Strip row for Galley meals.
struct MealRowView: View {
    let meal: Meal
    var match: MealMatch?

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            if let match {
                HubMatchRing(percentage: match.matchPercentage)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text(meal.name.capitalized)
                    .rationBody()
                    .lineLimit(1)

                HStack(spacing: 8) {
                    Label(meal.type.capitalized, systemImage: "circle.hexagongrid")
                    if let prep = meal.prepTime {
                        Label("\(prep)m", systemImage: "timer")
                    }
                    if let servings = meal.servings {
                        Label("\(servings)", systemImage: "person.2")
                    }
                }
                .rationCaption()

                if !meal.tags.isEmpty {
                    HStack(spacing: 4) {
                        ForEach(meal.tags.prefix(2), id: \.self) { tag in
                            Text(tag)
                                .font(Typography.caption())
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Theme.platinum)
                                .clipShape(Capsule())
                        }
                    }
                }

                if let match, !match.canMake {
                    Text("\(Int(match.matchPercentage))% match")
                        .rationCaption()
                        .foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.vertical, 6)
    }
}
