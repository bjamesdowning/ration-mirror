import Foundation

/// Scan to Fuel explainer. The medical line is its own sentence.
enum FuelScanCopy {
    static let nextSteps = "A photo is taken, analyzed by AI, you can edit what it finds, then add it to Fuel."
    static let notMedicalAdvice = "Not medical advice."
    static let unavailable = "Photo food log is unavailable."
    static let analyzing = "Analyzing"
    static let analyzingDetail = "This usually takes a few seconds."
    static let readyTitle = "Ready to review"
    static let readyCount = "1 item found"
    static let readyHint = "AI estimate. Tap edit to adjust name, amount, unit, calories, protein, carbs, or fat."
    static let addToFuel = "Add to Fuel"
    /// Fuel log detail footer for an AI estimate.
    static let estimateDetail = "AI estimate. Change any number to adjust it."
    /// Log to Fuel helper under Shutter and Barcode.
    static let draftHint = "A photo or barcode fills this draft. Photo numbers are AI estimates you can change. It is not logged until you save."

    /// Fuel row caption: "320 kcal", or "320 kcal · AI estimate".
    static func rowCalories(_ energyKcal: Double, estimate: Bool) -> String {
        let kcal = "\(Int(energyKcal.rounded())) kcal"
        return estimate ? "\(kcal) · AI estimate" : kcal
    }
}
