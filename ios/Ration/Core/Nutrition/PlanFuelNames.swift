import Foundation

/// Flag-on names for Manifest and Log to Fuel. Flag off keeps the existing strings.
enum PlanFuelNames {
    struct Snapshot: Equatable {
        let emptyState: String
        let addSheetTitle: String
        let plateUpTitle: String
        let plateUpAmountHeader: String
        let logToFuelSymbol: String
    }

    static func snapshot(planFuelActions: Bool) -> Snapshot {
        if planFuelActions {
            return Snapshot(
                emptyState: "Add to Manifest",
                addSheetTitle: "Add to Manifest",
                plateUpTitle: "Fuel",
                plateUpAmountHeader: "Amount",
                logToFuelSymbol: "flame.fill"
            )
        }
        return Snapshot(
            emptyState: "Add to plan",
            addSheetTitle: "Add to plan",
            plateUpTitle: "Eat",
            plateUpAmountHeader: "How much did you eat?",
            logToFuelSymbol: "fork.knife"
        )
    }
}
