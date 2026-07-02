import Foundation

enum ConnectedMealsSort: String, CaseIterable {
    case alphabetical
    case quantityNeeded
    case connectionType
}

enum ConnectedMealsPresentation {
    static func connectionTypeLabel(_ connectionType: String) -> String {
        switch connectionType {
        case "direct": "Direct Link"
        case "name_match": "Name Match"
        default: connectionType.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    static func sort(_ meals: [ConnectedCargoMeal], by sort: ConnectedMealsSort) -> [ConnectedCargoMeal] {
        switch sort {
        case .alphabetical:
            meals.sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
        case .quantityNeeded:
            meals.sorted {
                totalQuantity(for: $0) > totalQuantity(for: $1)
            }
        case .connectionType:
            meals.sorted {
                primaryConnectionRank(for: $0) < primaryConnectionRank(for: $1)
            }
        }
    }

    static func coverageLabel(
        needed: Double,
        onHand: Double,
        unit: String,
        onHandUnit: String
    ) -> String {
        let neededText = "\(needed.formatted()) \(unit) needed"
        guard unitsMatch(unit, onHandUnit) else {
            return neededText
        }
        if onHand >= needed {
            return "\(neededText) · have \(onHand.formatted()) \(onHandUnit)"
        }
        return neededText
    }

    static func unitsMatch(_ lhs: String, _ rhs: String) -> Bool {
        lhs.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            == rhs.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    static func totalQuantity(for meal: ConnectedCargoMeal) -> Double {
        meal.connectedIngredients.reduce(0) { $0 + $1.quantity }
    }

    private static func primaryConnectionRank(for meal: ConnectedCargoMeal) -> Int {
        if meal.connectedIngredients.contains(where: { $0.connectionType == "direct" }) {
            return 0
        }
        if meal.connectedIngredients.contains(where: { $0.connectionType == "name_match" }) {
            return 1
        }
        return 2
    }
}
