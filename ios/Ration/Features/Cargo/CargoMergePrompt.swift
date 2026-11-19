import Foundation

enum CargoMergeChoice: Equatable, Sendable {
    case merge
    case createNew
}

/// Copy for the manual-add prompt. Matches the web cargo form.
enum CargoMergePrompt {
    static let title = "Potential duplicate found"
    static let addToExistingTitle = "Add to Existing"
    static let createNewTitle = "Create New Item"

    static func message(for candidate: CargoMergeCandidate) -> String {
        let adding = QuantityPresenter.present(
            quantity: candidate.convertedQuantity,
            unit: candidate.unit,
            ingredientName: candidate.name,
            mode: .original
        )
        return "Potential duplicate found: \(candidate.name) (\(plain(candidate.quantity)) \(candidate.unit)). Add \(adding) to the existing item, or create a new row?"
    }

    private static func plain(_ quantity: Double) -> String {
        guard quantity.isFinite, quantity.rounded(.towardZero) == quantity else {
            return String(quantity)
        }
        return String(Int(quantity))
    }
}
