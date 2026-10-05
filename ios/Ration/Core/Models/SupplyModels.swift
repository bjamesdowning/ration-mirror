import Foundation

// MARK: - Supply

enum SupplyItemOrigin: String, Codable, Sendable, Hashable, CaseIterable {
    case manifest
    case galley
    case cargo
    case manual

    var displayName: String {
        switch self {
        case .manifest: "Manifest"
        case .galley: "Galley"
        case .cargo: "Cargo"
        case .manual: "Manual"
        }
    }

    var systemImage: String {
        switch self {
        case .manifest: "calendar"
        case .galley: "fork.knife"
        case .cargo: "shippingbox"
        case .manual: "pencil"
        }
    }

    static let displayOrder: [SupplyItemOrigin] = [.manifest, .galley, .cargo, .manual]
}

struct SupplyItem: Codable, Sendable, Identifiable, Hashable {
    let id: String
    let name: String
    let quantity: Double
    let unit: String
    let baseQuantity: Double
    let baseUnit: String
    let domain: String
    let isPurchased: Bool
    let sourceOrigins: [SupplyItemOrigin]?

    init(
        id: String,
        name: String,
        quantity: Double,
        unit: String,
        domain: String,
        isPurchased: Bool,
        sourceOrigins: [SupplyItemOrigin]? = nil,
        baseQuantity: Double? = nil,
        baseUnit: String? = nil
    ) {
        self.id = id
        self.name = name
        self.quantity = quantity
        self.unit = unit
        self.baseQuantity = baseQuantity ?? quantity
        self.baseUnit = baseUnit ?? unit
        self.domain = domain
        self.isPurchased = isPurchased
        self.sourceOrigins = sourceOrigins
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        name = try c.decode(String.self, forKey: .name)
        quantity = try c.decode(Double.self, forKey: .quantity)
        unit = try c.decode(String.self, forKey: .unit)
        baseQuantity = try c.decodeIfPresent(Double.self, forKey: .baseQuantity) ?? quantity
        baseUnit = try c.decodeIfPresent(String.self, forKey: .baseUnit) ?? unit
        domain = try c.decode(String.self, forKey: .domain)
        isPurchased = try c.decode(Bool.self, forKey: .isPurchased)
        sourceOrigins = try c.decodeIfPresent([SupplyItemOrigin].self, forKey: .sourceOrigins)
    }

    var resolvedSourceOrigins: [SupplyItemOrigin] {
        guard let sourceOrigins else { return [] }
        return SupplyItemOrigin.displayOrder.filter { sourceOrigins.contains($0) }
    }
}

struct SupplyList: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let items: [SupplyItem]
    /// Full-list counts from hub API (items array may be sliced).
    let itemCount: Int?
    let uncheckedCount: Int?
    let purchasedCount: Int?

    init(
        id: String,
        name: String,
        items: [SupplyItem],
        itemCount: Int? = nil,
        uncheckedCount: Int? = nil,
        purchasedCount: Int? = nil
    ) {
        self.id = id
        self.name = name
        self.items = items
        self.itemCount = itemCount
        self.uncheckedCount = uncheckedCount
        self.purchasedCount = purchasedCount
    }

    var resolvedItemCount: Int { itemCount ?? items.count }
    var resolvedUncheckedCount: Int {
        uncheckedCount ?? items.filter { !$0.isPurchased }.count
    }
    var resolvedPurchasedCount: Int {
        purchasedCount ?? items.filter(\.isPurchased).count
    }

    func withItemPurchaseState(_ itemId: String, isPurchased: Bool) -> SupplyList {
        guard let index = items.firstIndex(where: { $0.id == itemId }) else { return self }
        let existing = items[index]
        guard existing.isPurchased != isPurchased else { return self }

        var updatedItems = items
        updatedItems[index] = SupplyItem(
            id: existing.id,
            name: existing.name,
            quantity: existing.quantity,
            unit: existing.unit,
            domain: existing.domain,
            isPurchased: isPurchased,
            sourceOrigins: existing.sourceOrigins
        )

        var newUnchecked = resolvedUncheckedCount
        var newPurchased = resolvedPurchasedCount
        if isPurchased {
            newUnchecked = max(0, newUnchecked - 1)
            newPurchased += 1
        } else {
            newUnchecked += 1
            newPurchased = max(0, newPurchased - 1)
        }

        return SupplyList(
            id: id,
            name: name,
            items: updatedItems,
            itemCount: resolvedItemCount,
            uncheckedCount: newUnchecked,
            purchasedCount: newPurchased
        )
    }
}

