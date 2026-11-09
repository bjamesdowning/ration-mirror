import Foundation

/// Optional empty targets after Macro Tracking is on.
/// Draft copy, pending review. No calculator and no suggested numbers.
enum OptionalGoalsPolicy {
    static let draftCopy = "Enter targets you already use"
    static let notMedical = "Not medical advice. Goals and totals are planning aids only."

    static func stepVisible(
        macroTrackingOn: Bool,
        fastLogEnabled: Bool,
        goalsEnabled: Bool,
        appVersion: String
    ) -> Bool {
        guard macroTrackingOn else { return false }
        guard HubCapturePolicy.isAtLeast(appVersion, HubCapturePolicy.iosMinimum) else {
            return false
        }
        return fastLogEnabled || goalsEnabled
    }

    /// Skip and a blank form return nil. Nothing is written.
    static func write(
        dailyEnergyKcal: String,
        proteinG: String,
        carbsG: String,
        fatG: String,
        fiberG: String,
        goalsEnabled: Bool
    ) -> (energy: Double?, protein: Double?, carbs: Double?, fat: Double?, fiber: Double?)? {
        guard goalsEnabled else { return nil }
        let energy = parse(dailyEnergyKcal)
        let protein = parse(proteinG)
        let carbs = parse(carbsG)
        let fat = parse(fatG)
        let fiber = parse(fiberG)
        if energy == nil && protein == nil && carbs == nil && fat == nil && fiber == nil {
            return nil
        }
        return (energy, protein, carbs, fat, fiber)
    }

    private static func parse(_ raw: String) -> Double? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, let value = Double(trimmed), value.isFinite, value >= 0 else {
            return nil
        }
        return value
    }
}
