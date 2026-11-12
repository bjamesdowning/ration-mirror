import CoreGraphics
import Foundation

/// Slot layout for cargo lines on a Manifest day.
enum CargoManifestSlot {
    /// Same hit target as the meal row's Cook or Fuel control.
    static let controlPoints: CGFloat = 44

    /// A cargo-only slot does not render the empty meal button.
    /// Add entry remains the way to add a meal.
    static func showsEmptyMealButton(mealCount: Int, cargoLineCount: Int) -> Bool {
        mealCount == 0 && cargoLineCount == 0
    }

    /// Cooked cargo rows strike through the same way meal rows do.
    static func struckThrough(cookedAt: String?) -> Bool {
        cookedAt != nil
    }
}

/// Routes a cargo Manifest line already has on the server.
enum CargoManifestRoutes {
    static let diaryPath = "nutrition/diary"

    static func linePath(_ id: String) -> String {
        "manifest/cargo-lines/\(id)"
    }

    static func cookPath(_ id: String) -> String {
        "manifest/cargo-lines/\(id)/cook"
    }

    /// One cook POST, then the amount sheet logs diary food. Not add-to-fuel.
    static func cookThenLogPaths(lineId: String) -> [String] {
        [cookPath(lineId), diaryPath]
    }
}

enum CargoManifestLineFailure {
    /// Cook, edit, and delete failures stay on screen. `try?` is not used.
    static func message(for error: Error) -> String {
        if let api = error as? APIError, let text = api.errorDescription, !text.isEmpty {
            return text
        }
        let text = error.localizedDescription.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty {
            return "Something went wrong. Please try again."
        }
        return text
    }
}

/// Diary body for a cooked cargo line. Logging does not deduct again.
enum CargoManifestFuelLog {
    static func body(
        name: String,
        quantity: Double,
        unit: String,
        notes: String?,
        nutrition: NutritionSnapshot?,
        editedEnergy: Double?,
        operationKey: String,
        occurredAt: String
    ) -> DiaryFoodBody {
        let scaled = CargoEatMacroEstimate.scaled(
            nutrition: nutrition,
            quantity: quantity,
            unit: unit
        )
        return DiaryFoodBody(
            name: name,
            occurredAt: occurredAt,
            amount: quantity,
            unit: unit,
            macros: DiaryMacrosBody(
                energyKcal: editedEnergy ?? scaled.energyKcal ?? 0,
                proteinG: scaled.proteinG ?? 0,
                carbsG: scaled.carbsG ?? 0,
                fatG: scaled.fatG ?? 0
            ),
            idempotencyKey: operationKey,
            operationKey: operationKey,
            compositionSource: "manual_macros",
            notes: notes
        )
    }
}
