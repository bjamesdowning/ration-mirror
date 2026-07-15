import Foundation

struct EditableScanResultItem: Identifiable, Equatable, Sendable {
    let id: String
    var name: String
    var quantity: Double
    var unit: String
    var domain: String?
    var tags: [String]
    var expiresAt: Date?
    var confidence: Double?
    var selected: Bool

    init(from item: ScanResultItem, selected: Bool = true) {
        id = item.id
        name = item.name
        quantity = item.quantity
        unit = item.unit
        domain = item.domain
        tags = item.tags ?? []
        if let expiresAtString = item.expiresAt {
            expiresAt = ISO8601DateFormatter.rationFractional.date(from: expiresAtString)
                ?? ISO8601DateFormatter.rationBasic.date(from: expiresAtString)
        } else {
            expiresAt = nil
        }
        confidence = item.confidence
        self.selected = selected
    }

    var isLowConfidence: Bool {
        (confidence ?? 1) < 0.7
    }

    var hasExpiry: Bool {
        expiresAt != nil
    }

    static func formatQuantity(_ value: Double) -> String {
        if value.truncatingRemainder(dividingBy: 1) == 0 {
            return String(format: "%.0f", value)
        }
        return String(value)
    }

    enum SaveResult: Equatable {
        case saved(EditableScanResultItem)
        case invalidName(String)
        case invalidQuantity(String)
    }

    func applyingEdit(
        name rawName: String,
        quantityText: String,
        unit: String,
        domain: String,
        tags: [String],
        hasExpiry: Bool,
        expiresAt: Date?
    ) -> SaveResult {
        let trimmed = rawName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return .invalidName("Enter an item name.")
        }
        switch QuantityValidation.validate(quantityText) {
        case let .valid(qty):
            var updated = self
            updated.name = trimmed
            updated.quantity = qty
            updated.unit = unit.isEmpty ? "unit" : unit
            updated.domain = domain
            updated.tags = tags
            updated.expiresAt = hasExpiry ? expiresAt : nil
            return .saved(updated)
        case let .invalid(message):
            return .invalidQuantity(message)
        }
    }

    func applyingEdit(name rawName: String, quantityText: String, unit: String) -> SaveResult {
        applyingEdit(
            name: rawName,
            quantityText: quantityText,
            unit: unit,
            domain: domain ?? "food",
            tags: tags,
            hasExpiry: expiresAt != nil,
            expiresAt: expiresAt
        )
    }

    func toBatchCargoItem() -> BatchCargoItem {
        BatchCargoItem(
            name: name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
            quantity: quantity,
            unit: unit.isEmpty ? "unit" : unit,
            domain: domain ?? "food",
            tags: tags,
            expiresAt: expiresAt
        )
    }
}

private extension ISO8601DateFormatter {
    static let rationFractional: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    static let rationBasic: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()
}