/// `GET /api/mobile/v1/supply`
struct SupplyResponse: Codable, Sendable {
    let list: SupplyList?
}

struct CreateSupplyItemRequest: Encodable, Sendable {
    let name: String
    var quantity: Double = 1
    var unit: String = "unit"
    var domain: String = "food"
}

struct CreateSupplyItemResponse: Codable, Sendable {
    let item: SupplyItem
}

// MARK: - Supply sync / dock

struct SupplySyncResponse: Codable, Sendable {
    let list: SupplyList
    let summary: SupplySyncSummary
}

struct SupplySyncSummary: Codable, Sendable {
    let addedItems: Int?
    let skippedItems: Int?
    let mealsProcessed: Int?
    let totalIngredients: Int?

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        addedItems = try c.decodeIfPresent(Int.self, forKey: .addedItems)
            ?? c.decodeIfPresent(Int.self, forKey: .added)
        skippedItems = try c.decodeIfPresent(Int.self, forKey: .skippedItems)
            ?? c.decodeIfPresent(Int.self, forKey: .removed)
        mealsProcessed = try c.decodeIfPresent(Int.self, forKey: .mealsProcessed)
        totalIngredients = try c.decodeIfPresent(Int.self, forKey: .totalIngredients)
            ?? c.decodeIfPresent(Int.self, forKey: .updated)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(addedItems, forKey: .addedItems)
        try c.encodeIfPresent(skippedItems, forKey: .skippedItems)
        try c.encodeIfPresent(mealsProcessed, forKey: .mealsProcessed)
        try c.encodeIfPresent(totalIngredients, forKey: .totalIngredients)
    }

    private enum CodingKeys: String, CodingKey {
        case addedItems, skippedItems, mealsProcessed, totalIngredients
        case added, updated, removed
    }
}

struct SupplySnooze: Codable, Sendable, Identifiable {
    let id: String
    let normalizedName: String
    let domain: String
    let snoozedUntil: Date
    let createdAt: Date

    var displayName: String { normalizedName.replacingOccurrences(of: "-", with: " ") }
}

struct SupplySnoozesResponse: Codable, Sendable {
    let snoozes: [SupplySnooze]
}

struct SupplySnoozeResponse: Codable, Sendable {
    let snoozed: Bool
    let snoozedUntil: Date?
}

struct SupplyUnsnoozeResponse: Codable, Sendable {
    let unsnoozed: Bool
}

struct SupplyCatalogSummary: Codable, Sendable, Identifiable {
    let id: String
    let name: String
    let kind: String?
    let state: String?
    let itemCount: Int?
    let purchasedCount: Int?
    let revision: Int?
}

struct SupplyCatalogCapacity: Codable, Sendable {
    let current: Int
    let limit: Int
    let canAdd: Int?
}

struct SupplyCatalogResponse: Codable, Sendable {
    let live: SupplyCatalogSummary?
    let saved: [SupplyCatalogSummary]
    let templates: [SupplyCatalogSummary]
    let archived: [SupplyCatalogSummary]
    let capacity: SupplyCatalogCapacity?
}

struct SupplyCatalogCreateRequest: Codable, Sendable {
    let name: String
    let kind: String
    let seed: Seed?

    struct Seed: Codable, Sendable {
        let type: String
        let sourceListId: String?
    }
}

struct SupplyDuplicateRequest: Codable, Sendable {
    let name: String?
}

struct SupplyCopyToLiveRequest: Codable, Sendable {
    let mode: String
}

struct SupplyFromReceiptItem: Codable, Sendable {
    let name: String
    let quantity: Double
    let unit: String
    let domain: String
}

struct SupplyFromReceiptRequest: Codable, Sendable {
    let scanRequestId: String
    let name: String
    let items: [SupplyFromReceiptItem]
}

struct SupplyBarcodeRequest: Codable, Sendable {
    let barcode: String
}

struct SupplyOutboxOperation: Codable, Sendable {
    let operationId: String
    let type: String
    let itemId: String?
    let payload: Payload?

    struct Payload: Codable, Sendable {
        var name: String?
        var quantity: Double?
        var unit: String?
        var isPurchased: Bool?
    }
}

struct SupplyOperationsRequest: Codable, Sendable {
    let baseRevision: Int
    let operations: [SupplyOutboxOperation]
}

struct SupplyCompleteRequest: Encodable, Sendable {
    let listId: String
}

struct SupplyCompleteResponse: Codable, Sendable {
    let success: Bool
    let docked: Int
    let message: String?
}
